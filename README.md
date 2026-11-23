# EduThemes

EduThemes is a researcher-led workspace for qualitative analysis of open-ended responses. Researchers can import existing data or collect responses through a study, define a codebook, and use a few of their own coded examples to guide AI suggestions. They review those suggestions against the original text before generating findings and preparing a research brief.

[Open the researcher workspace](https://eduthemes-abepark.web.app/) · [Open the participant app](https://eduthemes-participant-abepark.web.app/) · [Participant app source](https://github.com/ebaprk/EduThemes-Participant)

## Repository at a glance

| Component | Stack and role |
| --- | --- |
| [frontend/](frontend/) | React/Vite researcher workspace. |
| [backend/](backend/) | Flask analysis API, background jobs, and Canvas LTI endpoints. |
| [packages/ui/](packages/ui/) | Shared UI package used by the researcher frontend. |
| [supabase/](supabase/) | PostgreSQL migrations and database checks. |
| [docs/](docs/) | Release notes, research workflow, and deployment guidance. |

The [participant app](https://github.com/ebaprk/EduThemes-Participant) and [help center](https://github.com/ebaprk/EduThemes-Help) are maintained in separate repositories. Help-center source access depends on repository permissions.

## Research workflow

1. **Import or collect responses.** In Studies, select **Import file** for CSV or Excel data. Enter a research question and choose **Import & continue** to save a private study under **Imported** and start coding. To collect new data, create and publish a versioned study with questions and consent. Participants respond in the companion app.
2. **Define themes and code examples.** Create a codebook with definitions, inclusion and exclusion rules, and optional examples. Reuse a saved codebook or import one. An example response can have multiple themes or an explicit no-match decision. NaviGator uses those decisions as guidance during classification.
3. **Review the proposals.** Inspect the original responses and accept or reject proposed assignments. Open **Edit themes** on any response to add missing themes, remove incorrect themes, or leave it unclassified. Saving accepts the complete selected set; cancelling preserves the previous choices. Progress is saved so researchers can return to a study. Saved analyses support background classification and findings jobs.
4. **Compare independent coding when appropriate.** In **Team coding**, assign a shared sample. Coders submit their choices separately before comparing results. For each eligible pair, EduThemes reports observed agreement and per-theme Cohen’s kappa on the shared responses. Reconciliation retains the original choices and agreement.
5. **Inspect and report findings.** Review the AI-generated summary, theme counts, and supporting responses. Document methods, limitations, and AI use, and select original quotations for an unsigned draft or researcher-reviewed brief. Export coded responses or a Markdown brief, or use the print preview. **Generate paper draft with NaviGator** produces an editable manuscript from the included findings and report notes, with optional researcher-supplied references. Download the Markdown draft or print it as a PDF after reviewing its claims.

Published collection studies also support researcher and reviewer roles, participant activities, optional recruitment screening, and owner-controlled release of a participant-facing summary. Canvas LTI support requires institutional registration and a verified launch before use in a Canvas course. [Study teams and versions](docs/phase1-release.md) · [Participant activities](docs/phase2-activities-release.md) · [Recruitment](docs/recruitment-release.md) · [Participant results](docs/participant-results-release.md) · [Canvas activation status](docs/canvas-activation-status.md)

The [EduThemes Help Center](https://eduthemes-help-abepark.web.app/) contains searchable guides for both apps. Its code and hosting configuration live in the separate [EduThemes-Help repository](https://github.com/ebaprk/EduThemes-Help).

## Recorded verification

**November 20, 2026.** The response editor was checked for adding a missing second theme, assigning several themes to an unclassified response, clearing all themes, cancelling, recovering after reload, and preserving source identifiers and exported counts. Keyboard and layout checks covered widths from 320 to 1440 pixels. A separate four-response rehearsal used two fictional accounts, a disposable database, the real CSV parser, and predetermined model suggestions. Separate submissions, a Planning kappa of 0.50, reconciliation, and a reviewed export passed. These are software checks using fabricated data. [Correction release and evidence boundaries](docs/professor-correction-release-2026-11-20.md)

**November 17, 2026 — historical test record.** The hosted import workflow was tested twice with 72 public University of Waterloo course reviews. Twelve examples guided classification, and 60 reviews were held out for comparison against published annotations. All 12 example decisions were preserved in both runs. On the first run, initial suggestions scored 0.650 micro-F1 and matched the full reference tag set on 12 of 60 reviews. The rerun scored 0.633 and matched 11 of 60. The results describe agreement for this dataset and codebook. Researchers still need to check for both extra and missing assignments. [EduRABSA dataset and published annotations](https://doi.org/10.5281/zenodo.18500517)

The first test found that 11 accepted assignments were lost between Review and Findings. The deployed fix preserved every one of the 113 accepted assignments in the fresh live run. Individual evidence rows, chart counts, and the downloaded brief matched after opening the saved study in a new tab.

The independent-coding and reconciliation workflow was verified with two scripted test accounts. Actual independent human coding and researcher usability remain unevaluated. The November 20 correction does not retrospectively change the November 17 benchmark scores or saved counts. The project report and demo distinguish simulated software verification from the historical live-model benchmark; YouTube publication and delivery are tracked separately.

These recorded checks describe specific runs and test accounts. They do not establish general model accuracy, independent human-coder reliability, or the current availability of a hosted deployment.

## Development

This repository contains the React and Vite researcher frontend, the Flask analysis API, and the Supabase schema and migrations. Firebase Hosting serves the researcher frontend, Render runs the API, and model requests use UF’s NaviGator AI Toolkit. The companion participant app has its own repository and deployment.

For a fresh checkout:

```sh
git clone https://github.com/ebaprk/EduThemes.git
cd EduThemes
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Use a current Node.js installation compatible with the frontend package lock (Node 22.12+ is a suitable baseline), Python 3.12, and a Supabase project. Firebase CLI access is needed only for publishing the frontend.

Configure the researcher frontend from [the frontend environment template](frontend/.env.example) and the API from [the backend environment template](backend/.env.example). Use a Supabase project with the migrations in [supabase/migrations](supabase/migrations) applied in order. Keep `NAVIGATOR_API_KEY` and Supabase service-role credentials on the server. The frontend uses the Supabase project URL and a publishable browser key.

Key configuration:

| Setting | Location and purpose |
| --- | --- |
| `VITE_API_URL` | Frontend API endpoint; use `http://localhost:1500` for a local backend. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend connection to the shared Supabase project. |
| `VITE_PARTICIPANT_URL` | Participant origin, locally `http://localhost:3001`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-only database access. |
| `NAVIGATOR_API_KEY` | Server-only NaviGator credential; add it to the backend environment. |
| `NAVIGATOR_BASE_URL`, `NAVIGATOR_MODEL` | Model service configuration; see [render.yaml](render.yaml). |
| `CORS_ORIGINS` | Frontend origins permitted to call the API. |
| `ANALYSIS_JOBS_ENABLED` | Enable after applying the background-job migration. |

Canvas settings in the backend template are needed only for an approved LTI integration. Follow the linked LTI guide rather than treating its placeholder registrations as usable credentials.

Install the shared UI package, then run the researcher app on port 3000.

```bash
npm ci --prefix packages/ui
cd frontend
npm ci
npm start
```

Run the local API on port 1500 from a separate terminal.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
flask run --port 1500
```

For local participant testing, clone [EduThemes-Participant](https://github.com/ebaprk/EduThemes-Participant) beside this repository, keeping the directory names `EduThemes` and `EduThemes-Participant`. The participant app imports `EduThemes/packages/ui`. Run the companion app on port 3001 and set `VITE_PARTICIPANT_URL=http://localhost:3001` in the researcher frontend’s environment. Set the API’s `CORS_ORIGINS` for the intended frontend origins.

Check `http://localhost:1500/health` to confirm the API is running. `/models` reports configured model access and whether background analysis is enabled. Model-backed workflows need the corresponding server credentials and migrations.

### Tests and deployment

```bash
cd frontend
npm test
npm run test:database
npm run build

# The browser suite uses synthetic services and a built companion app.
npm run test:browser

cd ../backend
python -m unittest discover -p 'test_*.py'
```

The Render service is configured in [render.yaml](render.yaml). Before deploying, apply the schema changes required by the release and check service configuration. Build the researcher frontend with `npm run build` in `frontend`, then run `firebase deploy --only hosting:researcher` from the repository root. The participant repository deploys separately. [Background analysis setup](docs/background-analysis-release.md) · [Research reporting](docs/research-quality-release.md) · [Collaborative coding release notes](docs/collaborative-coding-release.md)

## Research use and development conventions

AI coding and generated findings are proposals for researcher review. Check assignments against original responses, document decisions and limitations, and use genuine independent human coding when reporting human reliability. Scripted test-account demonstrations are workflow checks.

Follow [AGENTS.md](AGENTS.md) for loading indicators, pending-action accessibility, retained form content, and shared UI conventions. Keep participant-facing behavior coordinated with the companion app.
