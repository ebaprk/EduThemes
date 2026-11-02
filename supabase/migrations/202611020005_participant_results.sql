-- Reviewed, version-specific results returned only through existing private credentials.
begin;
create table public.study_results_drafts (
 study_id uuid not null references public.studies(id) on delete cascade,
 version_id uuid not null, content jsonb not null default '{}', sources jsonb not null default '[]',
 revision integer not null default 1, updated_at timestamptz not null default now(), updated_by uuid not null references auth.users(id),
 current_release_id uuid,
 primary key(study_id,version_id),
 foreign key(study_id,version_id) references public.study_versions(study_id,id)
);
create table public.study_results_releases (
 id uuid primary key default gen_random_uuid(), study_id uuid not null references public.studies(id) on delete cascade,
 version_id uuid not null, release_number integer not null, content jsonb not null, sources jsonb not null,
 released_by uuid not null references auth.users(id), released_at timestamptz not null default now(),
 withdrawn_by uuid references auth.users(id), withdrawn_at timestamptz,
 unique(study_id,version_id,release_number),
 foreign key(study_id,version_id) references public.study_versions(study_id,id)
);
alter table public.study_results_drafts enable row level security;
alter table public.study_results_releases enable row level security;
revoke all on public.study_results_drafts,public.study_results_releases from public,anon,authenticated;

create function public.get_study_results_workspace(p_study_id uuid,p_version_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.study_results_drafts; history jsonb;
begin
 if public.study_role(p_study_id) is null then raise exception 'Study access denied'; end if;
 if not exists(select 1 from public.study_versions where study_id=p_study_id and id=p_version_id) then raise exception 'Choose a published study version'; end if;
 select * into d from public.study_results_drafts where study_id=p_study_id and version_id=p_version_id;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.release_number desc),'[]') into history from public.study_results_releases r where study_id=p_study_id and version_id=p_version_id;
 return jsonb_build_object('draft',case when d.study_id is null then null else to_jsonb(d) end,'releases',history);
end $$;

create function public.save_study_results_draft(p_study_id uuid,p_version_id uuid,p_content jsonb,p_sources jsonb,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.study_results_drafts; clean jsonb:='{}'; selected jsonb:='[]'; field text; source jsonb; context jsonb;
begin
 if auth.uid() is null or not public.can_edit_study(p_study_id) then raise exception 'Editing access required'; end if;
 -- The version lock serializes first saves as well as later saves and releases.
 perform 1 from public.study_versions where study_id=p_study_id and id=p_version_id for update;
 if not found then raise exception 'Choose a published study version'; end if;
 select * into d from public.study_results_drafts where study_id=p_study_id and version_id=p_version_id for update;
 if p_expected_revision is null or p_expected_revision<>coalesce(d.revision,0) then raise sqlstate 'PT409' using message='Another researcher changed the results summary. Reload before saving'; end if;
 if jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>40000 then raise exception 'Invalid results summary'; end if;
 foreach field in array array['title','overview','findings','limitations','next_steps','contact'] loop
  if p_content ? field and jsonb_typeof(p_content->field) is distinct from 'string' then raise exception 'Results sections must contain text'; end if;
  if length(coalesce(p_content->>field,''))>(case when field='title' then 200 else 5000 end) then raise exception 'Keep the title under 200 characters and each section under 5,000 characters'; end if;
  clean:=clean||jsonb_build_object(field,trim(coalesce(p_content->>field,'')));
 end loop;
 if jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources)>30 or octet_length(p_sources::text)>100000 then raise exception 'Choose up to 30 saved findings runs'; end if;
 for source in select * from jsonb_array_elements(p_sources) loop
  if jsonb_typeof(source) is distinct from 'object' or source->>'question_id' is null or source->>'run_key' is null then raise exception 'Invalid findings source'; end if;
  if exists(select 1 from jsonb_array_elements(selected) s where s->>'question_id'=source->>'question_id' and s->>'run_key'=source->>'run_key') then raise exception 'Choose each findings run only once'; end if;
  context:=public.get_study_run_review(p_study_id,p_version_id,(source->>'question_id')::uuid,source->>'run_key');
  if source->>'snapshot_hash' is distinct from context->>'snapshot_hash' or (source->>'review_revision')::integer is distinct from coalesce((context->'review'->>'revision')::integer,0) then raise sqlstate 'PT409' using message='The source findings or review changed. Refresh the source list before saving'; end if;
  selected:=selected||jsonb_build_array(jsonb_build_object('question_id',source->>'question_id','run_key',source->>'run_key','snapshot_hash',context->>'snapshot_hash','review_revision',coalesce((context->'review'->>'revision')::integer,0)));
 end loop;
 insert into public.study_results_drafts(study_id,version_id,content,sources,updated_by) values(p_study_id,p_version_id,clean,selected,auth.uid())
 on conflict(study_id,version_id) do update set content=excluded.content,sources=excluded.sources,revision=public.study_results_drafts.revision+1,updated_at=now(),updated_by=auth.uid();
 return public.get_study_results_workspace(p_study_id,p_version_id);
end $$;

create function public.release_study_results(p_study_id uuid,p_version_id uuid,p_expected_revision integer,p_attested boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.study_results_drafts; source jsonb; context jsonb; field text; next_number integer; release_id uuid;
begin
 if auth.uid() is null or public.study_role(p_study_id) is distinct from 'owner' then raise exception 'Only the study owner can release results'; end if;
 perform 1 from public.study_versions where study_id=p_study_id and id=p_version_id for update;
 select * into d from public.study_results_drafts where study_id=p_study_id and version_id=p_version_id for update;
 if d.study_id is null then raise exception 'Save a results draft first'; end if;
 if p_expected_revision is null or p_expected_revision<>d.revision then raise sqlstate 'PT409' using message='The results summary changed. Reload and preview before releasing'; end if;
 if p_attested is distinct from true then raise exception 'Confirm that you reviewed this summary for participants'; end if;
 foreach field in array array['title','overview','findings','limitations','contact'] loop
  if trim(coalesce(d.content->>field,''))='' then raise exception 'Complete the title, overview, findings, limitations, and contact sections'; end if;
 end loop;
 if jsonb_array_length(d.sources)=0 then raise exception 'Select at least one reviewed findings run'; end if;
 for source in select * from jsonb_array_elements(d.sources) loop
  context:=public.get_study_run_review(p_study_id,p_version_id,(source->>'question_id')::uuid,source->>'run_key');
  if context->>'current' is distinct from 'true' or context->'review'->>'status' is distinct from 'approved' or context->>'snapshot_hash' is distinct from source->>'snapshot_hash' or (context->'review'->>'revision')::integer is distinct from (source->>'review_revision')::integer then
   raise sqlstate 'PT409' using message='Every source must have a current sign-off matching this draft. Refresh sources, save, and preview again';
  end if;
 end loop;
 if exists(select 1 from public.study_results_releases where id=d.current_release_id and content=d.content and sources=d.sources and withdrawn_at is null) then raise exception 'This summary is already released'; end if;
 select coalesce(max(release_number),0)+1 into next_number from public.study_results_releases where study_id=p_study_id and version_id=p_version_id;
 insert into public.study_results_releases(study_id,version_id,release_number,content,sources,released_by) values(p_study_id,p_version_id,next_number,d.content,d.sources,auth.uid()) returning id into release_id;
 update public.study_results_drafts set current_release_id=release_id,revision=revision+1,updated_at=now(),updated_by=auth.uid() where study_id=p_study_id and version_id=p_version_id;
 return public.get_study_results_workspace(p_study_id,p_version_id);
end $$;

create function public.withdraw_study_results(p_study_id uuid,p_version_id uuid,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.study_results_drafts;
begin
 if auth.uid() is null or public.study_role(p_study_id) is distinct from 'owner' then raise exception 'Only the study owner can withdraw results'; end if;
 perform 1 from public.study_versions where study_id=p_study_id and id=p_version_id for update;
 select * into d from public.study_results_drafts where study_id=p_study_id and version_id=p_version_id for update;
 if d.study_id is null or p_expected_revision is null or d.revision<>p_expected_revision then raise sqlstate 'PT409' using message='The results summary changed. Reload before withdrawing'; end if;
 if d.current_release_id is null then raise exception 'No released summary to withdraw'; end if;
 update public.study_results_releases set withdrawn_at=now(),withdrawn_by=auth.uid() where id=d.current_release_id;
 update public.study_results_drafts set current_release_id=null,revision=revision+1,updated_at=now(),updated_by=auth.uid() where study_id=p_study_id and version_id=p_version_id;
 return public.get_study_results_workspace(p_study_id,p_version_id);
end $$;

create function public.get_participant_results(p_access_key text default null,p_submission_id uuid default null,p_request_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare study uuid; version uuid; e public.study_enrollments; v public.study_versions; released public.study_results_releases;
begin
 if p_access_key is not null and p_submission_id is null and p_request_id is null then
  e:=public.private_participation(p_access_key);study:=e.study_id;version:=e.study_version_id;
 elsif p_access_key is null and p_submission_id is not null and p_request_id is not null then
  select study_id,study_version_id into study,version from public.study_submissions where id=p_submission_id and submission_request_id=p_request_id;
 end if;
 if study is null then raise sqlstate 'PT401' using message='This private results link is invalid'; end if;
 select * into v from public.study_versions where id=version and study_id=study;
 select r.* into released from public.study_results_drafts d join public.study_results_releases r on r.id=d.current_release_id and r.study_id=d.study_id and r.version_id=d.version_id where d.study_id=study and d.version_id=version and r.withdrawn_at is null;
 -- Only the owner-released, allowlisted text is exposed. Never raw answers,
 -- source review records, coding choices, participant identity, or draft content.
 return jsonb_build_object('study_title',v.title,'version_number',v.version_number,'contact_info',v.contact_info,
  'release',case when released.id is null then null else jsonb_build_object('release_number',released.release_number,'released_at',released.released_at,'content',released.content) end);
end $$;

revoke all on function public.get_study_results_workspace(uuid,uuid),public.save_study_results_draft(uuid,uuid,jsonb,jsonb,integer),public.release_study_results(uuid,uuid,integer,boolean),public.withdraw_study_results(uuid,uuid,integer) from public,anon;
grant execute on function public.get_study_results_workspace(uuid,uuid),public.save_study_results_draft(uuid,uuid,jsonb,jsonb,integer),public.release_study_results(uuid,uuid,integer,boolean),public.withdraw_study_results(uuid,uuid,integer) to authenticated;
revoke all on function public.get_participant_results(text,uuid,uuid) from public;
grant execute on function public.get_participant_results(text,uuid,uuid) to anon,authenticated;
commit;
