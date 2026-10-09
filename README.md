# EduThemes

### Large-scale qualitative analysis of student responses presents significant challenges for instructors due to the time-intensive nature of thematic coding, though it offers great opportunity for feedback. While recent advances in Large Language Models (LLMs) show promise for supporting this process, their reliability and comparative advantage over traditional machine learning approaches remain unclear. This study evaluates five traditional machine learning methods - combining text representation techniques (TF-IDF, SentenceTransformers, Doc2Vec) with classification and clustering algorithms (SVM, Random Forest, DBSCAN) - against two state-of-the-art LLMs (GPT-4 and Claude-3) for supporting thematic analysis of student responses. We develop and test a custom interface that allows instructors to receive and evaluate coding suggestions from these different computational approaches while maintaining control over the analysis process. Using a dataset of 600 student responses, with 100 manually coded responses as ground truth, we will compare these methods on multiple dimensions including classification performance (precision, recall, F1-score), agreement with human coders (Cohen's Kappa), processing time and resource usage, and interface usability through user testing. This will contribute to an understanding of how computational methods can effectively support qualitative research while maintaining methodological rigor. The developed interface and study findings will be the main deliverables of this senior project.

## Research studies and participant responses

EduThemes has two separate web apps: the
[researcher workspace](https://eduthemes-abepark.web.app/) and the
[participant app](https://eduthemes-participant-abepark.web.app/).
Researchers create draft studies with open-response questions, publish a study,
and share a link to the participant app or a code. Participants submit responses
there without an account. Existing researcher-domain `/join` links redirect to
the participant domain.
Only the researcher who owns the study can read its submissions. A researcher
can code each question's responses with the existing Code → Review → Results
workflow; progress and completed findings are saved to Supabase per question.

### Supabase setup

The [EduThemes Supabase project](https://supabase.com/dashboard/project/ihocmfxrhbiyilnzdptu)
is created. [`supabase/migrations/202610090001_studies.sql`](supabase/migrations/202610090001_studies.sql)
has been applied to it. Email sign-in and email confirmation are enabled, and
the authentication site URL is `https://eduthemes-abepark.web.app`.

`frontend/.env.production` contains the project URL and publishable browser key.
The same values are in the ignored `frontend/.env.local` for local development.
If you use a different Supabase project, copy `frontend/.env.example` and replace
those values. **Never put a Supabase secret or service-role key in the frontend.**

`npm run build` creates separate researcher and participant bundles. The
researcher app uses the Render analysis backend through `VITE_API_URL`; keep
the researcher origin in the backend's `CORS_ORIGINS`. The participant bundle
only connects to Supabase.

The study, question, submission, and coding tables have row-level security.
The public link uses two narrowly scoped database functions: one reads the
questions for an open study, and one validates and stores a complete response.
Participant responses and saved coding are not exposed through public table
queries.

### Run locally

From `frontend`, run `npm install` and `npm start` for the researcher app on
port 3000. In a second terminal, run `npm run start:participant` for the
participant app on port 3001. Set `VITE_FRONT_URL` and
`VITE_PARTICIPANT_URL` in `.env.local` to those respective local origins.

For the analysis backend, create and activate a virtual environment in
`backend`, install `requirements.txt`, then run `flask run --port 1500`.

The analysis model selector uses UF's NaviGator AI Toolkit. Set
`NAVIGATOR_API_KEY` on the backend. `NAVIGATOR_MODEL` defaults to
`nemotron-3-super-120b-a12b`, and `NAVIGATOR_BASE_URL` defaults to
`https://api.ai.it.ufl.edu/v1`. Model failures are returned to the interface for
retry; production analysis never substitutes random classifications.

## Tests

```bash
cd frontend
npm test

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

The Firebase project has two Hosting targets. Build and deploy them with:

```bash
cd frontend
npm run build
cd ..
firebase deploy --only hosting:participant
firebase deploy --only hosting:researcher
```

The analysis backend still uses temporary SQLite sessions and uploaded files.
Supabase durably stores studies, collected responses, and coding snapshots.
If a backend session expires, researchers can resume coding from the saved
study snapshot; an in-progress analysis that has not yet saved may need to be
restarted. Set up persistent backend storage if you need the original transient
session files to survive restarts.
