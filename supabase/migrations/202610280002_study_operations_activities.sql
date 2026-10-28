-- Phase 2.1: operations, immutable activity plans, and study-specific return keys.
-- Existing anonymous submissions remain unlinked; historical consent is unchanged.
begin;

alter table public.studies
  add column activity_plan jsonb not null default '[]'::jsonb check (jsonb_typeof(activity_plan) = 'array'),
  add column compensation_details text not null default '' check (length(compensation_details) <= 2000),
  add column contact_info text not null default '' check (length(contact_info) <= 1000);
alter table public.study_versions
  add column activities jsonb not null default '[]'::jsonb check (jsonb_typeof(activities) = 'array'),
  add column compensation_details text not null default '',
  add column contact_info text not null default '';
alter table public.study_questions add column activity_id uuid;

update public.studies s set activity_plan = jsonb_build_array(jsonb_build_object(
  'id', gen_random_uuid(), 'position', 0, 'title', 'Study response', 'kind', 'survey',
  'instructions', '', 'required', true, 'opens_after_days', 0, 'due_after_days', null,
  'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id,
    'position', q.position, 'prompt', q.prompt) order by q.position)
    from public.study_questions q where q.study_id = s.id), '[]'::jsonb)));
update public.study_questions q set activity_id = (s.activity_plan->0->>'id')::uuid
  from public.studies s where s.id = q.study_id;
update public.study_versions v set activities = jsonb_build_array(jsonb_build_object(
  'id', s.activity_plan->0->>'id', 'position', 0, 'title', 'Study response', 'kind', 'survey',
  'instructions', '', 'required', true, 'opens_after_days', 0, 'due_after_days', null,
  'questions', v.questions)) from public.studies s where s.id = v.study_id;

create table public.study_operations (
  study_id uuid primary key references public.studies(id) on delete cascade,
  recruitment_target integer not null default 0 check (recruitment_target between 0 and 1000000),
  coordinator_notes text not null default '' check (length(coordinator_notes) <= 5000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create table public.study_enrollments (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies(id) on delete cascade,
  study_version_id uuid not null,
  access_key_hash text not null unique,
  participant_reference text not null default ('P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  consent_accepted_at timestamptz not null default now(),
  linking_notice_version text not null default 'study-activities-v1',
  linking_notice_text text not null default 'I agree that my responses and progress across these activities will be linked using a study-specific code.',
  reward_status text not null default 'not_recorded'
    check (reward_status in ('not_recorded', 'not_applicable', 'awaiting_completion', 'ready', 'handed_off', 'confirmed')),
  revision integer not null default 1 check (revision > 0),
  reward_updated_at timestamptz,
  reward_updated_by uuid references auth.users(id) on delete set null,
  unique (study_id, participant_reference),
  foreign key (study_id, study_version_id) references public.study_versions(study_id, id)
);
create index study_enrollments_study_idx on public.study_enrollments(study_id, study_version_id);
create table public.study_activity_progress (
  enrollment_id uuid not null references public.study_enrollments(id) on delete cascade,
  activity_id uuid not null,
  started_at timestamptz not null default now(),
  saved_at timestamptz,
  draft_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_answers) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  primary key (enrollment_id, activity_id)
);
alter table public.study_submissions
  add column activity_id uuid,
  add column enrollment_id uuid references public.study_enrollments(id) on delete restrict,
  add unique (enrollment_id, activity_id);
update public.study_submissions r set activity_id = (v.activities->0->>'id')::uuid
  from public.study_versions v where v.id = r.study_version_id;

-- No participant keys or unfinished answers are readable through table endpoints.
alter table public.study_operations enable row level security;
alter table public.study_enrollments enable row level security;
alter table public.study_activity_progress enable row level security;
revoke all on public.study_operations, public.study_enrollments, public.study_activity_progress
  from public, anon, authenticated;

create or replace function public.save_study_draft(p_study_id uuid, p_form jsonb, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_study_id; s public.studies%rowtype; inputs jsonb; a jsonb; q jsonb;
  plan jsonb := '[]'::jsonb; questions jsonb; aid uuid; qid uuid; pos integer := 0;
  activity_pos integer := 0; opens integer; due integer; required_activity boolean; title text; kind text;
begin
  if auth.uid() is null then raise exception 'Sign in to save a study'; end if;
  if p_form is null or jsonb_typeof(p_form) <> 'object' then raise exception 'A study form is required'; end if;
  if p_form ? 'activities' then inputs := p_form->'activities';
  else inputs := jsonb_build_array(jsonb_build_object('title', 'Study response', 'kind', 'survey',
    'required', true, 'opens_after_days', 0, 'questions', p_form->'questions')); end if;
  if jsonb_typeof(inputs) is distinct from 'array' or jsonb_array_length(inputs) not between 1 and 12 then
    raise exception 'Add between 1 and 12 activities';
  end if;
  if v_id is null then
    insert into public.studies(owner_id, title, research_question)
      values (auth.uid(), trim(p_form->>'title'), trim(p_form->>'research_question')) returning id into v_id;
  else
    if not public.can_edit_study(v_id) then raise exception 'You do not have permission to edit this study'; end if;
    select * into s from public.studies where id = v_id for update;
    if s.status <> 'draft' then raise exception 'Create a new draft before editing'; end if;
    if s.draft_revision is distinct from p_expected_revision then
      raise sqlstate 'PT409' using message = 'Another researcher changed this draft. Refresh before editing';
    end if;
    if jsonb_array_length(s.activity_plan) > 1 and not (p_form ? 'activities') then
      raise exception 'Reload the workspace to edit this multi-activity draft';
    end if;
  end if;
  if jsonb_array_length(inputs) > 1 and coalesce(p_form->>'participant_mode', 'anonymous') <> 'anonymous' then
    raise exception 'The multi-activity pilot uses private study codes. Choose anonymous participation';
  end if;
  delete from public.study_questions where study_id = v_id;
  for a in select value from jsonb_array_elements(inputs) loop
    if jsonb_typeof(a) <> 'object' or jsonb_typeof(a->'questions') is distinct from 'array'
      or jsonb_array_length(a->'questions') not between 1 and 12 then
      raise exception 'Add between 1 and 12 text questions to each activity';
    end if;
    title := trim(coalesce(a->>'title', '')); kind := coalesce(a->>'kind', 'survey');
    if length(title) not between 1 and 120 or kind not in ('survey', 'baseline', 'followup', 'diary')
      or length(coalesce(a->>'instructions', '')) > 5000 then raise exception 'Check the activity title, type, and instructions'; end if;
    if coalesce(a->>'opens_after_days', '0') !~ '^[0-9]{1,4}$'
      or (a->>'due_after_days' is not null and a->>'due_after_days' !~ '^[0-9]{1,4}$') then
      raise exception 'Activity days must be whole numbers between 0 and 3650';
    end if;
    opens := coalesce((a->>'opens_after_days')::integer, 0); due := (a->>'due_after_days')::integer;
    if opens > 3650 or due > 3650 or due < opens or (activity_pos = 0 and opens <> 0) then
      raise exception 'The first activity opens on day 0; due days must follow opening days';
    end if;
    if a ? 'required' and jsonb_typeof(a->'required') <> 'boolean' then raise exception 'Choose whether each activity is required'; end if;
    required_activity := coalesce((a->>'required')::boolean, true);
    aid := gen_random_uuid(); questions := '[]'::jsonb;
    for q in select value from jsonb_array_elements(a->'questions') loop
      if jsonb_typeof(q) <> 'string' then raise exception 'Questions must be text'; end if;
      insert into public.study_questions(study_id, activity_id, position, prompt)
        values (v_id, aid, pos, trim(q #>> '{}')) returning id into qid;
      questions := questions || jsonb_build_array(jsonb_build_object('id', qid, 'activity_id', aid,
        'position', pos, 'prompt', trim(q #>> '{}')));
      pos := pos + 1;
    end loop;
    plan := plan || jsonb_build_array(jsonb_build_object('id', aid, 'position', activity_pos,
      'title', title, 'kind', kind, 'instructions', coalesce(trim(a->>'instructions'), ''),
      'required', required_activity, 'opens_after_days', opens, 'due_after_days', due, 'questions', questions));
    activity_pos := activity_pos + 1;
  end loop;
  if not exists (select 1 from jsonb_array_elements(plan) checked_activity where (checked_activity->>'required')::boolean) then
    raise exception 'Mark at least one activity as required';
  end if;
  update public.studies set title = trim(p_form->>'title'), description = coalesce(trim(p_form->>'description'), ''),
    research_question = trim(p_form->>'research_question'), additional_context = coalesce(trim(p_form->>'additional_context'), ''),
    consent_text = coalesce(trim(p_form->>'consent_text'), ''), participant_mode = coalesce(p_form->>'participant_mode', 'anonymous'),
    activity_plan = plan, compensation_details = coalesce(trim(p_form->>'compensation_details'), ''),
    contact_info = coalesce(trim(p_form->>'contact_info'), ''), draft_revision = draft_revision + 1 where id = v_id;
  return v_id;
end;
$$;

create or replace function public.guard_study_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_questions jsonb; v_version uuid;
begin
  if new.owner_id is distinct from old.owner_id or new.share_code is distinct from old.share_code
    or new.current_version_id is distinct from old.current_version_id or new.published_at is distinct from old.published_at then
    raise exception 'Study ownership, link, and published history cannot be changed';
  end if;
  if new.status is distinct from old.status and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the study owner can publish, close, or revise a study';
  end if;
  if old.status <> 'draft' and (new.title is distinct from old.title or new.description is distinct from old.description
    or new.research_question is distinct from old.research_question or new.additional_context is distinct from old.additional_context
    or new.consent_text is distinct from old.consent_text or new.participant_mode is distinct from old.participant_mode
    or new.activity_plan is distinct from old.activity_plan or new.compensation_details is distinct from old.compensation_details
    or new.contact_info is distinct from old.contact_info) then
    raise exception 'Close this study and create a new draft before editing';
  end if;
  if new.status = 'draft' and old.status = 'open' then raise exception 'Close this study before creating a new draft'; end if;
  if old.status = 'draft' and new.status = 'closed' then raise exception 'Publish a draft before closing it'; end if;
  if old.status = 'draft' and new.status = 'open' then
    if length(trim(new.consent_text)) = 0 then raise exception 'Add participant consent text before publishing'; end if;
    if new.participant_mode not in ('anonymous', 'canvas') then raise exception 'Choose anonymous or Canvas-identified participation'; end if;
    if jsonb_array_length(new.activity_plan) not between 1 and 12 then raise exception 'Save the activity plan before publishing'; end if;
    if jsonb_array_length(new.activity_plan) > 1 and new.participant_mode <> 'anonymous' then
      raise exception 'The multi-activity pilot uses private study codes';
    end if;
    select jsonb_agg(jsonb_build_object('id', q.id, 'activity_id', q.activity_id,
      'position', q.position, 'prompt', q.prompt) order by q.position)
      into v_questions from public.study_questions q where q.study_id = old.id;
    if v_questions is null or jsonb_array_length(v_questions) not between 1 and 144 then
      raise exception 'Add questions before publishing';
    end if;
    insert into public.study_versions(study_id, version_number, title, description, research_question,
      additional_context, consent_text, consent_required, participant_mode, questions, activities,
      compensation_details, contact_info, published_by)
    values (old.id, (select coalesce(max(version_number), 0) + 1 from public.study_versions where study_id = old.id),
      new.title, new.description, new.research_question, new.additional_context, trim(new.consent_text), true,
      new.participant_mode, v_questions, new.activity_plan, new.compensation_details, new.contact_info, auth.uid()) returning id into v_version;
    new.current_version_id := v_version; new.published_at := coalesce(old.published_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.get_public_study(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('title', v.title, 'description', v.description, 'version_id', v.id,
    'version_number', v.version_number, 'questions', v.questions, 'activities', v.activities,
    'compensation_details', v.compensation_details, 'contact_info', v.contact_info,
    'consent_text', v.consent_text, 'consent_required', v.consent_required, 'participant_mode', v.participant_mode)
  from public.studies s join public.study_versions v on v.id = s.current_version_id
  where s.share_code = upper(trim(p_code)) and s.status = 'open';
$$;

create function public.guard_activity_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.study_versions%rowtype;
begin
  select * into v from public.study_versions where id = new.study_version_id;
  if jsonb_array_length(v.activities) > 1 and new.enrollment_id is null then
    raise sqlstate 'PT422' using message = 'Open the study hub to submit each activity separately';
  end if;
  if new.activity_id is null then new.activity_id := (v.activities->0->>'id')::uuid; end if;
  if not exists (select 1 from jsonb_array_elements(v.activities) a where a->>'id' = new.activity_id::text) then
    raise exception 'This activity does not belong to the submitted study version';
  end if;
  if new.enrollment_id is not null and not exists (select 1 from public.study_enrollments e
    where e.id = new.enrollment_id and e.study_id = new.study_id and e.study_version_id = new.study_version_id) then
    raise exception 'This enrollment does not belong to the submitted study version';
  end if;
  return new;
end;
$$;
create trigger guard_activity_submission before insert on public.study_submissions
  for each row execute function public.guard_activity_submission();

create function public.private_participation(p_access_key text) returns public.study_enrollments
language sql stable security definer set search_path = '' as $$
  select e from public.study_enrollments e where p_access_key ~ '^[a-f0-9]{64}$'
    and e.access_key_hash = encode(sha256(convert_to(p_access_key, 'UTF8')), 'hex');
$$;

create function public.get_participant_study(p_access_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.study_enrollments%rowtype; v public.study_versions%rowtype; s public.studies%rowtype; activities jsonb;
begin
  e := public.private_participation(p_access_key);
  if e.id is null then raise sqlstate 'PT401' using message = 'This private study link is invalid'; end if;
  select * into v from public.study_versions where id = e.study_version_id;
  select * into s from public.studies where id = e.study_id;
  select jsonb_agg(a || jsonb_build_object(
    'opens_at', e.consent_accepted_at + (a->>'opens_after_days')::integer * interval '1 day',
    'due_at', e.consent_accepted_at + (a->>'due_after_days')::integer * interval '1 day',
    'started_at', p.started_at, 'saved_at', p.saved_at, 'draft_revision', coalesce(p.revision, 0),
    'draft_answers', case when r.id is null then coalesce(p.draft_answers, '{}'::jsonb) else '{}'::jsonb end,
    'submission_id', r.id, 'consent_accepted_at', r.consent_accepted_at,
    'status', case when r.id is not null then 'completed'
      when s.status <> 'open' then 'paused'
      when exists (select 1 from jsonb_array_elements(v.activities) previous where (previous->>'position')::integer < (a->>'position')::integer
        and (previous->>'required')::boolean and not exists (select 1 from public.study_submissions done
          where done.enrollment_id = e.id and done.activity_id::text = previous->>'id')) then 'blocked'
      when e.consent_accepted_at + (a->>'opens_after_days')::integer * interval '1 day' > now() then 'upcoming'
      when e.consent_accepted_at + (a->>'due_after_days')::integer * interval '1 day' < now() then 'overdue'
      when p.started_at is not null then 'in_progress' else 'available' end,
    'receipt', case when r.id is not null then jsonb_build_object('submission_id', r.id, 'title', v.title,
      'version_id', v.id, 'version_number', v.version_number, 'activity_id', r.activity_id, 'activity_title', a->>'title',
      'consent_text', v.consent_text, 'consent_accepted_at', r.consent_accepted_at, 'submitted_at', r.created_at,
      'participant_mode', 'study_code', 'linking_notice_version', e.linking_notice_version,
      'linking_notice_text', e.linking_notice_text, 'linking_accepted_at', e.consent_accepted_at) else null end) order by (a->>'position')::integer)
    into activities from jsonb_array_elements(v.activities) a
    left join public.study_activity_progress p on p.enrollment_id = e.id and p.activity_id::text = a->>'id'
    left join public.study_submissions r on r.enrollment_id = e.id and r.activity_id::text = a->>'id';
  return jsonb_build_object('participant_reference', e.participant_reference, 'version_id', v.id,
    'version_number', v.version_number, 'title', v.title, 'description', v.description,
    'consent_text', v.consent_text, 'joined_at', e.consent_accepted_at, 'study_status', s.status,
    'compensation_details', v.compensation_details, 'contact_info', v.contact_info,
    'reward_status', e.reward_status, 'linking_notice_version', e.linking_notice_version,
    'linking_notice_text', e.linking_notice_text, 'activities', activities);
end;
$$;

create function public.enroll_study(p_code text, p_version_id uuid, p_access_key text,
  p_consent_accepted boolean, p_linking_accepted boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.studies%rowtype; v public.study_versions%rowtype; e public.study_enrollments%rowtype;
begin
  if p_access_key is null or p_access_key !~ '^[a-f0-9]{64}$' then raise exception 'A secure private study key is required'; end if;
  select * into s from public.studies where share_code = upper(trim(p_code)) for update;
  if not found then raise sqlstate 'PT422' using message = 'This study is unavailable'; end if;
  e := public.private_participation(p_access_key);
  if e.id is not null then
    if e.study_id is distinct from s.id or e.study_version_id is distinct from p_version_id then raise sqlstate 'PT409' using message = 'This study key is already in use'; end if;
    return public.get_participant_study(p_access_key);
  end if;
  if s.status <> 'open' then raise sqlstate 'PT422' using message = 'This study is not accepting participation'; end if;
  if s.current_version_id is distinct from p_version_id then raise sqlstate 'PT412' using message = 'The study has changed. Reload and review the current consent'; end if;
  select * into v from public.study_versions where id = p_version_id and study_id = s.id;
  if jsonb_array_length(v.activities) < 2 or v.participant_mode <> 'anonymous' then
    raise exception 'This study uses the single-activity participation flow';
  end if;
  if p_consent_accepted is not true or p_linking_accepted is not true then
    raise sqlstate 'PT422' using message = 'Accept the study consent and the linking of activities before joining';
  end if;
  insert into public.study_enrollments(study_id, study_version_id, access_key_hash)
    values (s.id, v.id, encode(sha256(convert_to(p_access_key, 'UTF8')), 'hex'));
  return public.get_participant_study(p_access_key);
end;
$$;

-- All activity writes lock the study first, so closure and submissions are atomic.
create function public.private_editable_activity(p_access_key text, p_activity_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.study_enrollments%rowtype; v public.study_versions%rowtype; a jsonb;
begin
  e := public.private_participation(p_access_key);
  if e.id is null then raise sqlstate 'PT401' using message = 'This private study link is invalid'; end if;
  perform 1 from public.studies where id = e.study_id and status = 'open' for update;
  if not found then raise sqlstate 'PT422' using message = 'This study is paused or closed. Your saved work is retained'; end if;
  perform 1 from public.study_enrollments where id = e.id for update;
  select * into v from public.study_versions where id = e.study_version_id;
  select value into a from jsonb_array_elements(v.activities) where value->>'id' = p_activity_id::text;
  if a is null then raise sqlstate 'PT422' using message = 'This activity does not belong to your study plan'; end if;
  if exists (select 1 from public.study_submissions where enrollment_id = e.id and activity_id = p_activity_id) then
    raise sqlstate 'PT409' using message = 'This activity has already been submitted. Refresh your study hub';
  end if;
  if e.consent_accepted_at + (a->>'opens_after_days')::integer * interval '1 day' > now()
    or exists (select 1 from jsonb_array_elements(v.activities) previous where (previous->>'position')::integer < (a->>'position')::integer
      and (previous->>'required')::boolean and not exists (select 1 from public.study_submissions done
        where done.enrollment_id = e.id and done.activity_id::text = previous->>'id')) then
    raise sqlstate 'PT422' using message = 'This activity is not available yet';
  end if;
  return jsonb_build_object('enrollment_id', e.id, 'study_id', e.study_id,
    'version_id', e.study_version_id, 'activity', a);
end;
$$;

create function public.start_study_activity(p_access_key text, p_activity_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare context jsonb; progress public.study_activity_progress%rowtype;
begin
  context := public.private_editable_activity(p_access_key, p_activity_id);
  insert into public.study_activity_progress(enrollment_id, activity_id)
    values ((context->>'enrollment_id')::uuid, p_activity_id) on conflict do nothing;
  select * into progress from public.study_activity_progress where enrollment_id = (context->>'enrollment_id')::uuid and activity_id = p_activity_id;
  return jsonb_build_object('draft_answers', progress.draft_answers, 'revision', progress.revision);
end;
$$;

create function public.save_activity_draft(p_access_key text, p_activity_id uuid, p_answers jsonb, p_expected_revision integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare context jsonb; saved integer;
begin
  context := public.private_editable_activity(p_access_key, p_activity_id);
  if p_expected_revision is null or p_expected_revision < 0 or p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or octet_length(p_answers::text) > 500000 or exists (select 1 from jsonb_each(p_answers) e
      where jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 10000
      or not exists (select 1 from jsonb_array_elements(context->'activity'->'questions') q where q->>'id' = e.key)) then
    raise sqlstate 'PT422' using message = 'Check the draft answers and saved revision';
  end if;
  insert into public.study_activity_progress(enrollment_id, activity_id) values ((context->>'enrollment_id')::uuid, p_activity_id) on conflict do nothing;
  update public.study_activity_progress set draft_answers = p_answers, saved_at = now(), revision = revision + 1
    where enrollment_id = (context->>'enrollment_id')::uuid and activity_id = p_activity_id and revision = p_expected_revision returning revision into saved;
  if saved is null then raise sqlstate 'PT409' using message = 'This activity was saved in another tab. Reload before making more changes'; end if;
  return saved;
end;
$$;

create function public.submit_study_activity(p_access_key text, p_activity_id uuid, p_answers jsonb,
  p_consent_accepted boolean, p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare e public.study_enrollments%rowtype; context jsonb; previous public.study_submissions%rowtype; cleaned jsonb; result uuid;
begin
  e := public.private_participation(p_access_key);
  if e.id is null then raise sqlstate 'PT401' using message = 'This private study link is invalid'; end if;
  if p_request_id is null or p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or exists (select 1 from jsonb_each(p_answers) answer where jsonb_typeof(answer.value) <> 'string') then
    raise sqlstate 'PT422' using message = 'A request ID and text answers are required';
  end if;
  select jsonb_object_agg(key, trim(value)) into cleaned from jsonb_each_text(p_answers);
  select * into previous from public.study_submissions where submission_request_id = p_request_id;
  if found then
    if previous.enrollment_id = e.id and previous.activity_id = p_activity_id and previous.answers = cleaned
      and p_consent_accepted is true then return previous.id; end if;
    raise sqlstate 'PT409' using message = 'Submission request already used';
  end if;
  context := public.private_editable_activity(p_access_key, p_activity_id);
  if p_consent_accepted is not true then raise sqlstate 'PT422' using message = 'Review and accept the study consent before submitting'; end if;
  if jsonb_array_length(context->'activity'->'questions') <> (select count(*) from jsonb_object_keys(p_answers))
    or exists (select 1 from jsonb_array_elements(context->'activity'->'questions') q
      where not coalesce(length(trim(p_answers->>(q->>'id'))) between 1 and 10000, false)) then
    raise sqlstate 'PT422' using message = 'Complete each activity question with 1 to 10000 characters';
  end if;
  insert into public.study_submissions(study_id, study_version_id, enrollment_id, activity_id, answers,
    consent_accepted_at, submission_request_id, participant_data)
    values (e.study_id, e.study_version_id, e.id, p_activity_id, cleaned, now(), p_request_id, '{}'::jsonb) returning id into result;
  insert into public.study_activity_progress(enrollment_id, activity_id, saved_at, draft_answers, revision)
    values (e.id, p_activity_id, now(), '{}'::jsonb, 1) on conflict (enrollment_id, activity_id)
    do update set draft_answers = '{}'::jsonb, saved_at = now(), revision = public.study_activity_progress.revision + 1;
  return result;
end;
$$;

create or replace function public.get_study_receipt(p_submission_id uuid, p_request_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('submission_id', r.id, 'title', v.title, 'version_number', v.version_number,
    'version_id', v.id, 'consent_text', v.consent_text, 'consent_accepted_at', r.consent_accepted_at,
    'submitted_at', r.created_at, 'participant_mode', case when r.enrollment_id is null then v.participant_mode else 'study_code' end,
    'activity_id', r.activity_id, 'activity_title', (select a->>'title' from jsonb_array_elements(v.activities) a where a->>'id' = r.activity_id::text),
    'linking_notice_version', e.linking_notice_version, 'linking_notice_text', e.linking_notice_text,
    'linking_accepted_at', e.consent_accepted_at)
  from public.study_submissions r join public.study_versions v on v.id = r.study_version_id
  left join public.study_enrollments e on e.id = r.enrollment_id
  where r.id = p_submission_id and r.submission_request_id = p_request_id;
$$;

create function public.save_study_operations(p_study_id uuid, p_recruitment_target integer, p_coordinator_notes text, p_expected_revision integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare saved integer;
begin
  if not public.can_edit_study(p_study_id) then raise exception 'You do not have permission to update study operations'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'A saved revision is required'; end if;
  insert into public.study_operations(study_id, recruitment_target, coordinator_notes, updated_by)
    values (p_study_id, p_recruitment_target, coalesce(p_coordinator_notes, ''), auth.uid())
    on conflict (study_id) do update set recruitment_target = excluded.recruitment_target,
      coordinator_notes = excluded.coordinator_notes, revision = public.study_operations.revision + 1,
      updated_at = now(), updated_by = auth.uid() where public.study_operations.revision = p_expected_revision returning revision into saved;
  if saved is null or (saved = 1 and p_expected_revision <> 0) then
    raise sqlstate 'PT409' using message = 'Operations were changed by another researcher. Refresh before saving';
  end if;
  return saved;
end;
$$;

create function public.update_participation_reward(p_enrollment_id uuid, p_status text, p_expected_revision integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare e public.study_enrollments%rowtype; saved integer;
begin
  select * into e from public.study_enrollments where id = p_enrollment_id for update;
  if not public.can_edit_study(e.study_id) then raise exception 'You do not have permission to update this participation record'; end if;
  update public.study_enrollments set reward_status = p_status, revision = revision + 1,
    reward_updated_at = now(), reward_updated_by = auth.uid() where id = e.id and revision = p_expected_revision returning revision into saved;
  if saved is null then raise sqlstate 'PT409' using message = 'This participation record changed. Refresh before updating it'; end if;
  return saved;
end;
$$;

create function public.get_study_operations(p_study_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare settings public.study_operations%rowtype; participants jsonb;
begin
  if public.study_role(p_study_id) is null then raise exception 'You do not have access to study operations'; end if;
  select * into settings from public.study_operations where study_id = p_study_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'participant_reference', e.participant_reference,
    'version_number', v.version_number, 'version_id', v.id, 'joined_at', e.consent_accepted_at,
    'reward_status', e.reward_status, 'revision', e.revision, 'reward_updated_at', e.reward_updated_at,
    'required_count', (select count(*) from jsonb_array_elements(v.activities) a where (a->>'required')::boolean),
    'completed_required', (select count(*) from jsonb_array_elements(v.activities) a where (a->>'required')::boolean
      and exists (select 1 from public.study_submissions r where r.enrollment_id = e.id and r.activity_id::text = a->>'id')),
    'completed_activities', (select count(*) from public.study_submissions r where r.enrollment_id = e.id),
    'activity_count', jsonb_array_length(v.activities),
    'started', exists (select 1 from public.study_activity_progress p where p.enrollment_id = e.id),
    'overdue_count', (select count(*) from jsonb_array_elements(v.activities) a where (a->>'required')::boolean
      and e.consent_accepted_at + (a->>'due_after_days')::integer * interval '1 day' < now()
      and not exists (select 1 from public.study_submissions r where r.enrollment_id = e.id and r.activity_id::text = a->>'id'))
    ) order by e.consent_accepted_at desc), '[]'::jsonb) into participants
    from public.study_enrollments e join public.study_versions v on v.id = e.study_version_id where e.study_id = p_study_id;
  return jsonb_build_object('recruitment_target', coalesce(settings.recruitment_target, 0),
    'coordinator_notes', coalesce(settings.coordinator_notes, ''), 'revision', coalesce(settings.revision, 0),
    'participants', participants,
    'unlinked_responses', (select count(*) from public.study_submissions where study_id = p_study_id and enrollment_id is null),
    'activity_submissions', (select count(*) from public.study_submissions where study_id = p_study_id and enrollment_id is not null));
end;
$$;

revoke all on function public.private_participation(text), public.private_editable_activity(text,uuid),
  public.guard_activity_submission() from public, anon, authenticated, service_role;
revoke all on function public.get_participant_study(text), public.enroll_study(text,uuid,text,boolean,boolean),
  public.start_study_activity(text,uuid), public.save_activity_draft(text,uuid,jsonb,integer),
  public.submit_study_activity(text,uuid,jsonb,boolean,uuid) from public, anon, authenticated;
grant execute on function public.get_participant_study(text), public.enroll_study(text,uuid,text,boolean,boolean),
  public.start_study_activity(text,uuid), public.save_activity_draft(text,uuid,jsonb,integer),
  public.submit_study_activity(text,uuid,jsonb,boolean,uuid) to anon, authenticated;
revoke all on function public.get_study_operations(uuid), public.save_study_operations(uuid,integer,text,integer),
  public.update_participation_reward(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.get_study_operations(uuid), public.save_study_operations(uuid,integer,text,integer),
  public.update_participation_reward(uuid,text,integer) to authenticated;

commit;
