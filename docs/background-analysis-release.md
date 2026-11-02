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

### Live verification and provider credential replacement

The live worker deployed successfully (Render commit 8222894), and `/models` returns
`background_analysis: true`. All 21 published researcher files match the tested build.
A clearly labeled synthetic study was created for the production walkthrough:
`fb66d566-0319-45d6-8a5b-00b7a92f8278`. It contains one fabricated response, no real
participant, and no invitation/contact action. Its classification job survived closing
and reopening the browser, and explicit retry preserved the frozen inputs.

The original NaviGator credential listed `nemotron-3-super-120b-a12b` in `/v1/models`
but rejected it from `/v1/chat/completions` with HTTP 400. On November 2, a user-approved
replacement, `eduthemes-background-analysis-v2`, was created in the `navigator-toolkit`
team with access to that model only and AI API routes only. A fabricated prompt passed
at the existing UF endpoint with HTTP 200. Only after that test was its secret saved
to Render's server-side NAVIGATOR_API_KEY. The exact saved value was verified privately,
and deployment `dep-dbke7q56e07s73ctie30` succeeded at commit bb64299. The provider,
model name, local .env and hosting plan were not changed. Secrets remain outside Git.

Toolkit did not honor its “Never resets” selection during creation: the saved key
showed a monthly reset. Editing it to “Never resets” failed with “Invalid duration
format.” To keep usable spending within a single $5 budget, the key expires on
**November 29, 2026 at 2:24 PM Eastern**, before the first scheduled reset on
November 30 at 7 PM. Auto-rotation is disabled. This is a time-bounded workaround,
not a claim that Toolkit's reset setting was fixed. Do not extend or renew this key
without revisiting the total-spend limit. The inaccessible earlier EduThemes key was
expired before creating the replacement; the unrelated blocked key was unchanged.

The failed synthetic classification was explicitly retried after deployment, its tab
was closed while queued, and a fresh tab recovered the completed live classification.
Its one assignment was reviewed and accepted. Findings were then queued, that tab was
closed, and a fresh tab showed “Open completed analysis.” Opening it restored the
live generated summary, one coded response, zero unclassified responses, and the
accepted theme's source-response/consent link. Both live recovery flows now pass using
the real Nemotron service and fabricated data. This confirms operation and recovery,
not the scientific validity of findings from a single fabricated response.

The worker now stores safe, specific guidance for recognized model errors and logs
only the controlled error code/class, never credentials or response content. The
latest backend suite passes 36 tests; researcher and database suites passed 19 and
40 respectively (95 total). The existing free hosting plan is unchanged.

The synthetic live verification study was closed to new responses after the check.
Its fabricated answer and saved analysis remain available for inspection. No original
study was edited or closed.
