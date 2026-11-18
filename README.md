# EduThemes

EduThemes is a researcher-led workspace for qualitative analysis of open-ended responses. Researchers can import existing data or collect responses through a study, define a codebook, and use a few of their own coded examples to guide AI suggestions. They review those suggestions against the original text before generating findings and preparing a research brief.

[Open the researcher workspace](https://eduthemes-abepark.web.app/) · [Open the participant app](https://eduthemes-participant-abepark.web.app/) · [Participant app source](https://github.com/ebaprk/EduThemes-Participant)

## Research workflow

1. **Import or collect responses.** In Studies, select **Import file** for CSV or Excel data. Enter a research question and choose **Import & continue** to save a private study under **Imported** and start coding. To collect new data, create and publish a versioned study with questions and consent. Participants respond in the companion app.
2. **Define themes and code examples.** Create a codebook with definitions, inclusion and exclusion rules, and optional examples. Reuse a saved codebook or import one. An example response can have multiple themes or an explicit no-match decision. NaviGator uses those decisions as guidance during classification.
3. **Review the proposals.** Inspect the original responses, accept or reject proposed assignments, and assign an available theme to an unclassified response. Progress is saved so researchers can return to a study. Saved analyses support background classification and findings jobs.
4. **Compare independent coding when appropriate.** In **Team coding**, assign a shared sample. Coders submit their choices separately before comparing results. For each eligible pair, EduThemes reports observed agreement and per-theme Cohen’s kappa on the shared responses. Reconciliation retains the original choices and agreement.
5. **Inspect and report findings.** Review the AI-generated summary, theme counts, and supporting responses. Document methods, limitations, and AI use, and select original quotations for an unsigned draft or researcher-reviewed brief. Export coded responses or a Markdown brief, or use the print preview.

Published collection studies also support researcher and reviewer roles, participant activities, optional recruitment screening, and owner-controlled release of a participant-facing summary. Canvas LTI support requires institutional registration and a verified launch before use in a Canvas course. [Study teams and versions](docs/phase1-release.md) · [Participant activities](docs/phase2-activities-release.md) · [Recruitment](docs/recruitment-release.md) · [Participant results](docs/participant-results-release.md) · [Canvas activation status](docs/canvas-activation-status.md)

## Latest verification

**November 17, 2026.** The hosted import workflow was tested twice with 72 public University of Waterloo course reviews. Twelve examples guided classification, and 60 reviews were held out for comparison against published annotations. All 12 example decisions were preserved in both runs. On the first run, initial suggestions scored 0.650 micro-F1 and matched the full reference tag set on 12 of 60 reviews. The rerun scored 0.633 and matched 11 of 60. The results describe agreement for this dataset and codebook. Researchers still need to check for both extra and missing assignments. [EduRABSA dataset and published annotations](https://doi.org/10.5281/zenodo.18500517)

The first test found that 11 accepted assignments were lost between Review and Findings. The deployed fix preserved every one of the 113 accepted assignments in the fresh live run. Individual evidence rows, chart counts, and the downloaded brief matched after opening the saved study in a new tab.

The independent-coding and reconciliation workflow was verified with two scripted test accounts. A real two-coder exercise and a researcher usability session remain open. A known review limitation is that researchers can only add themes through the Unclassified picker. The project report and demo have drafts, and the final demo still needs to reflect the current import and review flow.

**Source status.** This source release includes the hosted researcher UI, shared UI package, and imported-study migrations described here.

## Development

This repository contains the React and Vite researcher frontend, the Flask analysis API, and the Supabase schema and migrations. Firebase Hosting serves the researcher frontend, Render runs the API, and model requests use UF’s NaviGator AI Toolkit. The companion participant app has its own repository and deployment.

Configure the researcher frontend from [the frontend environment template](frontend/.env.example) and the API from [the backend environment template](backend/.env.example). Use a Supabase project with the migrations in [supabase/migrations](supabase/migrations) applied in order. Keep `NAVIGATOR_API_KEY` and Supabase service-role credentials on the server. The frontend uses the Supabase project URL and a publishable browser key.

Run the researcher app on port 3000.

```bash
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

For local participant testing, run the companion app on port 3001 and set `VITE_PARTICIPANT_URL=http://localhost:3001` in the researcher frontend’s environment. Set the API’s `CORS_ORIGINS` for the intended frontend origins.

### Tests and deployment

```bash
cd frontend
npm test
npm run test:database
npm run build

# The browser suite uses synthetic services and a built companion app.
npm run test:browser

cd ../backend
python -m unittest
```

The Render service is configured in [render.yaml](render.yaml). Before deploying, apply the schema changes required by the release and check service configuration. Build the researcher frontend with `npm run build` in `frontend`, then run `firebase deploy --only hosting:researcher` from the repository root. The participant repository deploys separately. [Background analysis setup](docs/background-analysis-release.md) · [Research reporting](docs/research-quality-release.md) · [Collaborative coding release notes](docs/collaborative-coding-release.md)
