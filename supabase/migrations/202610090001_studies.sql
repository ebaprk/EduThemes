-- Apply in the Supabase SQL editor or with `supabase db push`.

create table public.studies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '',
  research_question text not null check (length(trim(research_question)) between 1 and 500),
  additional_context text not null default '',
  share_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    check (share_code ~ '^[A-F0-9]{12}$'),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.study_questions (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies(id) on delete cascade,
  position integer not null check (position >= 0),
  prompt text not null check (length(trim(prompt)) between 1 and 1000),
  unique (study_id, position),
  unique (study_id, id)
);

create table public.study_submissions (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references public.studies(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  created_at timestamptz not null default now()
);
create index study_submissions_study_created_idx on public.study_submissions(study_id, created_at);

create table public.study_analyses (
  study_id uuid not null references public.studies(id) on delete cascade,
  question_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  labels jsonb not null,
  coded_responses jsonb not null,
  classifications jsonb,
  results jsonb,
  stage text not null check (stage in ('code', 'review', 'results')),
  response_count integer not null check (response_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (study_id, question_id),
  foreign key (study_id, question_id) references public.study_questions(study_id, id) on delete cascade
);

create function public.guard_study_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id or new.share_code is distinct from old.share_code then
    raise exception 'Study ownership and link cannot be changed';
  end if;
  if old.published_at is not null then
    if new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.research_question is distinct from old.research_question
      or new.additional_context is distinct from old.additional_context
      or new.published_at is distinct from old.published_at
      or new.status = 'draft' then
      raise exception 'Published study details cannot be changed';
    end if;
  elsif new.published_at is not null and new.status <> 'open' then
    raise exception 'A draft cannot set its publication date';
  elsif new.status = 'open' then
    if not exists (select 1 from public.study_questions where study_id = old.id) then
      raise exception 'Add at least one question before publishing';
    end if;
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger guard_study_update before update on public.studies
for each row execute function public.guard_study_update();

alter table public.studies enable row level security;
alter table public.study_questions enable row level security;
alter table public.study_submissions enable row level security;
alter table public.study_analyses enable row level security;

revoke all on public.studies, public.study_questions, public.study_submissions, public.study_analyses from anon, authenticated;
grant select, insert, update, delete on public.studies to authenticated;
grant select, insert, update, delete on public.study_questions to authenticated;
grant select on public.study_submissions to authenticated;
grant select, insert, update on public.study_analyses to authenticated;

create policy studies_owner_select on public.studies for select to authenticated
using (owner_id = (select auth.uid()));
create policy studies_owner_insert on public.studies for insert to authenticated
with check (owner_id = (select auth.uid()) and status = 'draft' and published_at is null);
create policy studies_owner_update on public.studies for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy studies_owner_delete on public.studies for delete to authenticated
using (owner_id = (select auth.uid()));

create policy questions_owner_select on public.study_questions for select to authenticated
using (exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid())));
create policy questions_owner_insert on public.study_questions for insert to authenticated
with check (exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid()) and s.published_at is null));
create policy questions_owner_update on public.study_questions for update to authenticated
using (exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid()) and s.published_at is null))
with check (exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid()) and s.published_at is null));
create policy questions_owner_delete on public.study_questions for delete to authenticated
using (exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid()) and s.published_at is null));

create policy submissions_owner_select on public.study_submissions for select to authenticated
using (exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid())));

create policy analyses_owner_select on public.study_analyses for select to authenticated
using (owner_id = (select auth.uid()) and exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid())));
create policy analyses_owner_insert on public.study_analyses for insert to authenticated
with check (owner_id = (select auth.uid()) and exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid())));
create policy analyses_owner_update on public.study_analyses for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()) and exists (select 1 from public.studies s where s.id = study_id and s.owner_id = (select auth.uid())));

-- Participants can see only the public details for an open study.
create function public.get_public_study(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_study public.studies%rowtype;
begin
  select * into v_study from public.studies
  where share_code = upper(trim(p_code)) and status = 'open';
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object(
    'title', v_study.title,
    'description', v_study.description,
    'questions', (select coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', q.id, 'prompt', q.prompt) order by q.position
    ), '[]'::jsonb) from public.study_questions q where q.study_id = v_study.id)
  );
end;
$$;

-- A single database transaction validates and stores one complete response set.
create function public.submit_study(p_code text, p_answers jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_study_id uuid;
  v_question public.study_questions%rowtype;
  v_cleaned jsonb := '{}'::jsonb;
  v_answer text;
  v_submission_id uuid;
  v_question_count integer := 0;
begin
  select id into v_study_id from public.studies
  where share_code = upper(trim(p_code)) and status = 'open'
  for update;
  if v_study_id is null then raise exception 'This study is not accepting responses'; end if;
  if p_answers is null or pg_catalog.jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be an object';
  end if;
  for v_question in select * from public.study_questions where study_id = v_study_id order by position loop
    v_question_count := v_question_count + 1;
    v_answer := trim(p_answers ->> v_question.id::text);
    if v_answer is null or length(v_answer) = 0 or length(v_answer) > 10000 then
      raise exception 'Each question needs an answer of 1 to 10000 characters';
    end if;
    v_cleaned := v_cleaned || pg_catalog.jsonb_build_object(v_question.id::text, v_answer);
  end loop;
  if v_question_count = 0 or (select count(*) from pg_catalog.jsonb_object_keys(p_answers)) <> v_question_count then
    raise exception 'The submitted questions do not match this study';
  end if;
  insert into public.study_submissions(study_id, answers)
  values (v_study_id, v_cleaned) returning id into v_submission_id;
  return v_submission_id;
end;
$$;

revoke all on function public.get_public_study(text) from public, anon, authenticated;
revoke all on function public.submit_study(text, jsonb) from public, anon, authenticated;
grant execute on function public.get_public_study(text) to anon, authenticated;
grant execute on function public.submit_study(text, jsonb) to anon, authenticated;
