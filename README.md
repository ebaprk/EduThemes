# EduThemes

### Large-scale qualitative analysis of student responses presents significant challenges for instructors due to the time-intensive nature of thematic coding, though it offers great opportunity for feedback. While recent advances in Large Language Models (LLMs) show promise for supporting this process, their reliability and comparative advantage over traditional machine learning approaches remain unclear. This study evaluates five traditional machine learning methods - combining text representation techniques (TF-IDF, SentenceTransformers, Doc2Vec) with classification and clustering algorithms (SVM, Random Forest, DBSCAN) - against two state-of-the-art LLMs (GPT-4 and Claude-3) for supporting thematic analysis of student responses. We develop and test a custom interface that allows instructors to receive and evaluate coding suggestions from these different computational approaches while maintaining control over the analysis process. Using a dataset of 600 student responses, with 100 manually coded responses as ground truth, we will compare these methods on multiple dimensions including classification performance (precision, recall, F1-score), agreement with human coders (Cohen's Kappa), processing time and resource usage, and interface usability through user testing. This will contribute to an understanding of how computational methods can effectively support qualitative research while maintaining methodological rigor. The developed interface and study findings will be the main deliverables of this senior project.

## Research studies and participant responses

This repository contains the
[researcher workspace](https://eduthemes-abepark.web.app/). The
[participant app](https://eduthemes-participant-abepark.web.app/) lives in the
separate [EduThemes-Participant repository](https://github.com/ebaprk/EduThemes-Participant).
Researchers create draft studies with open-response questions, publish a study,
and share a link to the participant app or a code. Participants submit responses
there without an account. Existing researcher-domain `/join` links redirect to
the participant domain.
The study owner and accepted research team members can read its submissions. A researcher
can code each question's responses with the existing Code → Review → Results
workflow; progress and completed findings are saved to Supabase per question.

## Phase 1: teams, versions, and consent

The workspace now supports owner-managed invitations, researcher and read-only
reviewer roles, immutable published study versions, explicit anonymous or
Canvas-identified participation, and version-specific consent records.
Researchers can close a study, prepare a new draft, and publish its next version
while preserving earlier questions, responses, and analyses. Participants review
consent before answering, recover drafts within their browser tab, and download a
study receipt. Saved theme evidence links back to original responses and consent
records, and coding decisions survive a refresh.

Apply `supabase/migrations/202610280001_teams_versions_consent.sql` before releasing
the updated apps and backend. This migration preserves existing data, labels
older consent as unrecorded, and replaces draft/analysis writes with atomic,
revision-checked operations. **A coordinated release is required:** older
researcher builds cannot save drafts or coding after this migration.

See [the Phase 1 release guide](docs/phase1-release.md) for the roles, migration,
verification commands, and release order. The companion participant project is
updated separately; this repository does not deploy it.

### Phase 2.1: operations and multiple activities

Study operations include dashboards, recruitment targets,
coordinator handoff records, versioned baseline/follow-up/diary activity plans,
and a private participant hub with durable drafts and consent receipts.
Apply `supabase/migrations/202610280002_study_operations_activities.sql` before
deploying either updated frontend. Existing single-activity and Canvas flows
remain compatible. See [the release guide](docs/phase2-activities-release.md)
for current deployment status, access rules, local walkthroughs, and pilot limits.

### Supabase setup

The [EduThemes Supabase project](https://supabase.com/dashboard/project/ihocmfxrhbiyilnzdptu)
is created. [`supabase/migrations/202610090001_studies.sql`](supabase/migrations/202610090001_studies.sql)
has been applied to it. Email sign-in and email confirmation are enabled, and
the authentication site URL is `https://eduthemes-abepark.web.app`.

`frontend/.env.production` contains the project URL and publishable browser key.
The same values are in the ignored `frontend/.env.local` for local development.
If you use a different Supabase project, copy `frontend/.env.example` and replace
those values. **Never put a Supabase secret or service-role key in the frontend.**

`npm run build` creates the researcher bundle. The researcher app uses the
Render analysis backend through `VITE_API_URL`; keep the researcher origin in
the backend's `CORS_ORIGINS`. The participant app connects directly to
Supabase from its own project.

The study, question, submission, and coding tables have row-level security.
Public links use narrowly scoped database functions to read published study
plans, validate submissions, and access private activity drafts and receipts.
Participant responses and saved coding are not exposed through public table
queries.

### Run locally

From `frontend`, run `npm install` and `npm start` for the researcher app on
port 3000. To run the participant app locally, open its separate VS Code
project and run `npm ci` and `npm run dev` there on port 3001. Set
`VITE_PARTICIPANT_URL` in this project's `.env.local` to
`http://localhost:3001` so researcher study links point to that app.

For the analysis backend, create and activate a virtual environment in
`backend`, install `requirements.txt`, then run `flask run --port 1500`.

The analysis model selector uses UF's NaviGator AI Toolkit. Set
`NAVIGATOR_API_KEY` on the backend. `NAVIGATOR_MODEL` defaults to
`nemotron-3-super-120b-a12b`, and `NAVIGATOR_BASE_URL` defaults to
`https://api.ai.it.ufl.edu/v1`. Model failures are returned to the interface for
retry; production analysis never substitutes random classifications.

## Canvas participant details

Canvas LTI 1.3 support is implemented across the backend, researcher workspace,
shared Supabase schema, and the separate participant project. Participants launch
EduThemes from Canvas, review and confirm sharing their supplied details, and
those details are saved with their study answers. Researchers can view and export
the participant data. Academic year is included only if the institution supplies
it; it is not inferred from course or student identifiers.

See [the UF Canvas setup guide](docs/canvas-lti.md) for registration URLs,
backend settings, migration/deployment order, and verification. **UF approval,
real client/deployment IDs, and server configuration are required before this
integration is live.** The migration must precede the updated researcher app.

## Tests

```bash
cd frontend
npm test
npm run test:database
npm run build
# Build the companion participant app first; browser tests use synthetic services.
npm run test:browser

cd ../backend
python -m unittest
```

### Notes:
1. When adding new dependencies, run `pip freeze > requirements.txt`
2. **Do not commit the `venv/` directory to the repository**
3. **Always make sure you activate the virtual environment before working to avoid any issues**
4. You can run `deactivate` to leave the virtual environment

## Deploy the Backend to Render

The repository includes a `render.yaml` Blueprint for a free Docker web
service. In Render, create a Blueprint from this repository and provide the
`NAVIGATOR_API_KEY` secret value when prompted.

This repository owns the researcher Hosting target. Build and deploy it with:

```bash
cd frontend
npm run build
cd ..
firebase deploy --only hosting:researcher
```

The participant repository owns the participant Hosting target and deploys it
separately.

The analysis backend still uses temporary SQLite sessions and uploaded files.
Supabase durably stores studies, collected responses, and coding snapshots.
If a backend session expires, researchers can resume coding from the saved
study snapshot; an in-progress analysis that has not yet saved may need to be
restarted. Set up persistent backend storage if you need the original transient
session files to survive restarts.
