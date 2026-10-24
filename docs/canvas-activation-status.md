# Canvas activation status — October 24, 2026

## Completed and verified

- Backed up the existing study, question, submission, and analysis records to
  the ignored `backend/private/study-backup-2026-10-24.json` file with owner-only
  permissions. The migration preserved both existing studies and submissions.
- Applied `202610240001_canvas_lti.sql` to the production Supabase project.
  Public requests cannot read participant data or execute Canvas identity RPCs.
- Published the participant app to https://eduthemes-participant-abepark.web.app
  and the researcher app to https://eduthemes-abepark.web.app. Live HTML and
  assets match the tested production builds.
- Published source commits `d665e8f` (EduThemes) and `d1152a9`
  (EduThemes-Participant) to their existing GitHub repositories.
- Deployed the backend source at commit `d665e8f` to the existing Render service.
- Configured backend public URLs, participant-origin access, a stable tool public
  signing key, and an empty approved-platform list.
- With explicit user approval, copied the existing Supabase service-role
  credential directly into Render. Its role and project identity were checked
  without printing the key or writing it to local configuration files.
- The credential-triggered Render deployment completed successfully and is live.
- Verified HTTP 200 for [health](https://eduthemes-api.onrender.com/health),
  [configuration JSON](https://eduthemes-api.onrender.com/lti/config), and
  [public JWKS](https://eduthemes-api.onrender.com/lti/jwks).
- Confirmed that Canvas launch requests are rejected until UF registration is
  configured. No fake client IDs or deployment IDs were installed.

The private signing key is stored locally at
`backend/private/canvas-lti-private.pem`, outside source control. The public
signing key was verified against the live JWKS response.

## Remaining

- UF approval and a real issuer/client ID/deployment ID are not available yet.
  After approval, update `LTI_REGISTRATIONS_JSON` with the exact approved values.
- Perform a real UF Canvas launch and study submission after registration.

The [UF request draft](uf-lti-request.md) contains the technical details for
the faculty sponsor. The live UF form is open in the user's school Chrome
window, with the tool name, URL, LTI access method, and project description
entered. It has not been submitted. At the user's explicit request, a message
was sent to Professor Ashish Aggarwal in the existing EdStream conversation
asking for the owner/support contact, deployment scope, student count, semester,
and cost/payer. Those details remain pending. The apps remain usable for
anonymous studies.
