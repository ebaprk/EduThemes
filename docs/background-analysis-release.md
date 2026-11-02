# Recoverable study analysis jobs

Implemented November 2, 2026. Activation is gated by `ANALYSIS_JOBS_ENABLED=true`
on the analysis service. Until enabled, the existing analysis flow remains active.
This increment covers study classification and findings generation. Theme suggestions,
chat, reassignment, and standalone file imports retain their existing request flow.

## Behavior

Submitting a job saves the exact responses, manual assignments, themes and research
context in Supabase, scoped to the study, published version, question and saved run.
Repeated submissions of identical input reuse the existing job. Changed input after
completion creates a separate job; earlier results are never replaced. A different
snapshot cannot be submitted while that operation is already running.

A worker inside the existing API process claims jobs using a database lease. It
renews that lease while processing. A restart allows an expired claim to be reclaimed;
a stale worker cannot overwrite the newer worker's result. Three interrupted claims
end with a visible failure and an explicit retry. Failed jobs retry their original
input, not whichever edits happen to be in an open browser.

The researcher can close the tab and return to the same question. Initial job checks
and pending work use LoadingSkeleton. The panel shows queued/running, reconnection,
failure/retry, and completed/open states. Reopening a completed result restores the
matching input snapshot before advancing to review or findings. Completed findings
from prior runs continue to use the existing history and evidence links.

The job cannot start until study progress saves successfully. Existing optimistic
concurrency protection remains in effect. Finishing a background job does not silently
replace the study analysis row; its result stays in the job until a researcher opens
it. Thus an older worker cannot overwrite a newer researcher's saved study analysis.

## Access and retention

All browser table access is denied. The authenticated `analysis_job` RPC checks
current membership, edit permissions for enqueue/retry, and question/version provenance.
Reviewers may inspect jobs but cannot submit or retry them. Only service_role may claim,
renew, or finish jobs. Worker results are fenced by both token and unexpired lease.
Queued work whose originating researcher loses editing access fails before processing.
Payload and result access follows current study membership. No credentials belong in
job payloads; the model key remains on the backend. Jobs are deleted with their study.
No automatic job expiration is introduced in this increment.

## Deployment

1. Back up existing study data through the usual protected release process.
2. Apply `supabase/migrations/202611020001_analysis_jobs.sql` after existing migrations.
   This additive transaction creates one table, index and three functions. It does not
   update existing study, response, consent or saved-analysis records.
3. Deploy the API with `SUPABASE_URL` and its existing server-only
   `SUPABASE_SERVICE_ROLE_KEY`. Enable `ANALYSIS_JOBS_ENABLED=true` after migration.
4. Deploy the researcher build. `/models` advertises background_analysis only when enabled.
5. Run a synthetic study's classification and findings jobs, close the tab after queued
   confirmation, then reopen the question and verify the result and retained findings.

The checked-in Render service uses the free plan. Render can sleep after 15 minutes
without inbound traffic and restart at any time: https://render.com/docs/free.
The queue survives those restarts in Supabase; a visit to the researcher question
calls `/models`, wakes the API, and resumes expired claims. This is recoverable
processing, not an uninterrupted service guarantee. An always-on instance/worker
requires a separately approved hosting change. No paid service is added by this patch.

Rollback: disable ANALYSIS_JOBS_ENABLED and redeploy. Keep the additive table and saved
jobs for recovery; do not drop them. Resume existing queued work by enabling again.

## Verification

- `cd backend && venv/bin/python -m unittest discover -p 'test_*.py'`
- `cd frontend && npm test && npm run test:database && npm run build`
- `cd frontend && node e2e/background-jobs-server.mjs` starts an isolated production
  build and real disposable PostgreSQL/RPC facade with synthetic studies. No production
  data or credentials are used. It prints its fake sign-in. Stop with Ctrl+C.
- The queue worker can be exercised against that facade with SUPABASE_URL set to
  http://127.0.0.1:5182 and SUPABASE_SERVICE_ROLE_KEY=local-worker-only. Mock the model
  for UI checks; do not represent synthetic model results as model validation.

Database tests cover role isolation, provenance, input idempotency, concurrent claim
exclusion, stale lease recovery/fencing, failure/retry, immutable completed results,
changed input snapshots, reviewer restrictions, and bounded crash retries. Worker
unit tests cover frozen inputs, summary counts, result fencing and safe error text.

Local verification completed: classification and findings were each queued through
an actual built researcher UI; the tab was closed, a separate queue worker processed
against the real disposable PostgreSQL RPCs using a synthetic model, and a new tab
recovered the completed job. No production model call or record was used. Production
activation completed on November 2, 2026: the migration is applied and the existing
Render API has ANALYSIS_JOBS_ENABLED=true. The researcher app is deployed.
Before activation, all original fields across eight backed-up tables were compared
with the protected pre-release export and were unchanged. Live access checks confirm
row-level security, denied direct browser/anonymous reads, denied browser claims, and
service-role-only worker access.

### Live verification and external blocker

The live worker deployed successfully (Render commit 8222894), and `/models` returns
`background_analysis: true`. All 21 published researcher files match the tested build.
A clearly labeled synthetic study was created for the production walkthrough:
`fb66d566-0319-45d6-8a5b-00b7a92f8278`. It contains one fabricated response, no real
participant, and no invitation/contact action. Its classification job survived closing
and reopening the browser, and explicit retry preserved the frozen inputs.

Live AI completion remains blocked by NaviGator: on November 2, 2026 its `/v1/models`
response listed `nemotron-3-super-120b-a12b`, while `/v1/chat/completions` rejected that
same model with HTTP 400 and “Invalid model name passed”. A minimal direct request
with only a synthetic connectivity prompt reproduced the error, independently of the
queue, structured-output options, and application sessions. The same failure occurred
with the existing local provider configuration. No provider/key/model substitution was
made. Successful live classification/findings recovery cannot be claimed until UF
restores routing/access for the configured model. The synthetic local end-to-end
recovery checks passed; they used a mock model and are distinct from this live blocker.

The worker now stores safe, specific guidance for recognized model errors and logs
only the controlled error code/class, never credentials or response content. The
latest backend suite passes 36 tests; researcher and database suites passed 19 and
40 respectively (95 total). The existing free hosting plan is unchanged.

The synthetic live verification study was closed to new responses after the check.
Its failed job and fabricated answer remain available for inspection/retry when the
provider issue is resolved. No original study was edited or closed.
