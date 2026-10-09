# EduThemes

### Large-scale qualitative analysis of student responses presents significant challenges for instructors due to the time-intensive nature of thematic coding, though it offers great opportunity for feedback. While recent advances in Large Language Models (LLMs) show promise for supporting this process, their reliability and comparative advantage over traditional machine learning approaches remain unclear. This study evaluates five traditional machine learning methods - combining text representation techniques (TF-IDF, SentenceTransformers, Doc2Vec) with classification and clustering algorithms (SVM, Random Forest, DBSCAN) - against two state-of-the-art LLMs (GPT-4 and Claude-3) for supporting thematic analysis of student responses. We develop and test a custom interface that allows instructors to receive and evaluate coding suggestions from these different computational approaches while maintaining control over the analysis process. Using a dataset of 600 student responses, with 100 manually coded responses as ground truth, we will compare these methods on multiple dimensions including classification performance (precision, recall, F1-score), agreement with human coders (Cohen's Kappa), processing time and resource usage, and interface usability through user testing. This will contribute to an understanding of how computational methods can effectively support qualitative research while maintaining methodological rigor. The developed interface and study findings will be the main deliverables of this senior project.

## Research studies and participant responses

EduThemes has a researcher workspace and an account-free participant form.
Researchers create draft studies with open-response questions, publish a study,
and share its link or code. Participants submit responses through that link.
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

The production frontend is hosted at
[`https://eduthemes-abepark.web.app`](https://eduthemes-abepark.web.app).
Its existing `VITE_API_URL` points to the Render analysis backend; keep the
frontend origin in the backend's `CORS_ORIGINS`.

The study, question, submission, and coding tables have row-level security.
The public link uses two narrowly scoped database functions: one reads the
questions for an open study, and one validates and stores a complete response.
Participant responses and saved coding are not exposed through public table
queries.

### Run locally

1. Starting in the `EduThemes` directory, run `cd frontend`.
2. Run `npm install` and `npm start`.

In a separate terminal

5. Run `cd ../backend`.
6. Run `python3 -m venv venv` (or whatever running python equivalent like `py -m venv venv`)
7. Run `source venv/bin/activate` on Mac/Linux or `venv/Scripts/activate` on Windows
8. **Verify that you see `(venv)` at the beginning of your command prompt before doing any work**
9. Run `pip install -r requirements.txt`
10. Run `flask run --port 1500`

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

The production frontend configuration points to the Render backend. Build and
deploy it to Firebase Hosting with:

```bash
cd frontend
npm run build
cd ..
firebase deploy --only hosting
```

The analysis backend still uses temporary SQLite sessions and uploaded files.
Supabase durably stores studies, collected responses, and coding snapshots.
If a backend session expires, researchers can resume coding from the saved
study snapshot; an in-progress analysis that has not yet saved may need to be
restarted. Set up persistent backend storage if you need the original transient
session files to survive restarts.
