# Canvas LTI 1.3 for the University of Florida

## What is implemented

Participants open **EduThemes from their UF Canvas course**, enter a study code,
review the Canvas details, confirm sharing them with that study's researcher,
and submit their answers. The backend validates the Canvas signature, issuer,
client ID, deployment, audience, nonce, browser-bound single-use state, token
times, message type, resource link, roles, and target URI. It exchanges the launch
for a two-hour participant session; it does not create researcher accounts.

Each submission contains an immutable snapshot in
`study_submissions.participant_data`. The study owner can view it next to each
response and download a CSV containing identities and all study answers.
Anonymous responses remain supported with an empty participant-data object.
Only response text goes to the existing AI coding workflow.

**This code alone does not activate UF Canvas.** A UF-approved Developer Key,
deployment ID, database migration, backend environment configuration, and app
deployments are required. A real launch must be tested after UF installation.

## Available fields

The bounded allowlist includes name, given/family name, email, locale, Canvas
user ID, course ID/context/title/code, roles, issuer, client ID, deployment ID,
subject, and verification time. `academic_year` and `major` are accepted only
when supplied as signed custom claims by an approved institution deployment.
Missing fields and unresolved `$...` substitutions are omitted, never inferred.
The submission records the sharing notice version and sharing time as well.

The Canvas identity is the tuple **issuer + client ID + deployment ID + subject**;
names, emails, and Canvas numeric IDs are not globally unique identifiers.
An LTI launch is scoped to its launching course; it does not provide a profile
of the participant's other courses or a transcript.

Canvas privacy settings control release of name and email. Academic year is
not a standard Canvas launch field. UF must confirm whether an approved custom
integration can supply individual year/major values. Do not configure a literal
`academic_year=Junior` for a mixed cohort: it would label every participant Junior.
Age, ZIP code, grades, and other demographics from the reference photo are not
requested or fabricated. This tool requests no gradebook or roster API scopes.

## UF administrator handoff

UF's [Learning Tool Integration request process](https://it.ufl.edu/services/385)
requires review before implementation. Follow UF's
[approved LTI instructions](https://elearning.ufl.edu/instructor-help/teaching-and-learning-tools/adding-approved-lti/)
and ask UF e-Learning to approve/register EduThemes as an **LTI 1.3** tool.
The participant-facing Canvas site is <https://ufl.instructure.com>.

Provide the following URLs (replace the backend domain if hosting changes):

| Setting | Value |
| --- | --- |
| Tool configuration JSON | `https://eduthemes-api.onrender.com/lti/config` |
| OIDC login initiation | `https://eduthemes-api.onrender.com/lti/login` |
| Redirect URI (exact match) | `https://eduthemes-api.onrender.com/lti/launch` |
| Target link URI | `https://eduthemes-api.onrender.com/lti/launch` |
| Tool public JWKS | `https://eduthemes-api.onrender.com/lti/jwks` |
| Participant app | `https://eduthemes-participant-abepark.web.app` |
| Placement | Course Navigation, open in a new window |
| Launch message | `LtiResourceLinkRequest` |
| Privacy | Public (release name/email where institution policy permits) |
| LTI Advantage scopes | None |

The JSON configuration requests only `$Canvas.user.id` and `$Canvas.course.id`
as custom substitutions. Name/email are standard launch claims. Navigation
starts disabled; instructors enable EduThemes after installation. The new-window
placement avoids depending on third-party cookies in an embedded Canvas frame.
The browser must allow the backend's secure session cookie during the launch.

Get the **client ID and approved deployment ID(s)** from UF. Confirm the exact
issuer; cloud-hosted Canvas normally uses `https://canvas.instructure.com`, even
when the course hostname is `ufl.instructure.com`. Do not substitute the course
hostname for the issuer without confirmation. Never allow arbitrary deployments.

## Backend and database rollout

1. Back up the database. Apply
   `supabase/migrations/202610240001_canvas_lti.sql` after the existing studies
   migration. Apply it **before deploying the updated researcher app**, which
   selects the new `participant_data` column. Test in staging first.
2. Install `backend/requirements.txt` in the backend virtual environment.
3. Generate a tool keypair outside source control:
   `python generate_lti_key.py /secure/path/eduthemes-lti-private.pem`.
   The file is created with owner-only permissions and cannot overwrite an
   existing key. Store it securely. Stdout contains only the public JWK JSON.
   This launch-only tool does not use private-key-signed Canvas services.
4. Configure these **backend-only** environment variables in Render:

   | Variable | Value |
   | --- | --- |
   | `LTI_PUBLIC_URL` | `https://eduthemes-api.onrender.com` |
   | `LTI_PARTICIPANT_URL` | `https://eduthemes-participant-abepark.web.app` |
   | `SUPABASE_URL` | `https://ihocmfxrhbiyilnzdptu.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role/server secret from the project administrator |
   | `LTI_TOOL_PUBLIC_JWK` | Public JSON from the generator (never the private PEM) |
   | `LTI_REGISTRATIONS_JSON` | Registration JSON below, with the real UF IDs |
   | `CORS_ORIGINS` | Existing researcher origins plus the exact participant origin |

   ```json
   [{
     "id": "uf-production",
     "issuer": "https://canvas.instructure.com",
     "client_id": "REPLACE_WITH_UF_CLIENT_ID",
     "deployment_ids": ["REPLACE_WITH_UF_DEPLOYMENT_ID"],
     "auth_url": "https://sso.canvaslms.com/api/lti/authorize_redirect",
     "jwks_url": "https://sso.canvaslms.com/api/lti/security/jwks"
   }]
   ```

   Serialize the JSON into one environment value. Beta/test Canvas requires
   separately confirmed issuer, registration, auth URL, and JWKS URL. Client IDs
   and deployments must be strings. No Canvas API access token is needed.
5. Deploy the backend. Confirm `/health`, `/lti/config`, and `/lti/jwks` respond.
   UF can create the Developer Key from configuration JSON and enter the exact
   Redirect URI. Install the client ID, then put its deployment ID in the backend
   allowlist before the first launch. A missing registration returns a clear 503.
6. In the separate `EduThemes-Participant` project, set `VITE_API_URL` to the
   backend, run `npm test` and `npm run build`, then deploy the participant target.
   Build and deploy this repository's researcher target after the migration.

Never put the service-role key or private key in frontend environment variables,
source control, URLs, logs, or support messages. Backend errors intentionally
exclude downstream database error bodies and participant information.

## Verification

Local checks:

```sh
# EduThemes/backend, using its activated virtual environment
python -m unittest
# EduThemes/frontend
npm test
npm run build
# EduThemes-Participant
npm test
npm run build
```

Database checks use a disposable PostgreSQL runtime and never contact Supabase:
install `@electric-sql/pglite` in a temporary directory, then run
`PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test supabase/tests/canvas_lti.test.mjs`.
They apply both migrations, exercise actual SQL and role restrictions, verify
single-use handoffs, expiry/revocation, complete answers, closed studies, retry
idempotency, and continued anonymous participation.

After UF registration, use a test student and a study owned by a test researcher:

1. Launch EduThemes through a UF course in a new window. Review name/email/course
   and any approved custom fields. Enter the study code and confirm sharing.
2. Submit answers; verify matching participant details in the owner's response
   list and CSV. Verify a different researcher cannot read the submission.
3. Submit to a second study while connected; confirm its own snapshot is saved.
4. Disconnect and submit anonymously; confirm no Canvas details are attached.
5. Test missing-name/email privacy settings, a closed study, session expiry,
   a replayed launch, and a failed network request followed by retry.

Local tests do not substitute for this real UF launch. No live UF/Supabase
changes are made by the tests.

## Operational behavior

Login state expires after 10 minutes. Launch handoff codes expire after 60
seconds and can be exchanged once. Opaque participant tokens expire after two
hours and stay in tab session storage. The backend stores only hashes of the
browser binding, handoff code, and participant token. Missing/expired Canvas
sessions or transport errors fail visibly rather than silently submitting
anonymously. Canvas disconnection revokes the backend session. Study submission
and identity attachment occur in one transaction; retries reuse a request UUID.

Expired login/session rows are removed when subsequent Canvas logins begin.
For quiet installations, schedule administrative deletion of expired rows if
strict physical cleanup timing is required. Saved participant snapshots follow
the study's existing retention behavior and are deleted when the study is deleted.
Researcher access remains protected by the existing study-owner RLS policy.
