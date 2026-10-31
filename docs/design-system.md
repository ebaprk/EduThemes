# EduThemes interface direction

The researcher workspace follows [shadcn/ui](https://ui.shadcn.com/)'s restrained
components and [Terracotta](https://www.terracotta.education/product-overview)'s
clear research workflows: neutral surfaces, compact controls, and explicit
separation between study design, participation, responses, and analysis.

EduThemes keeps its own green book mark, existing language,
and research workflows. No reference-site logos, assets, or application code
are copied.

## Foundations

- Geist for headings, controls, and reading text, with system sans-serif
  fallbacks. Keep body text at 14px and helper text at 12px or larger.
- White surfaces `#ffffff`, neutral panels `#f7f7f8`, borders `#e5e5e8`,
  charcoal ink `#24262b`, and muted text `#71717a`.
- Terracotta actions `#a54f35` and deeper links `#99472f`. Inputs, progress,
  selection, and keyboard focus use the same restrained accent.
- Neutral skeletons `#eaeaec`; the green book icon remains the brand mark.
- Compact rectangular controls, 6px control corners, 8–9px panel corners,
  thin borders, and quiet shadows.
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
- A study-information rail beside responses and saved evidence on desktop.
- Participant activities beside private return controls and study details.
- Full-page participant study slides: introduction, consent, any Canvas sharing,
  one question at a time, answer review, and completion. The private activity
  hub retains its overview and return controls between activities.
- Stacked panels at narrower widths; independent table scrolling where needed.
- Visible keyboard focus, mobile touch targets, and reduced-motion support.

The researcher stylesheet is `frontend/src/styles/ContextTheme.css`. The same
foundations are used in the independent participant repository's
`src/styles/ContextTheme.css`. Both portals share the sidebar, neutral panels,
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

This update changes presentation and page framing. Study roles, consent,
versioning, private return keys, analysis, and database contracts are unchanged.

Run `npm run test:ui` from `frontend` for the researcher UI checks, or
`npm run test:browser` for the complete browser suite. Checks use synthetic
services and capture previews in `frontend/test-results/research-ui`.
