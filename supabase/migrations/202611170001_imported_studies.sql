begin;

alter table public.studies add column source_type text not null default 'study'
  check (source_type in ('study', 'file'));
alter table public.studies add constraint imported_studies_are_closed
  check (source_type <> 'file' or (status = 'closed' and current_version_id is not null));

create function public.guard_study_source() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.source_type is distinct from old.source_type then
    raise exception 'The study source cannot be changed';
  end if;
  return new;
end;
$$;
create trigger guard_study_source before update of source_type on public.studies
  for each row execute function public.guard_study_source();
revoke all on function public.guard_study_source() from public, anon, authenticated;

-- The upload ID is the idempotency key. A retry returns the saved copy
-- and never replaces an analysis or coding round that has progressed since import.
create function public.save_file_study(p_import_id uuid, p_title text, p_question text,
  p_description text, p_context text, p_analysis jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_version uuid := gen_random_uuid();
  v_question uuid := gen_random_uuid();
  v_activity uuid := gen_random_uuid();
  v_questions jsonb;
  v_activities jsonb;
  v_responses jsonb := p_analysis->'coded_responses';
  v_labels jsonb := p_analysis->'labels';
  v_results jsonb := p_analysis->'results';
  v_coded jsonb;
  v_inserted uuid;
begin
  if v_actor is null or p_import_id is null then
    raise exception 'Sign in before saving imported responses';
  end if;
  if exists (select 1 from public.studies where id = p_import_id and owner_id = v_actor and source_type = 'file') then
    return p_import_id;
  end if;
  if length(trim(coalesce(p_title, ''))) not between 1 and 160
    or length(trim(coalesce(p_question, ''))) not between 1 and 500 then
    raise exception 'Enter a study title of up to 160 characters and a research question of up to 500 characters';
  end if;
  if jsonb_typeof(v_responses) is distinct from 'array'
    or jsonb_typeof(v_labels) is distinct from 'array'
    or jsonb_typeof(v_results) is distinct from 'object' then
    raise exception 'Complete your analysis before saving a study';
  end if;
  if jsonb_array_length(v_responses) not between 1 and 1000
    or octet_length(p_analysis::text) > 20000000 then
    raise exception 'Save an analysis with 1–1,000 responses and up to 20 MB of analysis data';
  end if;
  if exists (select 1 from jsonb_array_elements(v_responses) as response(row)
    where jsonb_typeof(row->'original') is distinct from 'string'
      or length(trim(row->>'original')) = 0) then
    raise exception 'Every imported response must have original text';
  end if;
  if (select count(*) from jsonb_array_elements(v_labels) as theme(label) where label->>'name' <> 'Unclassified')
    not between 1 and 10 then
    raise exception 'Save a codebook with 1–10 named themes first';
  end if;

  v_questions := jsonb_build_array(jsonb_build_object('id', v_question, 'position', 0, 'prompt', trim(p_question)));
  v_activities := jsonb_build_array(jsonb_build_object('id', v_activity, 'position', 0,
    'title', 'Imported responses', 'kind', 'survey', 'required', true, 'opens_after_days', 0,
    'due_after_days', null, 'questions', v_questions));

  insert into public.studies(id, owner_id, title, research_question, description, additional_context,
    status, current_version_id, source_type, activity_plan)
  values (p_import_id, v_actor, trim(p_title), trim(p_question), coalesce(p_description, ''),
    coalesce(p_context, ''), 'closed', v_version, 'file', v_activities)
  on conflict (id) do nothing returning id into v_inserted;
  if v_inserted is null then
    if exists (select 1 from public.studies where id = p_import_id and owner_id = v_actor and source_type = 'file') then
      return p_import_id;
    end if;
    raise exception 'This import could not be saved to your account';
  end if;

  insert into public.study_versions(id, study_id, version_number, title, description, research_question,
    additional_context, consent_text, consent_required, participant_mode, questions, activities, published_by)
  values (v_version, p_import_id, 1, trim(p_title), coalesce(p_description, ''), trim(p_question),
    coalesce(p_context, ''), '', false, 'anonymous', v_questions, v_activities, v_actor);

  with source as materialized (
    select gen_random_uuid() as id, row, position
    from jsonb_array_elements(v_responses) with ordinality as response(row, position)
  ), saved as (
    insert into public.study_submissions(id, study_id, study_version_id, activity_id, answers, created_at)
    select id, p_import_id, v_version, v_activity, jsonb_build_object(v_question::text, row->'original'),
      now() + position * interval '1 microsecond'
    from source
    returning id
  )
  select jsonb_agg(row || jsonb_build_object('submission_id', source.id, 'study_version_id', v_version)
    order by position) into v_coded from source join saved using (id);

  perform public.save_study_analysis(jsonb_build_object('study_id', p_import_id,
    'study_version_id', v_version, 'question_id', v_question, 'labels', v_labels, 'coded_responses', v_coded,
    'classifications', p_analysis->'classifications', 'stage', 'results', 'response_count', jsonb_array_length(v_coded),
    'results', (v_results - array['_draft', '_completed', '_run_id']) || jsonb_build_object('_run_id', 'import:' || p_import_id)), 0);
  return p_import_id;
end;
$$;

revoke all on function public.save_file_study(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_file_study(uuid,text,text,text,text,jsonb) to authenticated;

commit;
