-- Canvas launch state and identity are written ONLY by the trusted backend.
-- Apply after 202610090001_studies.sql. Existing anonymous participation remains supported.
begin;

alter table public.study_submissions
  add column participant_data jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(participant_data) = 'object'),
  add column canvas_session_id uuid,
  add column canvas_request_id uuid unique;

create table public.lti_logins (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  browser_hash text not null check (browser_hash ~ '^[a-f0-9]{64}$'),
  nonce text not null,
  registration_id text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create index lti_logins_expiry on public.lti_logins(expires_at);

create table public.lti_sessions (
  id uuid primary key default gen_random_uuid(),
  handoff_hash text unique check (handoff_hash ~ '^[a-f0-9]{64}$'),
  token_hash text unique check (token_hash ~ '^[a-f0-9]{64}$'),
  profile jsonb not null check (pg_catalog.jsonb_typeof(profile) = 'object'),
  handoff_expires_at timestamptz not null default (now() + interval '60 seconds'),
  expires_at timestamptz not null default (now() + interval '2 hours')
);
create index lti_sessions_expiry on public.lti_sessions(expires_at);
alter table public.lti_logins enable row level security;
alter table public.lti_sessions enable row level security;
revoke all on public.lti_logins, public.lti_sessions from public, anon, authenticated;

create function public.lti_create_login(
  p_state_hash text, p_browser_hash text, p_nonce text, p_registration_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.lti_logins where expires_at <= now();
  delete from public.lti_sessions
    where expires_at <= now() or (token_hash is null and handoff_expires_at <= now());
  insert into public.lti_logins(state_hash, browser_hash, nonce, registration_id)
    values (p_state_hash, p_browser_hash, p_nonce, p_registration_id);
end;
$$;

create function public.lti_consume_login(p_state_hash text, p_browser_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_login public.lti_logins%rowtype;
begin
  -- Atomic consumption across workers; mismatched browser cannot consume the state.
  delete from public.lti_logins
    where state_hash = p_state_hash and browser_hash = p_browser_hash and expires_at > now()
    returning * into v_login;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object('nonce', v_login.nonce, 'registration_id', v_login.registration_id);
end;
$$;

create function public.lti_create_handoff(p_handoff_hash text, p_profile jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.lti_sessions(handoff_hash, profile) values (p_handoff_hash, p_profile);
$$;

create function public.lti_exchange_handoff(p_handoff_hash text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile jsonb;
begin
  update public.lti_sessions set token_hash = p_token_hash, handoff_hash = null
    where handoff_hash = p_handoff_hash and token_hash is null
      and handoff_expires_at > now() and expires_at > now()
    returning profile into v_profile;
  return v_profile;
end;
$$;

create function public.lti_get_session(p_token_hash text)
returns jsonb language sql security definer set search_path = '' as $$
  select profile from public.lti_sessions where token_hash = p_token_hash and expires_at > now();
$$;

create function public.lti_delete_session(p_token_hash text)
returns void language sql security definer set search_path = '' as $$
  delete from public.lti_sessions where token_hash = p_token_hash;
$$;

create function public.submit_canvas_study(
  p_code text, p_answers jsonb, p_token_hash text, p_request_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_session public.lti_sessions%rowtype;
  v_previous public.study_submissions%rowtype;
  v_submission_id uuid;
  v_study_id uuid;
begin
  -- Serializes retries from this session and prevents attaching browser-supplied identity.
  select * into v_session from public.lti_sessions
    where token_hash = p_token_hash and expires_at > now() for update;
  if not found then raise sqlstate 'PT401' using message = 'Canvas session expired'; end if;
  if p_request_id is null or p_answers is null or pg_catalog.jsonb_typeof(p_answers) <> 'object' then
    raise sqlstate 'PT422' using message = 'Invalid submission';
  end if;
  if exists (select 1 from pg_catalog.jsonb_each(p_answers) e
    where pg_catalog.jsonb_typeof(e.value) <> 'string') then
    raise sqlstate 'PT422' using message = 'Answers must be strings';
  end if;
  select id into v_study_id from public.studies where share_code = upper(trim(p_code));
  select * into v_previous from public.study_submissions where canvas_request_id = p_request_id;
  if found then
    if v_previous.canvas_session_id = v_session.id and v_previous.study_id = v_study_id
      and v_previous.answers = (select pg_catalog.jsonb_object_agg(e.key, trim(e.value))
        from pg_catalog.jsonb_each_text(p_answers) e) then
      return v_previous.id;
    end if;
    raise sqlstate 'PT409' using message = 'Submission request already used';
  end if;
  begin
    -- Reuse existing complete-answer and open-study checks in the same transaction.
    v_submission_id := public.submit_study(p_code, p_answers);
  exception when raise_exception then
    raise sqlstate 'PT422' using message = 'Study closed or answers invalid';
  end;
  update public.study_submissions
    set participant_data = v_session.profile || pg_catalog.jsonb_build_object(
      'shared_at', now(), 'sharing_notice_version', 'canvas-participant-v1'),
      canvas_session_id = v_session.id, canvas_request_id = p_request_id
    where id = v_submission_id;
  return v_submission_id;
end;
$$;

-- Explicit grants: never leave SECURITY DEFINER functions executable by PUBLIC.
revoke all on function public.lti_create_login(text, text, text, text) from public, anon, authenticated;
revoke all on function public.lti_consume_login(text, text) from public, anon, authenticated;
revoke all on function public.lti_create_handoff(text, jsonb) from public, anon, authenticated;
revoke all on function public.lti_exchange_handoff(text, text) from public, anon, authenticated;
revoke all on function public.lti_get_session(text) from public, anon, authenticated;
revoke all on function public.lti_delete_session(text) from public, anon, authenticated;
revoke all on function public.submit_canvas_study(text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.lti_create_login(text, text, text, text) to service_role;
grant execute on function public.lti_consume_login(text, text) to service_role;
grant execute on function public.lti_create_handoff(text, jsonb) to service_role;
grant execute on function public.lti_exchange_handoff(text, text) to service_role;
grant execute on function public.lti_get_session(text) to service_role;
grant execute on function public.lti_delete_session(text) to service_role;
grant execute on function public.submit_canvas_study(text, jsonb, text, uuid) to service_role;

commit;
