# Research workflow and spacious interface

November 2, 2026. This update completes the existing qualitative research workflow;
experimental conditions and random assignment are outside its scope.

## Reference review

The user-supplied [Terracotta demonstration](https://vimeo.com/880912121) was reviewed
at its opening and sampled design, participation, assignment, and outcome screens.
The demonstrated sequence and the official [product overview](https://www.terracotta.education/product-overview)
and [Canvas quick-start guide](https://www.terracotta.education/help-center/quick-start-guide)
informed the organization: explicit study design, participation decisions, activity
plans, study status, and research outputs. EduThemes keeps its own one-page editor,
reviewed qualitative coding, participant links, branding, and consent flow.

## What changed

- A version-aware overview gives researchers a next action, activity/question/findings
  counts, and direct entry to design, participation, activities, recruitment, responses,
  and findings. Counts describe saved records rather than inferred participant identity.
- Launch readiness distinguishes required design/consent/activity fields from
  recommended introduction and contact details. Links open the relevant editor section.
- Participant preview covers introduction, eligibility, conditional screening,
  consent, activity timing/instructions, and questions. It reads the unsaved form or
  frozen selected version. Preview answers remain local to the modal and make no RPC
  requests; preview never records consent, enrollment, screening, or research responses.
- Published design is a readable study plan with purpose, privacy, contact,
  compensation, activities, screening, and consent. Historical titles and content
  do not borrow from an unpublished draft.
- Responses and analysis explain the next step and show genuine empty states after
  requests settle. Entering these destinations refreshes the underlying study data.
- A study Findings library collects completed analysis runs. Latest runs appear by
  default; earlier runs are optional. Each entry opens its frozen run and evidence.
  A downloadable Markdown report gathers the visible summaries and theme counts
  without adding raw answers, screening, participant metadata, or private notes.
  Generated summary text is preserved and still requires review before sharing.
- Team and closeout controls describe closure, reopening, and preparing a new version.
  Publishing requires the same status and draft revision the owner reviewed. If a
  competing edit wins, the UI stays on the current section and asks for a refresh.
- Version resolution handles a stale `version=draft` URL after publication and keeps
  deliberate historical views on refresh. A new draft opens the draft editor.
- Researcher and participant work surfaces have more padding, larger gaps and controls,
  a soft gray workspace background, white cards, and subtle layered shadows. Responsive
  layouts, keyboard focus, reduced motion, and skeleton waiting states are retained.

No schema migration, API-key replacement, hosting upgrade, or message delivery is
needed. Existing studies are not revised or republished by this update.

## Verification and rollout

- Researcher unit suite: 30 tests, including readiness, role-aware next steps,
  frozen version previews, conditional question visibility, retained findings,
  export boundaries, and version resolution.
- Participant regression suite: 16 tests.
- Both production builds.
- `node frontend/e2e/research-flow-server.mjs` serves both production builds against
  a disposable PostgreSQL/RPC facade with fabricated studies. It seeds a draft and
  completed findings in an older version beside a newer unpublished draft.
- Local UI checks completed: overview/readiness, conditional preview questions,
  consent/activity preview, preview of unsaved introduction, save draft, and exact
  database comparison confirming preview made no changes.

Browser control was disabled in Work settings during the local walkthrough.
The remaining publication/version/findings/download interactions and participant/mobile
visual checks could not be completed in this session. Production build-file checks
verify the served release separately; they do not substitute for those UI checks.

## Published release

Both Firebase sites were published on November 2, 2026. The researcher release is
commit `83cc538`; the participant spacing release is `1bbb05c`. All 23 public
researcher build files and all 12 participant build files match the deployed files.
The existing backend and database were unchanged. No production study was created,
edited, published, or closed during this update. The local disposable walkthrough
server was stopped afterward.

The 30 researcher and 16 participant tests passed, and both production builds passed.
The remaining interactive checks above are explicitly outstanding because browser
control was disabled, rather than being represented as successful live UI validation.
