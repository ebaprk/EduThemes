-- Durable, immutable analysis inputs/results. Browser roles only use scoped RPCs.
begin;
create table public.analysis_jobs (
 id uuid primary key default gen_random_uuid(),
 study_id uuid not null references public.studies(id) on delete cascade,
 version_id uuid not null,
 question_id uuid not null,
 run_id text not null check(length(run_id) between 1 and 200),
 kind text not null check(kind in ('classify','findings')),
 created_by uuid not null references auth.users(id),
 input_hash text not null,
 payload jsonb not null check(octet_length(payload::text)<=5000000),
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 result jsonb, error text, attempts integer not null default 0,
 lease_token uuid, lease_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(study_id,version_id) references public.study_versions(study_id,id),
 unique(study_id,version_id,question_id,run_id,kind,input_hash)
);
alter table public.analysis_jobs enable row level security;
revoke all on public.analysis_jobs from anon, authenticated;
create index analysis_jobs_pending on public.analysis_jobs(status,created_at);

create function public.analysis_job(p_study_id uuid,p_version_id uuid,p_question_id uuid,p_run_id text,p_kind text,p_payload jsonb default null,p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.analysis_jobs; r text;
begin
 r:=public.study_role(p_study_id);
 if r is null or r not in ('owner','researcher','reviewer') then raise exception 'Study access denied'; end if;
 if (p_payload is not null or p_retry) and r='reviewer' then raise exception 'Editing access required'; end if;
 if not exists(select 1 from public.study_versions v where v.study_id=p_study_id and v.id=p_version_id
   and exists(select 1 from jsonb_array_elements(v.questions) q where q->>'id'=p_question_id::text)) then raise exception 'Question does not belong to this study version'; end if;
 if p_kind not in ('classify','findings') then raise exception 'Invalid job type'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_study_id::text||p_version_id::text||p_question_id::text||p_run_id||p_kind,0));
 if p_payload is not null then
   if exists(select 1 from public.analysis_jobs where study_id=p_study_id and version_id=p_version_id and question_id=p_question_id and run_id=p_run_id and kind=p_kind and status in ('queued','running') and payload<>p_payload) then raise exception 'An analysis is already running. Open its result before submitting changed inputs'; end if;
   if jsonb_typeof(p_payload->'dataset') is distinct from 'array' or jsonb_array_length(p_payload->'dataset')=0
     or jsonb_typeof(p_payload->'labels') is distinct from 'array' then raise exception 'Responses and themes required'; end if;
   insert into public.analysis_jobs(study_id,version_id,question_id,run_id,kind,created_by,payload,input_hash)
    values(p_study_id,p_version_id,p_question_id,p_run_id,p_kind,auth.uid(),p_payload,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'))
    on conflict(study_id,version_id,question_id,run_id,kind,input_hash) do nothing;
 end if;
 select * into j from public.analysis_jobs where study_id=p_study_id and version_id=p_version_id and question_id=p_question_id and run_id=p_run_id and kind=p_kind
   and (p_payload is null or payload=p_payload) order by created_at desc,id limit 1 for update;
 if j.id is null then return null; end if;
 if p_retry and j.status='failed' then
   update public.analysis_jobs set status='queued',attempts=0,created_by=auth.uid(),error=null,lease_token=null,lease_until=null,updated_at=now() where id=j.id returning * into j;
 end if;
 -- Payload is returned with the result so a returning tab restores the exact submitted snapshot.
 return to_jsonb(j)-'lease_token'-'lease_until'-'created_by';
end $$;
revoke all on function public.analysis_job(uuid,uuid,uuid,text,text,jsonb,boolean) from public,anon;
grant execute on function public.analysis_job(uuid,uuid,uuid,text,text,jsonb,boolean) to authenticated;

create function public.claim_analysis_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.analysis_jobs;
begin
 update public.analysis_jobs a set status='failed',error='The researcher who started this job no longer has editing access.',lease_token=null,lease_until=null,updated_at=now()
 where status in ('queued','running') and not (exists(select 1 from public.studies s where s.id=a.study_id and s.owner_id=a.created_by)
 or exists(select 1 from public.study_members m where m.study_id=a.study_id and m.user_id=a.created_by and m.accepted_at is not null and m.role='researcher'));
 update public.analysis_jobs set status='failed',error='Processing was interrupted repeatedly. Retry to continue.',lease_token=null,lease_until=null,updated_at=now()
   where status='running' and lease_until<now() and attempts>=3;
 select * into j from public.analysis_jobs a where (status='queued' or (status='running' and lease_until<now()))
   and (exists(select 1 from public.studies s where s.id=a.study_id and s.owner_id=a.created_by)
     or exists(select 1 from public.study_members m where m.study_id=a.study_id and m.user_id=a.created_by and m.accepted_at is not null and m.role='researcher'))
   order by created_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 update public.analysis_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds',updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
create function public.update_analysis_job(p_id uuid,p_token uuid,p_status text,p_result jsonb default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('running','completed','failed') then raise exception 'Invalid status'; end if;
 update public.analysis_jobs set status=p_status,result=p_result,error=p_error,updated_at=now(),
 lease_until=case when p_status='running' then now()+interval '120 seconds' else null end
 where id=p_id and lease_token=p_token and status='running' and lease_until>now();
 return found;
end $$;
revoke all on function public.claim_analysis_job() from public,anon,authenticated;
revoke all on function public.update_analysis_job(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_analysis_job() to service_role;
grant execute on function public.update_analysis_job(uuid,uuid,text,jsonb,text) to service_role;
commit;
