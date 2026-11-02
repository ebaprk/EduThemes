begin;

-- Screening stays outside research submissions and model inputs.
alter table public.studies add column recruitment_draft jsonb not null default '{"enabled":false}'::jsonb;
alter table public.study_versions add column recruitment jsonb not null default '{"enabled":false}'::jsonb;

create function public.private_validate_recruitment(p_config jsonb, p_mode text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare q jsonb; o jsonb; prior jsonb; clean jsonb := '[]'; opts jsonb; ids text[] := '{}'; option_ids text[];
  output jsonb; condition jsonb;
begin
  if p_config is null then return '{"enabled":false}'::jsonb; end if;
  if jsonb_typeof(p_config) <> 'object' or (p_config ? 'enabled' and jsonb_typeof(p_config->'enabled') <> 'boolean') then
    raise exception 'Check the screening settings';
  end if;
  if coalesce((p_config->>'enabled')::boolean,false) is not true then return '{"enabled":false}'::jsonb; end if;
  if p_mode <> 'anonymous' then raise exception 'Screened recruitment uses private study links. Choose anonymous participation'; end if;
  if length(trim(coalesce(p_config->>'notice',''))) not between 1 and 10000
    or length(trim(coalesce(p_config->>'eligibility',''))) not between 1 and 2000
    or length(trim(coalesce(p_config->>'location',''))) not between 1 and 300
    or coalesce(p_config->>'estimated_minutes','') !~ '^[0-9]{1,4}$'
    or (p_config->>'estimated_minutes')::integer not between 1 and 1440 then
    raise exception 'Add screening information, eligibility, location, and a time estimate';
  end if;
  if jsonb_typeof(p_config->'questions') is distinct from 'array' or jsonb_array_length(p_config->'questions') not between 1 and 12 then
    raise exception 'Add between 1 and 12 screening questions';
  end if;
  for q in select value from jsonb_array_elements(p_config->'questions') loop
    if jsonb_typeof(q) <> 'object' or coalesce(q->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$'
      or (q->>'id') = any(ids) or length(trim(coalesce(q->>'prompt',''))) not between 1 and 1000
      or jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 2 and 8 then
      raise exception 'Check screening question IDs, prompts, and answer choices';
    end if;
    opts := '[]'; option_ids := '{}';
    for o in select value from jsonb_array_elements(q->'options') loop
      if jsonb_typeof(o) <> 'object' or coalesce(o->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$'
        or (o->>'id') = any(option_ids) or length(trim(coalesce(o->>'label',''))) not between 1 and 300
        or (o ? 'qualifies' and jsonb_typeof(o->'qualifies') <> 'boolean') then
        raise exception 'Check each screening answer choice';
      end if;
      option_ids := array_append(option_ids,o->>'id');
      opts := opts || jsonb_build_array(jsonb_build_object('id',o->>'id','label',trim(o->>'label'),
        'qualifies',coalesce((o->>'qualifies')::boolean,true)));
    end loop;
    condition := null;
    if q->'show_if' is not null and q->'show_if' <> 'null'::jsonb then
      select value into prior from jsonb_array_elements(clean) where value->>'id' = q->'show_if'->>'question_id';
      if prior is null or not exists (select 1 from jsonb_array_elements(prior->'options') choice
        where choice->>'id' = q->'show_if'->>'option_id') then
        raise exception 'Branching must refer to an answer choice in an earlier screening question';
      end if;
      condition := jsonb_build_object('question_id',q->'show_if'->>'question_id','option_id',q->'show_if'->>'option_id');
    end if;
    clean := clean || jsonb_build_array(jsonb_build_object('id',q->>'id','prompt',trim(q->>'prompt'),'options',opts,'show_if',condition));
    ids := array_append(ids,q->>'id');
  end loop;
  return jsonb_build_object('enabled',true,'notice',trim(p_config->>'notice'),'eligibility',trim(p_config->>'eligibility'),
    'location',trim(p_config->>'location'),'estimated_minutes',(p_config->>'estimated_minutes')::integer,'questions',clean);
end;
$$;

create function public.private_public_recruitment(p_config jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_config->>'enabled' = 'true' then p_config || jsonb_build_object('questions',
    (select jsonb_agg(q || jsonb_build_object('options',
      (select jsonb_agg(o - 'qualifies') from jsonb_array_elements(q->'options') o)))
      from jsonb_array_elements(p_config->'questions') q)) else '{"enabled":false}'::jsonb end;
$$;

alter function public.save_study_draft(uuid,jsonb,integer) rename to private_save_study_draft_base;
revoke all on function public.private_save_study_draft_base(uuid,jsonb,integer) from public,anon,authenticated,service_role;
create function public.save_study_draft(p_study_id uuid,p_form jsonb,p_expected_revision integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare config jsonb; saved uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to save a study'; end if;
  if p_study_id is not null and not public.can_edit_study(p_study_id) then raise exception 'You do not have permission to edit this study'; end if;
  -- Older clients preserve the existing draft rather than dropping screening settings.
  config := case when p_form ? 'recruitment' then p_form->'recruitment'
    else (select recruitment_draft from public.studies where id=p_study_id) end;
  config := public.private_validate_recruitment(config,coalesce(p_form->>'participant_mode','anonymous'));
  saved := public.private_save_study_draft_base(p_study_id,p_form,p_expected_revision);
  update public.studies set recruitment_draft=config where id=saved;
  return saved;
end;
$$;

create function public.guard_recruitment_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.recruitment_draft is distinct from old.recruitment_draft and old.status <> 'draft' then
    raise exception 'Create a new draft before changing screening';
  end if;
  if new.status='open' and old.status='draft' then
    perform public.private_validate_recruitment(new.recruitment_draft,new.participant_mode);
  end if;
  return new;
end;
$$;
create trigger guard_recruitment_draft before update on public.studies for each row execute function public.guard_recruitment_draft();
create function public.freeze_recruitment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status='draft' and new.status='open' then
    update public.study_versions set recruitment=new.recruitment_draft where id=new.current_version_id;
  end if;
  return new;
end;
$$;
create trigger freeze_recruitment after update on public.studies for each row execute function public.freeze_recruitment();

alter function public.get_public_study(text) rename to private_get_public_study_base;
revoke all on function public.private_get_public_study_base(text) from public,anon,authenticated,service_role;
create function public.get_public_study(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.private_get_public_study_base(p_code) || jsonb_build_object('recruitment',public.private_public_recruitment(v.recruitment))
  from public.studies s join public.study_versions v on v.id=s.current_version_id
  where s.share_code=upper(trim(p_code)) and s.status='open';
$$;

create table public.study_applicants (
  id uuid primary key default gen_random_uuid(), study_id uuid not null references public.studies(id) on delete cascade,
  study_version_id uuid not null, access_key_hash text not null unique,
  reference text not null default ('A-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  answers jsonb not null check(jsonb_typeof(answers)='object'),
  rule_result text not null check(rule_result in ('matches','needs_review')),
  status text not null default 'awaiting_review' check(status in ('awaiting_review','eligible','waitlisted','not_eligible','invited')),
  screening_accepted_at timestamptz not null default now(), revision integer not null default 1,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
  review_note text not null default '' check(length(review_note)<=2000),
  foreign key(study_id,study_version_id) references public.study_versions(study_id,id), unique(study_id,reference)
);
create index study_applicants_pipeline_idx on public.study_applicants(study_id,screening_accepted_at desc);
create table public.study_applicant_events (
  id uuid primary key default gen_random_uuid(), applicant_id uuid not null references public.study_applicants(id) on delete cascade,
  previous_status text not null, status text not null, note text not null,
  recorded_at timestamptz not null default now(), recorded_by uuid references auth.users(id) on delete set null
);
alter table public.study_applicants enable row level security;
alter table public.study_applicant_events enable row level security;
revoke all on public.study_applicants,public.study_applicant_events from public,anon,authenticated;

create function public.private_applicant(p_access_key text) returns public.study_applicants
language sql stable security definer set search_path = '' as $$
  select a from public.study_applicants a where p_access_key ~ '^[a-f0-9]{64}$'
    and a.access_key_hash=encode(sha256(convert_to(p_access_key,'UTF8')),'hex');
$$;

create function public.get_participant_recruitment(p_access_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.study_applicants%rowtype; v public.study_versions%rowtype; s public.studies%rowtype; e public.study_enrollments%rowtype;
begin
  a:=public.private_applicant(p_access_key);
  if a.id is null then raise sqlstate 'PT401' using message='This private study link is invalid'; end if;
  select * into v from public.study_versions where id=a.study_version_id;
  select * into s from public.studies where id=a.study_id;
  select * into e from public.study_enrollments where access_key_hash=a.access_key_hash and study_id=a.study_id;
  return jsonb_build_object('recruitment_status',a.status,'reference',a.reference,'title',v.title,'description',v.description,
    'version_id',v.id,'version_number',v.version_number,'study_status',s.status,'screened_at',a.screening_accepted_at,
    'current_version',s.current_version_id=v.id,'can_join',a.status='invited' and s.status='open' and s.current_version_id=v.id and e.id is null,
    'code',s.share_code,'consent_text',v.consent_text,'contact_info',v.contact_info,'compensation_details',v.compensation_details,
    'activities',v.activities,'recruitment',public.private_public_recruitment(v.recruitment));
end;
$$;

create function public.submit_study_screener(p_code text,p_version_id uuid,p_access_key text,p_answers jsonb,p_screening_accepted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.studies%rowtype; v public.study_versions%rowtype; a public.study_applicants%rowtype;
  q jsonb; choice jsonb; visible boolean; visible_answers jsonb:='{}'; matched boolean:=true; entry record;
begin
  if p_access_key is null or p_access_key !~ '^[a-f0-9]{64}$' then raise exception 'A secure private study key is required'; end if;
  if p_screening_accepted is not true then raise exception 'Review and accept the screening information before submitting'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>20000 then raise exception 'Check your screening answers'; end if;
  select * into s from public.studies where share_code=upper(trim(p_code)) for update;
  if s.id is null then raise exception 'This study is unavailable'; end if;
  a:=public.private_applicant(p_access_key);
  if a.id is not null then
    if a.study_id is distinct from s.id or a.study_version_id is distinct from p_version_id or a.answers<>p_answers then
      raise sqlstate 'PT409' using message='This screening was already submitted. Open its private return link';
    end if;
    return public.get_participant_recruitment(p_access_key);
  end if;
  if exists(select 1 from public.study_enrollments where access_key_hash=encode(sha256(convert_to(p_access_key,'UTF8')),'hex')) then
    raise exception 'This private study key is already in use';
  end if;
  if s.status<>'open' then raise exception 'This study is not accepting screening responses'; end if;
  if s.current_version_id is distinct from p_version_id then raise sqlstate 'PT412' using message='The study has changed. Reload before screening'; end if;
  select * into v from public.study_versions where id=p_version_id and study_id=s.id;
  if v.recruitment->>'enabled' is distinct from 'true' then raise exception 'This study does not use a screener'; end if;
  for q in select value from jsonb_array_elements(v.recruitment->'questions') loop
    visible:=q->'show_if' is null or q->'show_if'='null'::jsonb or
      visible_answers->>(q->'show_if'->>'question_id')=q->'show_if'->>'option_id';
    if coalesce(visible,false) then
      if jsonb_typeof(p_answers->(q->>'id')) is distinct from 'string' then raise exception 'Answer each visible screening question'; end if;
      select value into choice from jsonb_array_elements(q->'options') where value->>'id'=p_answers->>(q->>'id');
      if choice is null then raise exception 'Choose one of the listed screening answers'; end if;
      visible_answers:=visible_answers || jsonb_build_object(q->>'id',choice->>'id');
      if choice->>'qualifies'='false' then matched:=false; end if;
    end if;
  end loop;
  if visible_answers<>p_answers then raise exception 'Remove answers to hidden or unknown screening questions'; end if;
  insert into public.study_applicants(study_id,study_version_id,access_key_hash,answers,rule_result)
    values(s.id,v.id,encode(sha256(convert_to(p_access_key,'UTF8')),'hex'),visible_answers,case when matched then 'matches' else 'needs_review' end);
  return public.get_participant_recruitment(p_access_key);
end;
$$;

create function public.review_study_applicant(p_applicant_id uuid,p_status text,p_note text,p_expected_revision integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare a public.study_applicants%rowtype; saved integer; sid uuid;
begin
  select study_id into sid from public.study_applicants where id=p_applicant_id;
  if not public.can_edit_study(sid) then raise exception 'You do not have permission to review recruitment'; end if;
  perform 1 from public.studies where id=sid for update;
  select * into a from public.study_applicants where id=p_applicant_id for update;
  if a.revision is distinct from p_expected_revision then raise sqlstate 'PT409' using message='This application changed. Refresh before reviewing'; end if;
  if p_status is null or p_status not in ('awaiting_review','eligible','waitlisted','not_eligible','invited') or p_note is null or length(p_note)>2000 then
    raise exception 'Choose a recruitment status and a note of at most 2000 characters'; end if;
  if exists(select 1 from public.study_enrollments where access_key_hash=a.access_key_hash and study_id=a.study_id) then
    raise exception 'This participant has already enrolled. Their recruitment decision is retained';
  end if;
  if p_status='invited' and a.status not in ('eligible','invited') then raise exception 'Confirm eligibility before inviting this participant'; end if;
  if p_status='invited' and not exists(select 1 from public.studies where id=a.study_id and status='open' and current_version_id=a.study_version_id) then
    raise exception 'Only invite participants to the current open study version'; end if;
  update public.study_applicants set status=p_status,review_note=trim(p_note),revision=revision+1,updated_at=now(),updated_by=auth.uid()
    where id=a.id returning revision into saved;
  insert into public.study_applicant_events(applicant_id,previous_status,status,note,recorded_by)
    values(a.id,a.status,p_status,trim(p_note),auth.uid());
  return saved;
end;
$$;

-- Server-side gates also cover older participant clients and direct RPC requests.
create function public.guard_screened_enrollment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.study_versions where id=new.study_version_id and recruitment->>'enabled'='true')
    and not exists(select 1 from public.study_applicants where study_id=new.study_id and study_version_id=new.study_version_id
      and access_key_hash=new.access_key_hash and status='invited') then
    raise exception 'Complete screening and wait for a study invitation before joining';
  end if;
  return new;
end;
$$;
create trigger guard_screened_enrollment before insert on public.study_enrollments for each row execute function public.guard_screened_enrollment();
create function public.guard_screened_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.study_versions where id=new.study_version_id and recruitment->>'enabled'='true')
    and (new.enrollment_id is null or not exists(select 1 from public.study_enrollments e join public.study_applicants a
      on a.study_id=e.study_id and a.study_version_id=e.study_version_id and a.access_key_hash=e.access_key_hash
      where e.id=new.enrollment_id and a.status='invited')) then
    raise exception 'Use your invited private study hub to submit responses';
  end if;
  return new;
end;
$$;
create trigger guard_screened_submission before insert on public.study_submissions for each row execute function public.guard_screened_submission();

create function public.enroll_recruited_study(p_access_key text,p_consent_accepted boolean,p_linking_accepted boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.study_applicants%rowtype; s public.studies%rowtype; e public.study_enrollments%rowtype;
begin
  a:=public.private_applicant(p_access_key);
  if a.id is null then raise sqlstate 'PT401' using message='This private study link is invalid'; end if;
  select * into s from public.studies where id=a.study_id for update;
  select * into a from public.study_applicants where id=a.id for update;
  select * into e from public.study_enrollments where access_key_hash=a.access_key_hash and study_id=a.study_id;
  if e.id is not null then return public.get_participant_study(p_access_key); end if;
  if a.status<>'invited' then raise exception 'Wait for a study invitation before joining'; end if;
  if s.status<>'open' then raise exception 'Participation is paused or closed'; end if;
  if s.current_version_id<>a.study_version_id then raise sqlstate 'PT412' using message='The study has a newer version. Contact the study team before joining'; end if;
  if p_consent_accepted is not true or p_linking_accepted is not true then raise exception 'Accept the study consent and linking notice before joining'; end if;
  insert into public.study_enrollments(study_id,study_version_id,access_key_hash) values(a.study_id,a.study_version_id,a.access_key_hash);
  return public.get_participant_study(p_access_key);
end;
$$;

create function public.get_participant_portal(p_access_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (public.private_participation(p_access_key)).id is not null then return public.get_participant_study(p_access_key); end if;
  return jsonb_build_object('screening',public.get_participant_recruitment(p_access_key));
end;
$$;

create function public.get_study_recruitment(p_study_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare applicants jsonb;
begin
  if public.study_role(p_study_id) is null then raise exception 'You do not have access to recruitment'; end if;
  select coalesce(jsonb_agg(item order by screened_at desc),'[]'::jsonb) into applicants from (
    select a.screening_accepted_at as screened_at,jsonb_build_object('id',a.id,'reference',a.reference,
      'version_id',v.id,'version_number',v.version_number,'answers',a.answers,'questions',v.recruitment->'questions',
      'rule_result',a.rule_result,'decision',a.status,'status',case when e.id is null then a.status
        when not exists(select 1 from jsonb_array_elements(v.activities) act where (act->>'required')::boolean
          and not exists(select 1 from public.study_submissions r where r.enrollment_id=e.id and r.activity_id::text=act->>'id'))
        then 'completed' else 'enrolled' end,
      'review_note',a.review_note,'revision',a.revision,'screened_at',a.screening_accepted_at,'updated_at',a.updated_at,
      'current_version',s.current_version_id=v.id,'events',(select coalesce(jsonb_agg(jsonb_build_object('status',ev.status,
        'previous_status',ev.previous_status,'note',ev.note,'recorded_at',ev.recorded_at) order by ev.recorded_at),'[]'::jsonb)
        from public.study_applicant_events ev where ev.applicant_id=a.id)) as item
    from public.study_applicants a join public.study_versions v on v.id=a.study_version_id join public.studies s on s.id=a.study_id
      left join public.study_enrollments e on e.study_id=a.study_id and e.access_key_hash=a.access_key_hash
    where a.study_id=p_study_id
  ) results;
  return jsonb_build_object('applicants',applicants,
    'target',coalesce((select recruitment_target from public.study_operations where study_id=p_study_id),0));
end;
$$;

revoke all on function public.private_validate_recruitment(jsonb,text),public.private_public_recruitment(jsonb),
  public.guard_recruitment_draft(),public.freeze_recruitment(),public.private_applicant(text),
  public.guard_screened_enrollment(),public.guard_screened_submission() from public,anon,authenticated,service_role;
revoke all on function public.save_study_draft(uuid,jsonb,integer),public.get_study_recruitment(uuid),
  public.review_study_applicant(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.save_study_draft(uuid,jsonb,integer),public.get_study_recruitment(uuid),
  public.review_study_applicant(uuid,text,text,integer) to authenticated;
revoke all on function public.get_public_study(text),public.get_participant_recruitment(text),
  public.submit_study_screener(text,uuid,text,jsonb,boolean),public.enroll_recruited_study(text,boolean,boolean),
  public.get_participant_portal(text) from public,anon,authenticated;
grant execute on function public.get_public_study(text),public.get_participant_recruitment(text),
  public.submit_study_screener(text,uuid,text,jsonb,boolean),public.enroll_recruited_study(text,boolean,boolean),
  public.get_participant_portal(text) to anon,authenticated;

commit;
