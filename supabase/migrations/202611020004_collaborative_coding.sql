-- Independent ballots are never exposed through direct table access.
begin;
create table public.study_coding_rounds (
 id uuid primary key default gen_random_uuid(), study_id uuid not null references public.studies(id) on delete cascade,
 version_id uuid not null, question_id uuid not null, title text not null check(length(title) between 1 and 160),
 prompt text not null, codebook jsonb not null, responses jsonb not null,
 state text not null default 'coding' check(state in ('coding','comparison','finalized','cancelled')),
 revision integer not null default 1, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 revealed_at timestamptz, finalized_at timestamptz, applied_run_key text,
 foreign key(study_id,version_id) references public.study_versions(study_id,id)
);
create table public.study_coding_assignments (
 round_id uuid not null references public.study_coding_rounds(id) on delete cascade,
 coder_id uuid not null references auth.users(id), response_ids uuid[] not null,
 ballot jsonb not null default '{}', revision integer not null default 0,
 updated_at timestamptz, submitted_at timestamptz,
 primary key(round_id,coder_id)
);
create table public.study_coding_decisions (
 round_id uuid not null references public.study_coding_rounds(id) on delete cascade, response_id uuid not null,
 themes jsonb not null, rationale text not null check(length(trim(rationale)) between 1 and 4000),
 revision integer not null default 1, decided_by uuid not null references auth.users(id), decided_at timestamptz not null default now(),
 primary key(round_id,response_id)
);
create table public.study_coding_events (
 id uuid primary key default gen_random_uuid(), round_id uuid not null references public.study_coding_rounds(id) on delete cascade,
 actor_id uuid not null references auth.users(id), kind text not null, details jsonb not null default '{}', recorded_at timestamptz not null default now()
);
create index study_coding_round_lookup on public.study_coding_rounds(study_id,version_id,created_at desc);
alter table public.study_coding_rounds enable row level security;
alter table public.study_coding_assignments enable row level security;
alter table public.study_coding_decisions enable row level security;
alter table public.study_coding_events enable row level security;
revoke all on public.study_coding_rounds,public.study_coding_assignments,public.study_coding_decisions,public.study_coding_events from public,anon,authenticated;

create function public.coding_theme_set(p_themes jsonb,p_codebook jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb;
begin
 if jsonb_typeof(p_themes) is distinct from 'array' or jsonb_array_length(p_themes)>10 then raise exception 'Choose themes from this round codebook'; end if;
 if exists(select 1 from jsonb_array_elements(p_themes) t where jsonb_typeof(t)<>'string' or not exists(select 1 from jsonb_array_elements(p_codebook) c where c->>'name'=t#>>'{}')) then raise exception 'Choose themes from this round codebook'; end if;
 select coalesce(jsonb_agg(to_jsonb(name) order by name),'[]') into result from (select distinct value as name from jsonb_array_elements_text(p_themes)) x;
 return result;
end $$;
revoke all on function public.coding_theme_set(jsonb,jsonb) from public,anon,authenticated;

create function public.create_coding_round(p_study_id uuid,p_version_id uuid,p_question_id uuid,p_title text,p_assignments jsonb,p_expected_analysis_revision integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.study_analyses; book jsonb; rows jsonb; q text; id uuid; item jsonb; ids uuid[]; coder uuid; seen uuid[]:='{}';
begin
 if public.study_role(p_study_id) is distinct from 'owner' then raise exception 'Only the study owner can manage coding rounds'; end if;
 select * into a from public.study_analyses where study_id=p_study_id and study_version_id=p_version_id and question_id=p_question_id for update;
 if a.study_id is null or a.revision is distinct from p_expected_analysis_revision then raise sqlstate 'PT409' using message='Refresh the study to use the latest saved codebook'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',t->>'name','description',coalesce(t->>'description',''),'include_when',coalesce(t->>'include_when',''),'exclude_when',coalesce(t->>'exclude_when',''),'example',coalesce(t->>'example',''),'color',coalesce(t->>'color','#176b52'))),'[]') into book
 from jsonb_array_elements(coalesce(nullif(a.labels,'[]'::jsonb),a.results->'_completed'->0->'labels','[]')) t where t->>'name'<>'Unclassified';
 if jsonb_array_length(book) not between 1 and 10 or exists(select 1 from jsonb_array_elements(book) t where (length(trim(coalesce(t->>'name',''))) not between 1 and 30 or lower(t->>'name')='unclassified'))
 or (select count(distinct lower(t->>'name')) from jsonb_array_elements(book) t)<>jsonb_array_length(book) then raise exception 'Save a codebook with 1–10 unique named themes first'; end if;
 if length(trim(coalesce(p_title,''))) not between 1 and 160 or jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments) not between 1 and 10 or octet_length(p_assignments::text)>100000 then raise exception 'Add a title and 1–10 coder assignments'; end if;
 select t->>'prompt' into q from public.study_versions v,jsonb_array_elements(v.questions) t where v.id=p_version_id and v.study_id=p_study_id and t->>'id'=p_question_id::text;
 if q is null then raise exception 'Question does not belong to this published version'; end if;
 for item in select * from jsonb_array_elements(p_assignments) loop
  coder:=(item->>'coder_id')::uuid;
  if coder is null or coder=any(seen) or not (exists(select 1 from public.studies s where s.id=p_study_id and s.owner_id=coder) or exists(select 1 from public.study_members m where m.study_id=p_study_id and m.user_id=coder and m.accepted_at is not null and m.role='researcher')) then raise exception 'Assign each active owner or researcher once'; end if;
  seen:=array_append(seen,coder);
  if jsonb_typeof(item->'response_ids') is distinct from 'array' or jsonb_array_length(item->'response_ids') not between 1 and 500 then raise exception 'Assign 1–500 responses to each coder'; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(item->'response_ids');
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) or exists(select 1 from unnest(ids) x where not exists(select 1 from public.study_submissions s where s.id=x and s.study_id=p_study_id and s.study_version_id=p_version_id and length(trim(coalesce(s.answers->>p_question_id::text,'')))>0)) then raise exception 'Choose distinct responses from this study question and version'; end if;
 end loop;
 select jsonb_agg(jsonb_build_object('id',s.id,'original',s.answers->>p_question_id::text) order by s.created_at,s.id) into rows from public.study_submissions s
 where s.id in (select selected.value::uuid from jsonb_array_elements(p_assignments) as assignment_element(value),jsonb_array_elements_text(assignment_element.value->'response_ids') as selected(value));
 if jsonb_array_length(rows)>500 or octet_length(rows::text)>5000000 or octet_length(book::text)>50000 then raise exception 'Choose a smaller coding sample'; end if;
 insert into public.study_coding_rounds(study_id,version_id,question_id,title,prompt,codebook,responses,created_by) values(p_study_id,p_version_id,p_question_id,trim(p_title),q,book,rows,auth.uid()) returning study_coding_rounds.id into id;
 for item in select * from jsonb_array_elements(p_assignments) loop
  insert into public.study_coding_assignments(round_id,coder_id,response_ids) values(id,(item->>'coder_id')::uuid,array(select value::uuid from jsonb_array_elements_text(item->'response_ids')));
 end loop;
 insert into public.study_coding_events(round_id,actor_id,kind) values(id,auth.uid(),'round_created');
 return id;
end $$;

create function public.list_coding_rounds(p_study_id uuid,p_version_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if public.study_role(p_study_id) is null then raise exception 'Study access denied'; end if;
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
 select r.id,r.title,r.prompt,r.question_id,r.state,r.revision,r.created_at,r.applied_run_key,
 jsonb_array_length(r.responses) as response_count,(select count(*) from public.study_coding_assignments a where a.round_id=r.id) as coder_count,
 (select count(*) from public.study_coding_assignments a where a.round_id=r.id and a.submitted_at is not null) as submitted_count,
 exists(select 1 from public.study_coding_assignments a where a.round_id=r.id and a.coder_id=auth.uid()) as assigned_to_me
 from public.study_coding_rounds r where r.study_id=p_study_id and r.version_id=p_version_id) t),'[]');
end $$;

create function public.get_coding_round(p_round_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.study_coding_rounds; access text; visible boolean; assignments jsonb; responses jsonb; decisions jsonb; events jsonb;
begin
 select * into r from public.study_coding_rounds where id=p_round_id;
 access:=public.study_role(r.study_id);
 if r.id is null or access is null then raise exception 'Study access denied'; end if;
 visible:=r.state in ('comparison','finalized');
 select coalesce(jsonb_agg(jsonb_build_object('coder_id',a.coder_id,'response_ids',a.response_ids,'revision',case when a.coder_id=auth.uid() or visible then a.revision else null end,'submitted_at',a.submitted_at,
 'label',case when s.owner_id=a.coder_id then 'Study owner' else coalesce(m.email,'Former team member') end,
 'ballot',case when visible or (a.coder_id=auth.uid() and access in ('owner','researcher')) then a.ballot else null end) order by a.coder_id),'[]') into assignments
 from public.study_coding_assignments a join public.studies s on s.id=r.study_id left join public.study_members m on m.study_id=r.study_id and m.user_id=a.coder_id where a.round_id=r.id;
 select coalesce(jsonb_agg(item order by ord),'[]') into responses from jsonb_array_elements(r.responses) with ordinality x(item,ord)
 where visible or access='owner' or (access='researcher' and exists(select 1 from public.study_coding_assignments a where a.round_id=r.id and a.coder_id=auth.uid() and (item->>'id')::uuid=any(a.response_ids)));
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') into decisions from public.study_coding_decisions d where d.round_id=r.id and visible;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at desc),'[]') into events from (select kind,details,actor_id,recorded_at from public.study_coding_events where round_id=r.id order by recorded_at desc,id desc limit 100) e;
 return jsonb_build_object('round',to_jsonb(r)-'responses'||jsonb_build_object('responses',responses),'assignments',assignments,'decisions',decisions,'events',events,'can_manage',access='owner','can_code',access in ('owner','researcher'));
end $$;

create function public.save_coding_ballot(p_round_id uuid,p_ballot jsonb,p_expected_revision integer,p_submit boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.study_coding_rounds; a public.study_coding_assignments; item record; clean jsonb:='{}';
begin
 select * into r from public.study_coding_rounds where id=p_round_id for update;
 if not coalesce(public.can_edit_study(r.study_id),false) then raise exception 'Active researcher access required'; end if;
 select * into a from public.study_coding_assignments where round_id=r.id and coder_id=auth.uid();
 if a.coder_id is null or r.state<>'coding' or a.submitted_at is not null then raise exception 'This assignment is not open for your coding'; end if;
 if p_expected_revision is distinct from a.revision then raise sqlstate 'PT409' using message='This ballot changed in another tab. Reload before saving'; end if;
 if jsonb_typeof(p_ballot) is distinct from 'object' or octet_length(p_ballot::text)>1200000 then raise exception 'Invalid coding choices'; end if;
 for item in select * from jsonb_each(p_ballot) loop
  if not item.key=any(a.response_ids::text[]) or jsonb_typeof(item.value) is distinct from 'object' or jsonb_typeof(item.value->'note') is distinct from 'string' or length(item.value->>'note')>2000 then raise exception 'Code only your assigned responses with notes under 2,000 characters'; end if;
  clean:=clean||jsonb_build_object(item.key,jsonb_build_object('themes',case when not p_submit and (item.value->'themes' is null or item.value->'themes'='null'::jsonb) then 'null'::jsonb else public.coding_theme_set(item.value->'themes',r.codebook) end,'note',item.value->>'note'));
 end loop;
 if p_submit and exists(select 1 from unnest(a.response_ids) x where jsonb_typeof(clean->x::text->'themes') is distinct from 'array') then raise exception 'Code every assigned response before submitting; choose no matching theme explicitly when appropriate'; end if;
 update public.study_coding_assignments set ballot=clean,revision=revision+1,updated_at=now(),submitted_at=case when p_submit then now() end where round_id=r.id and coder_id=auth.uid();
 insert into public.study_coding_events(round_id,actor_id,kind,details) values(r.id,auth.uid(),case when p_submit then 'ballot_submitted' else 'ballot_saved' end,jsonb_build_object('revision',a.revision+1));
 return public.get_coding_round(r.id);
end $$;

create function public.set_coding_round_state(p_round_id uuid,p_state text,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.study_coding_rounds;
begin
 select * into r from public.study_coding_rounds where id=p_round_id for update;
 if public.study_role(r.study_id) is distinct from 'owner' then raise exception 'Only the study owner can manage coding rounds'; end if;
 if r.revision is distinct from p_expected_revision then raise sqlstate 'PT409' using message='The coding round changed. Reload before continuing'; end if;
 if p_state='comparison' and r.state='coding' then
  if exists(select 1 from public.study_coding_assignments a where a.round_id=r.id and (a.submitted_at is null or not (exists(select 1 from public.studies s where s.id=r.study_id and s.owner_id=a.coder_id) or exists(select 1 from public.study_members m where m.study_id=r.study_id and m.user_id=a.coder_id and m.accepted_at is not null and m.role='researcher')))) then raise exception 'Every assigned active coder must submit before comparison'; end if;
 elsif p_state='finalized' and r.state='comparison' then
  if exists(select 1 from jsonb_array_elements(r.responses) response where (select count(distinct a.ballot->(response->>'id')->'themes') from public.study_coding_assignments a where a.round_id=r.id and (response->>'id')::uuid=any(a.response_ids))>1 and not exists(select 1 from public.study_coding_decisions d where d.round_id=r.id and d.response_id=(response->>'id')::uuid)) then raise exception 'Resolve every disagreement before finalizing'; end if;
 elsif p_state='cancelled' and r.state='coding' then null;
 else raise exception 'This coding round cannot make that transition'; end if;
 update public.study_coding_rounds set state=p_state,revision=revision+1,revealed_at=case when p_state='comparison' then now() else revealed_at end,finalized_at=case when p_state='finalized' then now() else finalized_at end where id=r.id;
 insert into public.study_coding_events(round_id,actor_id,kind) values(r.id,auth.uid(),'round_'||p_state);
 return public.get_coding_round(r.id);
end $$;

create function public.save_coding_decision(p_round_id uuid,p_response_id uuid,p_themes jsonb,p_rationale text,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.study_coding_rounds; d public.study_coding_decisions; themes jsonb;
begin
 select * into r from public.study_coding_rounds where id=p_round_id for update;
 if public.study_role(r.study_id) is distinct from 'owner' then raise exception 'Only the study owner can adjudicate coding'; end if;
 if r.state<>'comparison' then raise exception 'Open comparison before adjudicating'; end if;
 if not exists(select 1 from jsonb_array_elements(r.responses) x where x->>'id'=p_response_id::text) then raise exception 'Response is outside this coding round'; end if;
 select * into d from public.study_coding_decisions where round_id=r.id and response_id=p_response_id;
 if p_expected_revision is distinct from coalesce(d.revision,0) then raise sqlstate 'PT409' using message='Another decision was saved. Reload before continuing'; end if;
 if length(trim(coalesce(p_rationale,''))) not between 1 and 4000 then raise exception 'Record a rationale for the final coding decision'; end if;
 themes:=public.coding_theme_set(p_themes,r.codebook);
 insert into public.study_coding_decisions(round_id,response_id,themes,rationale,decided_by) values(r.id,p_response_id,themes,trim(p_rationale),auth.uid()) on conflict(round_id,response_id) do update set themes=excluded.themes,rationale=excluded.rationale,decided_by=auth.uid(),decided_at=now(),revision=public.study_coding_decisions.revision+1;
 update public.study_coding_rounds set revision=revision+1 where id=r.id;
 insert into public.study_coding_events(round_id,actor_id,kind,details) values(r.id,auth.uid(),'decision_saved',jsonb_build_object('response_id',p_response_id,'before',d.themes,'after',themes,'rationale',trim(p_rationale)));
 return public.get_coding_round(r.id);
end $$;

create function public.apply_coding_consensus(p_round_id uuid,p_expected_analysis_revision integer) returns text
language plpgsql security definer set search_path='' as $$
declare r public.study_coding_rounds; a public.study_analyses; response jsonb; names jsonb; coded jsonb:='[]'; categories jsonb:='{}'; labels jsonb; history jsonb; key text; theme jsonb; i integer:=0;
begin
 select * into r from public.study_coding_rounds where id=p_round_id for update;
 if public.study_role(r.study_id) is distinct from 'owner' then raise exception 'Only the study owner can apply consensus'; end if;
 if r.state<>'finalized' or r.applied_run_key is not null then raise exception 'Finalize this round and apply its consensus only once'; end if;
 select * into a from public.study_analyses where study_id=r.study_id and study_version_id=r.version_id and question_id=r.question_id for update;
 if a.revision is distinct from p_expected_analysis_revision then raise sqlstate 'PT409' using message='The analysis changed. Refresh before applying consensus'; end if;
 if a.stage<>'results' then raise exception 'Finish the current analysis before applying consensus; saved work is preserved'; end if;
 history:=coalesce(a.results->'_completed','[]');
 if a.results is not null and not coalesce((a.results->>'_draft')::boolean,false) then history:=jsonb_build_array(to_jsonb(a)||jsonb_build_object('results',a.results-'_completed'))||history; end if;
 labels:=r.codebook||jsonb_build_array(jsonb_build_object('name','Unclassified','description','No matching codebook theme','color','#cccccc'));
 for theme in select * from jsonb_array_elements(labels) loop categories:=categories||jsonb_build_object(theme->>'name','[]'::jsonb);end loop;
 for response in select * from jsonb_array_elements(r.responses) loop
  select themes into names from public.study_coding_decisions where round_id=r.id and response_id=(response->>'id')::uuid;
  if names is null then select ballot->(response->>'id')->'themes' into names from public.study_coding_assignments where round_id=r.id and (response->>'id')::uuid=any(response_ids) limit 1;end if;
  if names='[]'::jsonb then names:='["Unclassified"]'::jsonb;end if;
  coded:=coded||jsonb_build_array(jsonb_build_object('original',response->>'original','cleaned',response->>'original','submission_id',response->>'id','study_version_id',r.version_id,'coding_round_id',r.id,'themes',(select jsonb_agg(t) from jsonb_array_elements(labels) t where names ? (t->>'name'))));
  for key in select * from jsonb_array_elements_text(names) loop categories:=jsonb_set(categories,array[key],(categories->key)||to_jsonb(i));end loop;
  i:=i+1;
 end loop;
 key:='consensus:'||r.id;
 perform public.save_study_analysis(jsonb_build_object('study_id',r.study_id,'study_version_id',r.version_id,'question_id',r.question_id,'labels',labels,'coded_responses',coded,'classifications',categories,'results',jsonb_build_object('_draft',true,'_run_id',key,'_completed',history),'stage','review','response_count',i),p_expected_analysis_revision);
 update public.study_coding_rounds set applied_run_key=key,revision=revision+1 where id=r.id;
 insert into public.study_coding_events(round_id,actor_id,kind) values(r.id,auth.uid(),'consensus_applied');
 return key;
end $$;

revoke all on function public.create_coding_round(uuid,uuid,uuid,text,jsonb,integer),public.list_coding_rounds(uuid,uuid),public.get_coding_round(uuid),public.save_coding_ballot(uuid,jsonb,integer,boolean),public.set_coding_round_state(uuid,text,integer),public.save_coding_decision(uuid,uuid,jsonb,text,integer),public.apply_coding_consensus(uuid,integer) from public,anon;
grant execute on function public.create_coding_round(uuid,uuid,uuid,text,jsonb,integer),public.list_coding_rounds(uuid,uuid),public.get_coding_round(uuid),public.save_coding_ballot(uuid,jsonb,integer,boolean),public.set_coding_round_state(uuid,text,integer),public.save_coding_decision(uuid,uuid,jsonb,text,integer),public.apply_coding_consensus(uuid,integer) to authenticated;
create or replace function public.get_study_run_review(p_study_id uuid,p_version_id uuid,p_question_id uuid,p_run_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run jsonb; r public.study_run_reviews; h text; events jsonb;
begin
 if public.study_role(p_study_id) is null then raise exception 'Study access denied'; end if;
 run:=public.quality_saved_run(p_study_id,p_version_id,p_question_id,p_run_key);
 -- Only research content determines validity; unrelated metadata/history do not.
 h:=encode(sha256(convert_to(jsonb_build_object('labels',run->'labels','coded_responses',run->'coded_responses','results',run->'results','response_count',run->'response_count')::text,'UTF8')),'hex');
 select * into r from public.study_run_reviews where study_id=p_study_id and version_id=p_version_id and question_id=p_question_id and run_key=p_run_key;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at desc),'[]') into events from
   (select id,kind,details,actor_id,recorded_at from public.study_quality_events where study_id=p_study_id and version_id=p_version_id and question_id=p_question_id and run_key=p_run_key order by recorded_at desc,id desc limit 100) e;
 return jsonb_build_object('snapshot_hash',h,'run',run,'review',case when r.study_id is null then null else to_jsonb(r) end,
   'current',r.snapshot_hash=h,'can_edit',public.can_edit_study(p_study_id),'events',events,'collaboration',(select public.get_coding_round(c.id) from public.study_coding_rounds c where c.study_id=p_study_id and c.version_id=p_version_id and c.question_id=p_question_id and c.applied_run_key=p_run_key and c.state='finalized'));
end $$;

commit;
