-- Phase 1: study-scoped teams, immutable published versions, and versioned consent.
-- Apply after the studies and Canvas migrations, before deploying either app.
begin;

alter table public.studies
  add column consent_text text not null default '' check (length(consent_text) <= 20000),
  add column participant_mode text not null default 'anonymous'
    check (participant_mode in ('anonymous', 'canvas', 'optional_canvas')),
  add column current_version_id uuid,
  add column draft_revision integer not null default 1;

create table public.study_versions (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text not null,
  research_question text not null,
  additional_context text not null,
  consent_text text not null,
  consent_required boolean not null,
  participant_mode text not null check (participant_mode in ('anonymous', 'canvas', 'optional_canvas')),
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  unique (study_id, version_number),
  unique (study_id, id)
);

-- Preserve the historical truth: older submissions have no recorded research consent.
update public.studies set participant_mode = 'optional_canvas' where published_at is not null;
insert into public.study_versions(study_id, version_number, title, description,
  research_question, additional_context, consent_text, consent_required,
  participant_mode, questions, published_at, published_by)
select s.id, 1, s.title, s.description, s.research_question, s.additional_context,
  '', false, 'optional_canvas', coalesce((select jsonb_agg(
    jsonb_build_object('id', q.id, 'position', q.position, 'prompt', q.prompt) order by q.position)
    from public.study_questions q where q.study_id = s.id), '[]'::jsonb),
  coalesce(s.published_at, s.created_at), s.owner_id
from public.studies s where s.published_at is not null
  or exists (select 1 from public.study_submissions r where r.study_id = s.id)
  or exists (select 1 from public.study_analyses a where a.study_id = s.id);
update public.studies s set current_version_id = v.id
from public.study_versions v where v.study_id = s.id;
alter table public.studies add foreign key (id, current_version_id)
  references public.study_versions(study_id, id) deferrable initially deferred;

alter table public.study_submissions
  add column study_version_id uuid,
  add column consent_accepted_at timestamptz,
  add column submission_request_id uuid unique;
update public.study_submissions r set study_version_id = s.current_version_id,
  submission_request_id = r.canvas_request_id from public.studies s where s.id = r.study_id;
alter table public.study_submissions alter column study_version_id set not null;
alter table public.study_submissions add foreign key (study_id, study_version_id)
  references public.study_versions(study_id, id);
create index study_submissions_version_idx on public.study_submissions(study_id, study_version_id);

alter table public.study_analyses
  add column study_version_id uuid,
  add column revision integer not null default 1,
  add column updated_by uuid references auth.users(id) on delete set null;
update public.study_analyses a set study_version_id = s.current_version_id,
  updated_by = a.owner_id from public.studies s where s.id = a.study_id;
alter table public.study_analyses alter column study_version_id set not null;
alter table public.study_analyses drop constraint study_analyses_pkey;
alter table public.study_analyses drop constraint study_analyses_study_id_question_id_fkey;
alter table public.study_analyses add primary key (study_id, question_id, study_version_id);
alter table public.study_analyses add foreign key (study_id, study_version_id)
  references public.study_versions(study_id, id);

create table public.study_members (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 254),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('researcher', 'reviewer')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check ((user_id is null) = (accepted_at is null)),
  unique (study_id, email),
  unique (study_id, user_id)
);
create index study_members_user_idx on public.study_members(user_id);

-- Definer helpers avoid recursive membership policies; identity always comes from Auth.
create function public.study_role(p_study_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when s.owner_id = (select auth.uid()) then 'owner' else (
    select m.role from public.study_members m where m.study_id = s.id
      and m.user_id = (select auth.uid()) and m.accepted_at is not null
  ) end from public.studies s where s.id = p_study_id;
$$;
create function public.can_edit_study(p_study_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.study_role(p_study_id) in ('owner', 'researcher'), false);
$$;

alter table public.study_versions enable row level security;
alter table public.study_members enable row level security;
revoke all on public.study_versions, public.study_members from public, anon, authenticated;
grant select on public.study_versions, public.study_members to authenticated;
create policy versions_team_select on public.study_versions for select to authenticated
  using (public.study_role(study_id) is not null);
create policy members_team_select on public.study_members for select to authenticated
  using (public.study_role(study_id) is not null);

drop policy studies_owner_select on public.studies;
drop policy studies_owner_update on public.studies;
create policy studies_team_select on public.studies for select to authenticated
  using (public.study_role(id) is not null);
create policy studies_team_update on public.studies for update to authenticated
  using (public.can_edit_study(id)) with check (public.can_edit_study(id));
drop policy studies_owner_insert on public.studies;
create policy studies_owner_insert on public.studies for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'draft'
    and published_at is null and current_version_id is null);

drop policy questions_owner_select on public.study_questions;
drop policy questions_owner_insert on public.study_questions;
drop policy questions_owner_update on public.study_questions;
drop policy questions_owner_delete on public.study_questions;
create policy questions_team_select on public.study_questions for select to authenticated
  using (public.study_role(study_id) is not null);
create policy questions_draft_insert on public.study_questions for insert to authenticated
  with check (public.can_edit_study(study_id) and exists (
    select 1 from public.studies s where s.id = study_id and s.status = 'draft'));
create policy questions_draft_update on public.study_questions for update to authenticated
  using (public.can_edit_study(study_id) and exists (
    select 1 from public.studies s where s.id = study_id and s.status = 'draft'))
  with check (public.can_edit_study(study_id) and exists (
    select 1 from public.studies s where s.id = study_id and s.status = 'draft'));
create policy questions_draft_delete on public.study_questions for delete to authenticated
  using (public.can_edit_study(study_id) and exists (
    select 1 from public.studies s where s.id = study_id and s.status = 'draft'));
drop policy submissions_owner_select on public.study_submissions;
create policy submissions_team_select on public.study_submissions for select to authenticated
  using (public.study_role(study_id) is not null);
drop policy analyses_owner_select on public.study_analyses;
drop policy analyses_owner_insert on public.study_analyses;
drop policy analyses_owner_update on public.study_analyses;
create policy analyses_team_select on public.study_analyses for select to authenticated
  using (public.study_role(study_id) is not null);
-- Writes go through a revision-checked RPC, preventing collaborators overwriting each other.
revoke insert, update on public.study_analyses from authenticated;

create function public.invite_study_member(p_study_id uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text := lower(trim(p_email));
begin
  if public.study_role(p_study_id) is distinct from 'owner' then
    raise exception 'Only the study owner can manage invitations';
  end if;
  if p_role is null or p_role not in ('researcher', 'reviewer') then raise exception 'Choose a valid role'; end if;
  if exists (select 1 from auth.users where id = auth.uid() and lower(email) = v_email) then
    raise exception 'The study owner already has access';
  end if;
  insert into public.study_members(study_id, email, role, invited_by)
    values (p_study_id, v_email, p_role, auth.uid())
    on conflict (study_id, email) do update set role = excluded.role returning id into v_id;
  return v_id;
end;
$$;

create function public.pending_study_invitations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'study_id', s.id,
    'title', s.title, 'role', m.role) order by m.created_at), '[]'::jsonb)
  from public.study_members m join public.studies s on s.id = m.study_id
  join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null
    and lower(u.email) = m.email where m.user_id is null;
$$;

create function public.accept_study_invitation(p_invitation_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_study_id uuid;
begin
  update public.study_members m set user_id = auth.uid(), accepted_at = now()
    where m.id = p_invitation_id and m.user_id is null and exists (
      select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
        and lower(u.email) = m.email) returning study_id into v_study_id;
  if v_study_id is null then raise exception 'Sign in with the verified email address invited to this study'; end if;
  return v_study_id;
end;
$$;

create function public.remove_study_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.study_members where id = p_member_id and public.study_role(study_id) = 'owner';
  if not found then raise exception 'Only the study owner can remove this member'; end if;
end;
$$;

-- Editing a closed study starts a new draft; published snapshots remain unchanged.
create or replace function public.guard_study_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_questions jsonb; v_version uuid;
begin
  if new.owner_id is distinct from old.owner_id or new.share_code is distinct from old.share_code
    or new.current_version_id is distinct from old.current_version_id
    or new.published_at is distinct from old.published_at then
    raise exception 'Study ownership, link, and published history cannot be changed';
  end if;
  if new.status is distinct from old.status and auth.uid() is distinct from old.owner_id then
    raise exception 'Only the study owner can publish, close, or revise a study';
  end if;
  if old.status <> 'draft' and (new.title is distinct from old.title
    or new.description is distinct from old.description or new.research_question is distinct from old.research_question
    or new.additional_context is distinct from old.additional_context
    or new.consent_text is distinct from old.consent_text or new.participant_mode is distinct from old.participant_mode) then
    raise exception 'Close this study and create a new draft before editing';
  end if;
  if new.status = 'draft' and old.status = 'open' then raise exception 'Close this study before creating a new draft'; end if;
  if old.status = 'draft' and new.status = 'closed' then raise exception 'Publish a draft before closing it'; end if;
  if old.status = 'draft' and new.status = 'open' then
    if length(trim(new.consent_text)) = 0 then raise exception 'Add participant consent text before publishing'; end if;
    if new.participant_mode not in ('anonymous', 'canvas') then raise exception 'Choose anonymous or Canvas-identified participation'; end if;
    select jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position, 'prompt', q.prompt) order by q.position)
      into v_questions from public.study_questions q where q.study_id = old.id;
    if v_questions is null or jsonb_array_length(v_questions) not between 1 and 12 then
      raise exception 'Add between 1 and 12 questions before publishing';
    end if;
    insert into public.study_versions(study_id, version_number, title, description, research_question,
      additional_context, consent_text, consent_required, participant_mode, questions, published_by)
    values (old.id, (select coalesce(max(version_number), 0) + 1 from public.study_versions where study_id = old.id),
      new.title, new.description, new.research_question, new.additional_context, trim(new.consent_text), true,
      new.participant_mode, v_questions, auth.uid()) returning id into v_version;
    new.current_version_id := v_version;
    new.published_at := coalesce(old.published_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.get_public_study(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('title', v.title, 'description', v.description,
    'version_id', v.id, 'version_number', v.version_number, 'questions', v.questions,
    'consent_text', v.consent_text, 'consent_required', v.consent_required,
    'participant_mode', v.participant_mode)
  from public.studies s join public.study_versions v on v.id = s.current_version_id
  where s.share_code = upper(trim(p_code)) and s.status = 'open';
$$;

-- Save the complete draft in one transaction, with a stale-editor check.
create function public.save_study_draft(p_study_id uuid, p_form jsonb, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_study_id; s public.studies%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in to save a study'; end if;
  if p_form is null or jsonb_typeof(p_form->'questions') is distinct from 'array' then
    raise exception 'Add between 1 and 12 text questions';
  end if;
  if jsonb_array_length(p_form->'questions') not between 1 and 12
    or exists (select 1 from jsonb_array_elements(p_form->'questions') q where jsonb_typeof(q) <> 'string') then
    raise exception 'Add between 1 and 12 text questions';
  end if;
  if v_id is null then
    insert into public.studies(owner_id, title, research_question) values (
      auth.uid(), trim(p_form->>'title'), trim(p_form->>'research_question')) returning id into v_id;
  else
    if not public.can_edit_study(v_id) then raise exception 'You do not have permission to edit this study'; end if;
    select * into s from public.studies where id = v_id for update;
    if s.status <> 'draft' then raise exception 'Create a new draft before editing'; end if;
    if s.draft_revision is distinct from p_expected_revision then
      raise sqlstate 'PT409' using message = 'Another researcher changed this draft. Refresh before editing';
    end if;
  end if;
  update public.studies set title = trim(p_form->>'title'),
    description = coalesce(trim(p_form->>'description'), ''),
    research_question = trim(p_form->>'research_question'),
    additional_context = coalesce(trim(p_form->>'additional_context'), ''),
    consent_text = coalesce(trim(p_form->>'consent_text'), ''),
    participant_mode = coalesce(p_form->>'participant_mode', 'anonymous'),
    draft_revision = draft_revision + 1 where id = v_id;
  delete from public.study_questions where study_id = v_id;
  insert into public.study_questions(study_id, position, prompt)
    select v_id, ordinality - 1, trim(value) from jsonb_array_elements_text(p_form->'questions') with ordinality;
  return v_id;
end;
$$;
revoke insert, update on public.studies from authenticated;
grant update(status) on public.studies to authenticated;
revoke insert, update, delete on public.study_questions from authenticated;

-- Internal implementation. The public never supplies or writes verified identity.
create function public.record_study_submission(p_code text, p_answers jsonb,
  p_version_id uuid, p_consent_accepted boolean, p_request_id uuid, p_canvas_session uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.studies%rowtype; v public.study_versions%rowtype;
  previous public.study_submissions%rowtype; profile jsonb; cleaned jsonb; result uuid;
begin
  select * into s from public.studies where share_code = upper(trim(p_code)) for update;
  if not found then raise sqlstate 'PT422' using message = 'This study is unavailable'; end if;
  if p_request_id is null or p_version_id is null or p_answers is null or jsonb_typeof(p_answers) <> 'object'
    or exists (select 1 from jsonb_each(p_answers) e where jsonb_typeof(e.value) <> 'string') then
    raise sqlstate 'PT422' using message = 'A study version, request ID, and text answers are required';
  end if;
  select jsonb_object_agg(e.key, trim(e.value)) into cleaned from jsonb_each_text(p_answers) e;
  select * into previous from public.study_submissions where submission_request_id = p_request_id;
  if found then
    if previous.study_id = s.id and previous.study_version_id = p_version_id and previous.answers = cleaned
      and previous.canvas_session_id is not distinct from p_canvas_session
      and (previous.consent_accepted_at is not null) = coalesce(p_consent_accepted, false) then return previous.id; end if;
    raise sqlstate 'PT409' using message = 'Submission request already used';
  end if;
  if s.status <> 'open' then raise sqlstate 'PT422' using message = 'This study is not accepting responses'; end if;
  if s.current_version_id <> p_version_id then raise sqlstate 'PT412' using message = 'The study has changed. Reload it and review the current consent'; end if;
  select * into v from public.study_versions where id = p_version_id and study_id = s.id;
  if v.consent_required and p_consent_accepted is not true then raise sqlstate 'PT422' using message = 'Review and accept the study consent before submitting'; end if;
  if (v.participant_mode = 'canvas' and p_canvas_session is null)
    or (v.participant_mode = 'anonymous' and p_canvas_session is not null) then
    raise sqlstate 'PT422' using message = 'The participant identity does not match this study';
  end if;
  if p_canvas_session is not null then
    select l.profile into profile from public.lti_sessions l where l.id = p_canvas_session and l.expires_at > now();
    if profile is null then raise sqlstate 'PT401' using message = 'Canvas session expired'; end if;
  end if;
  if jsonb_array_length(v.questions) <> (select count(*) from jsonb_object_keys(p_answers))
    or exists (select 1 from jsonb_array_elements(v.questions) q where
      not coalesce(length(trim(p_answers ->> (q->>'id'))) between 1 and 10000, false)) then
    raise sqlstate 'PT422' using message = 'Complete each study question with 1 to 10000 characters';
  end if;
  insert into public.study_submissions(study_id, study_version_id, answers, consent_accepted_at,
    submission_request_id, participant_data, canvas_session_id, canvas_request_id)
  values (s.id, v.id, cleaned, case when p_consent_accepted then now() end, p_request_id,
    case when p_canvas_session is null then '{}'::jsonb else profile || jsonb_build_object(
      'shared_at', now(), 'sharing_notice_version', 'canvas-participant-v1') end,
    p_canvas_session, case when p_canvas_session is not null then p_request_id end)
  on conflict (submission_request_id) do nothing returning id into result;
  if result is null then raise sqlstate 'PT409' using message = 'Submission request already used'; end if;
  return result;
end;
$$;

create function public.submit_study_version(p_code text, p_answers jsonb, p_version_id uuid,
  p_consent_accepted boolean, p_request_id uuid) returns uuid
language sql security definer set search_path = '' as $$
  select public.record_study_submission(p_code, p_answers, p_version_id, p_consent_accepted, p_request_id, null);
$$;

-- Two unguessable submission capabilities reveal a receipt, never answers or identity.
create function public.get_study_receipt(p_submission_id uuid, p_request_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('submission_id', r.id, 'title', v.title, 'version_number', v.version_number,
    'version_id', v.id, 'consent_text', v.consent_text, 'consent_accepted_at', r.consent_accepted_at,
    'submitted_at', r.created_at, 'participant_mode', v.participant_mode)
  from public.study_submissions r join public.study_versions v on v.id = r.study_version_id
  where r.id = p_submission_id and r.submission_request_id = p_request_id;
$$;

create function public.submit_canvas_study_version(p_code text, p_answers jsonb, p_token_hash text,
  p_request_id uuid, p_version_id uuid, p_consent_accepted boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_session uuid;
begin
  select id into v_session from public.lti_sessions where token_hash = p_token_hash and expires_at > now() for update;
  if not found then raise sqlstate 'PT401' using message = 'Canvas session expired'; end if;
  return public.record_study_submission(p_code, p_answers, p_version_id, p_consent_accepted, p_request_id, v_session);
end;
$$;

-- Compatibility for already-open, pre-consent studies only. Cannot bypass new consent.
create or replace function public.submit_study(p_code text, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.study_versions%rowtype;
begin
  select v1.* into v from public.studies s join public.study_versions v1 on v1.id = s.current_version_id
    where s.share_code = upper(trim(p_code));
  if v.id is null or v.consent_required then raise exception 'Reload this study to review the current consent'; end if;
  return public.record_study_submission(p_code, p_answers, v.id, false, gen_random_uuid(), null);
end;
$$;
create or replace function public.submit_canvas_study(p_code text, p_answers jsonb, p_token_hash text, p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.study_versions%rowtype;
begin
  select v1.* into v from public.studies s join public.study_versions v1 on v1.id = s.current_version_id
    where s.share_code = upper(trim(p_code));
  if v.id is null or v.consent_required then raise sqlstate 'PT412' using message = 'Reload this study to review the current consent'; end if;
  return public.submit_canvas_study_version(p_code, p_answers, p_token_hash, p_request_id, v.id, false);
end;
$$;

create function public.save_study_analysis(p_snapshot jsonb, p_expected_revision integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_study uuid := (p_snapshot->>'study_id')::uuid; v_version uuid := (p_snapshot->>'study_version_id')::uuid;
  v_question uuid := (p_snapshot->>'question_id')::uuid; v_owner uuid; v_revision integer;
begin
  if not public.can_edit_study(v_study) then raise exception 'You do not have permission to edit this study'; end if;
  select owner_id into v_owner from public.studies where id = v_study;
  if not exists (select 1 from public.study_versions v, jsonb_array_elements(v.questions) q
    where v.id = v_version and v.study_id = v_study and q->>'id' = v_question::text) then
    raise exception 'This question does not belong to this study version';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'A saved revision is required'; end if;
  insert into public.study_analyses(study_id, study_version_id, question_id, owner_id, labels,
    coded_responses, classifications, results, stage, response_count, updated_by, revision)
  values (v_study, v_version, v_question, v_owner, p_snapshot->'labels', p_snapshot->'coded_responses',
    nullif(p_snapshot->'classifications', 'null'::jsonb), nullif(p_snapshot->'results', 'null'::jsonb),
    p_snapshot->>'stage', (p_snapshot->>'response_count')::integer, auth.uid(), 1)
  on conflict (study_id, question_id, study_version_id) do update set labels = excluded.labels,
    coded_responses = excluded.coded_responses, classifications = excluded.classifications,
    results = excluded.results, stage = excluded.stage, response_count = excluded.response_count,
    updated_by = auth.uid(), updated_at = now(), revision = public.study_analyses.revision + 1
  where public.study_analyses.revision = p_expected_revision returning revision into v_revision;
  if v_revision is null then raise sqlstate 'PT409' using message = 'Another researcher saved this analysis. Reopen the study to load their changes'; end if;
  if v_revision = 1 and p_expected_revision <> 0 then
    raise sqlstate 'PT409' using message = 'This analysis changed. Reopen the study before saving';
  end if;
  return v_revision;
end;
$$;

-- Explicit allowlists for every new definer entry point.
revoke all on function public.study_role(uuid), public.can_edit_study(uuid),
  public.invite_study_member(uuid,text,text), public.pending_study_invitations(),
  public.accept_study_invitation(uuid), public.remove_study_member(uuid),
  public.save_study_analysis(jsonb,integer), public.save_study_draft(uuid,jsonb,integer) from public, anon, authenticated;
grant execute on function public.study_role(uuid), public.can_edit_study(uuid),
  public.invite_study_member(uuid,text,text), public.pending_study_invitations(),
  public.accept_study_invitation(uuid), public.remove_study_member(uuid),
  public.save_study_analysis(jsonb,integer), public.save_study_draft(uuid,jsonb,integer) to authenticated;
revoke all on function public.record_study_submission(text,jsonb,uuid,boolean,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.submit_study_version(text,jsonb,uuid,boolean,uuid) from public, anon, authenticated;
grant execute on function public.submit_study_version(text,jsonb,uuid,boolean,uuid) to anon, authenticated;
revoke all on function public.get_study_receipt(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_study_receipt(uuid,uuid) to anon, authenticated;
revoke all on function public.submit_canvas_study_version(text,jsonb,text,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.submit_canvas_study_version(text,jsonb,text,uuid,uuid,boolean) to service_role;
revoke all on function public.guard_study_update() from public, anon, authenticated;

commit;
