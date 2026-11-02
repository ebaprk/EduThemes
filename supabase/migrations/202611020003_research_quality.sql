-- Run-bound review and append-only coding/review history. No participant access.
begin;
create table public.study_run_reviews (
 study_id uuid not null references public.studies(id) on delete cascade,
 version_id uuid not null, question_id uuid not null, run_key text not null,
 snapshot_hash text not null, revision integer not null default 1,
 methods text not null, limitations text not null, ai_disclosure text not null,
 flags jsonb not null default '{}', quotes jsonb not null default '[]',
 status text not null check(status in ('draft','approved')),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 signed_by uuid references auth.users(id), signed_at timestamptz,
 primary key(study_id,version_id,question_id,run_key),
 foreign key(study_id,version_id) references public.study_versions(study_id,id)
);
create table public.study_quality_events (
 id uuid primary key default gen_random_uuid(), study_id uuid not null references public.studies(id) on delete cascade,
 version_id uuid not null, question_id uuid not null, run_key text,
 actor_id uuid references auth.users(id), recorded_at timestamptz not null default now(),
 kind text not null, details jsonb not null default '{}',
 foreign key(study_id,version_id) references public.study_versions(study_id,id)
);
create index study_quality_events_lookup on public.study_quality_events(study_id,version_id,question_id,recorded_at desc);
alter table public.study_run_reviews enable row level security;
alter table public.study_quality_events enable row level security;
revoke all on public.study_run_reviews,public.study_quality_events from anon,authenticated;

create function public.list_study_codebooks() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(book)),'[]') from (
 select a.study_id,a.study_version_id,a.question_id,s.title,v.version_number,
   (select q->>'prompt' from jsonb_array_elements(v.questions) q where q->>'id'=a.question_id::text) as prompt,
   coalesce(nullif(a.labels,'[]'::jsonb),a.results->'_completed'->0->'labels','[]'::jsonb) as labels
 from public.study_analyses a join public.studies s on s.id=a.study_id
 join public.study_versions v on v.id=a.study_version_id
 where public.study_role(a.study_id) is not null
   and jsonb_array_length(coalesce(nullif(a.labels,'[]'::jsonb),a.results->'_completed'->0->'labels','[]'::jsonb))>0
 order by a.updated_at desc limit 100
 ) book;
$$;
revoke all on function public.list_study_codebooks() from public,anon;
grant execute on function public.list_study_codebooks() to authenticated;

-- Private helper. A named completed run is resolved from the actual saved analysis,
-- never from client-provided data. Row lock also serializes review and coding writes.
create function public.quality_saved_run(p_study uuid,p_version uuid,p_question uuid,p_run text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.study_analyses; candidate jsonb;
begin
 select * into a from public.study_analyses where study_id=p_study and study_version_id=p_version and question_id=p_question for update;
 if a.study_id is null then raise exception 'Save this analysis before reviewing it'; end if;
 if a.stage='results' and a.results is not null and not coalesce((a.results->>'_draft')::boolean,false)
   and coalesce(a.results->>'_run_id','legacy-'||a.revision)=p_run then
   return to_jsonb(a)-'updated_at'-'updated_by'-'revision' || jsonb_build_object('results',a.results-'_completed');
 end if;
 select item into candidate from jsonb_array_elements(coalesce(a.results->'_completed','[]')) item
 where coalesce(item->'results'->>'_run_id','legacy-'||(item->>'revision'))=p_run limit 1;
 if candidate is null then raise exception 'This saved findings run is no longer available'; end if;
 return candidate-'updated_at'-'updated_by'-'revision' || jsonb_build_object('results',(candidate->'results')-'_completed');
end $$;
revoke all on function public.quality_saved_run(uuid,uuid,uuid,text) from public,anon,authenticated;

create function public.get_study_run_review(p_study_id uuid,p_version_id uuid,p_question_id uuid,p_run_key text)
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
   'current',r.snapshot_hash=h,'can_edit',public.can_edit_study(p_study_id),'events',events);
end $$;
revoke all on function public.get_study_run_review(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.get_study_run_review(uuid,uuid,uuid,text) to authenticated;

create function public.save_study_run_review(p_study_id uuid,p_version_id uuid,p_question_id uuid,p_run_key text,p_snapshot_hash text,p_expected_revision integer,p_review jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; run jsonb; flags jsonb:=coalesce(p_review->'flags','{}'); quotes jsonb:=coalesce(p_review->'quotes','[]');
 r public.study_run_reviews; approved boolean:=p_review->>'status'='approved'; item record; total integer;
begin
 if not public.can_edit_study(p_study_id) or auth.uid() is null then raise exception 'Editing access required'; end if;
 context:=public.get_study_run_review(p_study_id,p_version_id,p_question_id,p_run_key);
 if p_snapshot_hash is distinct from context->>'snapshot_hash' then raise sqlstate 'PT409' using message='The saved analysis changed. Reload its review before continuing'; end if;
 if p_expected_revision is null or p_expected_revision<0 or p_expected_revision<>coalesce((context->'review'->>'revision')::integer,0) then
   raise sqlstate 'PT409' using message='Another researcher changed this review. Reload before saving'; end if;
 if p_review->>'status' is null or p_review->>'status' not in ('draft','approved') then raise exception 'Choose a review status'; end if;
 if jsonb_typeof(flags) is distinct from 'object' or jsonb_typeof(quotes) is distinct from 'array' or octet_length(p_review::text)>100000 then raise exception 'Invalid review details'; end if;
 if length(coalesce(p_review->>'methods',''))>10000 or length(coalesce(p_review->>'limitations',''))>10000 or length(coalesce(p_review->>'ai_disclosure',''))>10000 then raise exception 'Keep each report section under 10,000 characters'; end if;
 run:=public.quality_saved_run(p_study_id,p_version_id,p_question_id,p_run_key); total:=jsonb_array_length(coalesce(run->'coded_responses','[]'));
 for item in select * from jsonb_each(flags) loop
   if item.key !~ '^(0|[1-9][0-9]{0,8})$' then raise exception 'Invalid response flag'; end if;
   if item.key::integer>=total or jsonb_typeof(item.value) is distinct from 'object' or jsonb_typeof(item.value->'note') is distinct from 'string'
     or length(trim(item.value->>'note'))=0 or length(item.value->>'note')>2000 or jsonb_typeof(item.value->'resolved') is distinct from 'boolean' then raise exception 'Invalid response flag'; end if;
   if approved and not (item.value->>'resolved')::boolean then raise exception 'Resolve every response flag before sign-off'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(quotes) q where q::text !~ '^(0|[1-9][0-9]{0,8})$' or (case when q::text ~ '^(0|[1-9][0-9]{0,8})$' then (q::text)::integer>=total else true end)) then raise exception 'Choose quotes from this saved run'; end if;
 if approved and (p_review->>'attested' is distinct from 'true' or trim(coalesce(p_review->>'methods',''))='' or trim(coalesce(p_review->>'limitations',''))='' or trim(coalesce(p_review->>'ai_disclosure',''))='') then raise exception 'Document methods, limitations and AI assistance, and confirm your review before sign-off'; end if;
 insert into public.study_run_reviews(study_id,version_id,question_id,run_key,snapshot_hash,methods,limitations,ai_disclosure,flags,quotes,status,updated_by,signed_by,signed_at)
 values(p_study_id,p_version_id,p_question_id,p_run_key,p_snapshot_hash,coalesce(p_review->>'methods',''),coalesce(p_review->>'limitations',''),coalesce(p_review->>'ai_disclosure',''),flags,quotes,p_review->>'status',auth.uid(),case when approved then auth.uid() end,case when approved then now() end)
 on conflict(study_id,version_id,question_id,run_key) do update set snapshot_hash=excluded.snapshot_hash,methods=excluded.methods,limitations=excluded.limitations,ai_disclosure=excluded.ai_disclosure,flags=excluded.flags,quotes=excluded.quotes,status=excluded.status,updated_by=auth.uid(),updated_at=now(),signed_by=excluded.signed_by,signed_at=excluded.signed_at,revision=public.study_run_reviews.revision+1 returning * into r;
 insert into public.study_quality_events(study_id,version_id,question_id,run_key,actor_id,kind,details)
 values(p_study_id,p_version_id,p_question_id,p_run_key,auth.uid(),case when approved then 'review_approved' else 'review_saved' end,jsonb_build_object('revision',r.revision,'snapshot_hash',r.snapshot_hash,'flag_count',(select count(*) from jsonb_object_keys(flags)),'quote_count',jsonb_array_length(quotes),'review_snapshot',to_jsonb(r)));
 return public.get_study_run_review(p_study_id,p_version_id,p_question_id,p_run_key);
end $$;
-- Avoid exposing any table write access; identities and timestamps are server-set.
revoke all on function public.save_study_run_review(uuid,uuid,uuid,text,text,integer,jsonb) from public,anon;
grant execute on function public.save_study_run_review(uuid,uuid,uuid,text,text,integer,jsonb) to authenticated;

create function public.record_study_coding_change() returns trigger language plpgsql security definer set search_path='' as $$
declare details jsonb; changed jsonb;
begin
 if tg_op='UPDATE' and new.labels is not distinct from old.labels and new.coded_responses is not distinct from old.coded_responses then return new; end if;
 select coalesce(jsonb_agg(jsonb_build_object('response',coalesce(n.ordinality,o.ordinality),'before',coalesce(o.value->'themes','[]'),'after',coalesce(n.value->'themes','[]'),'review_before',o.value->'review_decisions','review_after',n.value->'review_decisions')),'[]') into changed
 from jsonb_array_elements(new.coded_responses) with ordinality n(value,ordinality)
 full join jsonb_array_elements(case when tg_op='UPDATE' then old.coded_responses else '[]' end) with ordinality o(value,ordinality) using(ordinality)
 where n.value->'themes' is distinct from o.value->'themes' or n.value->'review_decisions' is distinct from o.value->'review_decisions';
 details:=jsonb_build_object('revision',new.revision,'codebook_changed',tg_op='INSERT' or new.labels is distinct from old.labels,'codebook_before',case when tg_op='UPDATE' then old.labels else '[]' end,'codebook_after',new.labels,'response_assignments',changed);
 insert into public.study_quality_events(study_id,version_id,question_id,run_key,actor_id,kind,details)
 values(new.study_id,new.study_version_id,new.question_id,new.results->>'_run_id',auth.uid(),'coding_saved',details);
 return new;
end $$;
revoke all on function public.record_study_coding_change() from public,anon,authenticated;
create trigger study_coding_history after insert or update on public.study_analyses for each row execute function public.record_study_coding_change();
commit;
