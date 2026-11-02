# EduThemes interface direction

The researcher workspace follows [shadcn/ui](https://ui.shadcn.com/)'s restrained
components and [Terracotta](https://www.terracotta.education/product-overview)'s
clear research workflows: neutral surfaces, comfortable controls, and explicit
separation between study design, participation, responses, and analysis.

EduThemes keeps its own green book mark, existing language,
and research workflows. No reference-site logos, assets, or application code
are copied.

## Foundations

- Geist for headings, controls, and reading text, with system sans-serif
  fallbacks. Keep body text at 14px and helper text at 12px or larger.
- A soft workspace canvas `#f5f6f8`, white surfaces `#ffffff`, neutral inset panels
  `#f8f9fb`, and borders `#e2e5eb`,
  charcoal ink `#24262b`, and muted text `#71717a`.
- Terracotta actions `#a54f35` and deeper links `#99472f`. Inputs, progress,
  selection, and keyboard focus use the same restrained accent.
- Neutral skeletons `#eaeaec`; the green book icon remains the brand mark.
- Comfortable controls with 44–48px targets and 8px corners. Cards use 12px
  corners, 24–36px interior padding, 24–32px layout gaps, and two subtle shadow
  layers to separate white work surfaces from the canvas. Mobile layouts keep
  24px panel padding and avoid squeezing labels or actions.
- A collapsible desktop sidebar, breadcrumb header, and mobile navigation
  drawer with focus containment, Escape dismissal, and focus restoration.
- A searchable study library with URL-based status filters, sorting, grid and
  table views, real status counts, and separate loading, error, and empty states.
- An efficient single-page researcher study form with all fields available in
  design, participation, and activities sections. Section links provide quick
  access; researchers can edit questions together and save directly. Researcher
  study setup never uses a slide flow or requires a separate review step.
  Each activity and question keeps its association when adding or reordering.
  Study pages provide section links for operations, participation, responses,
  and team.
- A study overview with a next action, version-specific metrics, a six-stage
  workflow map, and a launch readiness checklist. Purpose, participation, activities,
  screening, and recommended context link directly to the appropriate editor section.
- A participant preview covers the introduction, branching screener, consent, and
  activities without making network writes. Unsaved edits can be previewed locally.
- A study-information rail beside responses and saved evidence on desktop.
- Participant activities beside private return controls and study details.
- Full-page participant study slides: introduction, consent, any Canvas sharing,
  one question at a time, answer review, and completion. The private activity
  hub retains its overview and return controls between activities.
- Stacked panels at narrower widths; independent table scrolling where needed.
- Visible keyboard focus, mobile touch targets, and reduced-motion support.

The researcher foundations are in `frontend/src/styles/ContextTheme.css`;
`frontend/src/styles/ResearchFlow.css` defines the current spacing, elevation,
workflow overview, preview, and findings library. The same
foundations are used in the independent participant repository's
`src/styles/ContextTheme.css`, with spacious surfaces in
`src/styles/RoomyTheme.css`. Both portals share the sidebar, neutral panels,
Geist typography, and terracotta controls. Participant responses use a focused
slide canvas with the portal sidebar hidden while answering.

Every asynchronous state continues to use `LoadingSkeleton` or the shared
button skeleton. Background refreshes retain existing content and entered work.
Route and activity changes open at the top without moving the page during
background saves or refreshes.

Question slides show answered progress and keep Back/Next controls available at
the bottom. Ctrl/Command + Enter advances a question; Enter adds a line to the
answer. A separate review screen supports editing each answer before an explicit
submission. Each slide focuses its heading, honors reduced motion, and preserves
answers during saving, retrying, and returning to earlier steps. Consent and
Canvas identity sharing remain separate, explicit choices.

The study Findings destination gathers completed runs and a downloadable Markdown
report. Earlier runs remain available while newer work is unfinished. The report
contains summaries and counts; it does not add raw response records, screening
answers, private review notes, or participant metadata. Summaries still need human
review before sharing.

Current study section addresses remain compatible (`design`, `recruit`, `collect`,
`analysis`, and `settings`); `findings` is added. The interface calls the collection
section Responses. Historical version views use their frozen title, introduction,
consent, questions, and screening. The public participant link opens the current
version. Publishing checks the status and draft revision reviewed by the owner,
and updates the section only after success. Study roles, consent, private return
keys, analysis workers, and database contracts are preserved.

Run `npm run test:ui` from `frontend` for the researcher UI checks, or
`npm run test:browser` for the complete browser suite. Checks use synthetic
services and capture previews in `frontend/test-results/research-ui`.
