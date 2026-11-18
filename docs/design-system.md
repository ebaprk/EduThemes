# EduThemes interface direction

The researcher and participant apps use real [shadcn/ui](https://ui.shadcn.com/)
components from the shared `@eduthemes/ui` package in `packages/ui`. The package
owns the component source, neutral theme tokens, and shared component styling.
Both apps use Tailwind CSS v4; dialogs, tabs, tooltips, checkboxes, and the
researcher account menu use the Radix primitives provided by shadcn.
Bootstrap, React Bootstrap, and DaisyUI have been removed from the researcher app.

The workspace retains compact work areas and explicit separation between study
design, participation, responses, and analysis. See
[`packages/ui/README.md`](../packages/ui/README.md) for component ownership and setup.

EduThemes keeps its own green book mark, existing language,
and research workflows. No reference-site logos, assets, or application code
are copied.

## Foundations

- Give each task one clear heading and a short introduction when it adds useful
  context. Avoid repeating the page purpose as an eyebrow, heading, and paragraph
  across multiple panels. Put supporting explanations in `ContextHelp` or an
  existing guide; keep errors, decisions, consent, and important privacy information
  visible where users act. Research responses and study-authored content retain
  their full wording. Preserve readable type and use 20–24px between work areas
  and 12–16px within related groups.
- Participants separates Applications and Enrollments into mounted tabs so local
  review notes survive switching views. Application review appears after selection.
  Empty views use one short state and useful action; status filters hold full stage
  counts, and populated views use inline summaries rather than walls of metric cards.
- Geist for headings, controls, and reading text, with system sans-serif
  fallbacks. Keep body text at 14px and helper text at 12px or larger.
- A neutral workspace canvas `#fafafa`, white surfaces `#ffffff`, inset
  panels `#f5f5f5`, borders `#e5e5e5`, ink `#171717`, and muted text
  `#737373` across both apps. Use semantic shared tokens instead of introducing
  a second palette in individual screens.
- Charcoal primary actions `#262626` and neutral accents `#f5f5f5`.
  Inputs, progress, selection, and keyboard focus share this palette;
  warning and error states retain their distinct amber and red colors.
- Neutral skeletons use the shared muted token; the green book icon remains the brand mark.
- A shared type scale: 28px page titles (24px on phones), 20px section headings,
  16px subheadings, 14px body text, and 13px labels and helper text. Eyebrows and
  minor metadata may use 12px. Reading documents can retain their own print scale.
- Content determines card height. Outer panels use 20px padding on desktop and
  16px on phones, with 16–20px between sections and 8–12px within related groups.
  Nested choices, quotes, and coder ballots use 10–16px insets instead of another
  full outer panel inset. Overview counts sit beside their labels and actions.
- Main controls use 40px desktop heights and at least 44px on phones. Participant
  controls retain 44px targets. Study fields use 16px text on phones to remain readable when
  focused. Decorative space must not be added by the final CardSpacing layer.
- The optional study template picker starts collapsed. On phones the study form's
  actions follow the fields instead of covering them with a tall sticky footer.
- Dialogs use one continuous neutral surface. Do not add contrasting header
  and footer bands or nest another card solely to frame the dialog's content.
  Keep titles compact and close controls at least 44px. Participant preview uses
  inline step navigation and actions immediately beneath the content, with its
  close control reachable while long content scrolls. Preserve Escape dismissal
  and focus restoration.
- One compact researcher top bar across desktop and phones. The brand is the
  home link; no separate Studies destination repeats it. Help remains directly
  accessible, and the shadcn account menu contains identity and sign-out. The menu
  supports keyboard navigation, Escape dismissal, and focus restoration. Account
  checks and pending navigation/sign-out actions use shared skeletons.
- Each researcher page keeps its own heading. Import file is the primary
  action beside the Studies heading, with Create study as the secondary action.
  Import is an action on this page rather than a duplicate global destination;
  ongoing work remains available through Continue analysis. Search belongs to the library filters and keeps
  the selected status and sort while filtering. Other researcher pages keep their
  own task-specific back links. Sticky menus account for the actual top bar height.
  Home navigation and sign-out wait for queued study saves. The top bar sits below
  dialog and menu overlays, and page content uses the width recovered from the sidebar.
- The participant sidebar provides the private-link shortcut on desktop; a
  compact header keeps it available on phones and during focused study slides.
  Its shared shadcn dialog supports study keys and private results links,
  validates locally, keeps credentials in URL fragments, traps keyboard focus,
  and restores focus on dismissal. Mobile navigation remains directly available.
  The participant toolbar uses the shared workspace background.
- A searchable study library with URL-based status filters, sorting, grid and
  table views, real status counts, and separate loading, error, and empty states.
- An efficient single-page researcher study form with all fields available in
  design, participation, and activities sections. Section links provide quick
  access; researchers can edit questions together and save directly. Researcher
  study setup never uses a slide flow or requires a separate review step.
  Each activity and question keeps its association when adding or reordering.
  Setup section links use a flat row with one active underline; avoid nested
  pills or repeated icons. The active section follows scrolling and field focus,
  with a two-column link layout on phones.
  Study pages provide section links for operations, participation, responses,
  and team.
- A study overview with an inline version-specific summary and an actionable
  question queue. Submission counts stay separate from questions with answers;
  saved analyses count completed runs. Pending questions precede completed work.
  Start coding, Continue coding, Continue review, and Open findings use the same
  saved-state logic as Responses and Analysis, and open the selected task directly.
  The published overview has one action per question, without a duplicate next-step
  banner or metric cards. Draft readiness retains the owner-only publication action.
  Purpose, participation, activities,
  screening, and recommended context link directly to the appropriate editor section.
- The study header places collection status beside the title and groups the
  compact version selector with participant preview. Historical and preserved
  published views have explicit labels. Study navigation uses a flat row and active
  underline, with a native section picker on narrower screens.
- A participant preview covers the introduction, branching screener, consent, and
  activities without making network writes. Unsaved edits can be previewed locally.
- A study-information rail beside responses and saved evidence on desktop.
- Participant activities beside private return controls and study details.
- Full-page participant study slides: introduction, consent, any Canvas sharing,
  one question at a time, answer review, and completion. The private activity
  hub retains its overview and return controls between activities.
- Stacked panels at narrower widths; independent table scrolling where needed.
- Visible keyboard focus, mobile touch targets, and reduced-motion support.

Shared foundations are in `packages/ui/src/theme.css` and
`packages/ui/src/components.css`. Each app imports Tailwind and this theme through
`src/styles/shadcn.css`; the component stylesheet loads after existing page styles.
Researcher `ContextTheme.css` and `ResearchFlow.css`, and participant
`ContextTheme.css` and `RoomyTheme.css`, retain page layout rules. New controls
should come from `@eduthemes/ui/components/*`, with layout-specific composition in
the owning screen. Participant responses use a focused slide canvas with the
portal sidebar hidden while answering.

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
The complete screen inventory runs with `npm run test:ui:audit` after building
both apps. Set `UI_AUDIT_OUTPUT` to retain a separate snapshot, or
`PARTICIPANT_DIST` to use a particular participant build. This diagnostic records
known product findings as well as unexpected walkthrough failures; a successful
walkthrough does not mean every recorded product finding is resolved.


## Researcher task flow

- The library offers two explicit starting points: create a study to collect new
  responses, or import a response file. Fresh imports open the file form directly;
  the analysis session starts on submission. A failed upload retains its selected
  file and entered context and reuses the pending session on retry. Existing
  workspaces retain their resume and explicit replacement flow.
- Study setup ends with Save draft & review next steps. Publication remains on
  the overview readiness screen. The study header contains version and participant
  preview controls; it does not push an unrelated next action on every destination.
  Study setup and Participants use plain destination names.
- Each collected question offers Start coding, Continue coding, Continue review,
  or Open findings according to its actual state. Finished questions open saved
  findings by default. Starting another completed run is an explicit secondary
  option. Independent team coding is linked from the analysis question list.
- Codebook controls sit with themes. Continuation follows the example table and
  review assignments, with visible explanations when an action is unavailable.
  The codebook dialog has Themes and Import & reuse views. Keep the current theme
  list beside a compact editor on desktop; stack the editor first on phones.
  Expand optional coding rules only when needed. Show the 200-character definition
  limit and group JSON codebooks and CSV/TXT theme lists with explicit format labels.
  Invalid imports preserve existing themes and response coding.
  On phones theme controls precede the response table. Responses use neutral,
  top-aligned rows with full original text; processed text is available per row.
  One shadcn checkbox menu assigns multiple themes or an exclusive no-match
  example. Assigned themes remain visible as removable tags. Removing the last
  theme or clearing no-match returns the response to uncoded. With Uncoded only
  active, a row remains visible while its menu is open; Done/Escape moves focus
  to the next response after the coded row disappears. Search and filters have
  an explicit empty state and reset action. Avoid whole-row selection styling,
  duplicate response previews, and stacked redundant status labels.
- Study analyses have three stages: Code examples, Review coding, Findings. File
  analyses include Import data as their first stage. Back navigation returns study
  coders to their question list, preserving the version. Progress labels wrap on
  narrow screens rather than clipping later steps.
- Study name, version, and save status sit together above the page title, without
  a separate shell banner. Saving uses the inline skeleton; failed saves keep a
  visible warning and coding download. Saved findings identify their read-only
  state, while file imports omit study save metadata.
- Phone review uses one compact theme chooser; desktop keeps the theme list
  beside the assignments. Switching themes retains the recorded decisions.
- Findings open with the summary. Evidence and data downloads, optional charts,
  and Review & report have distinct tabs. Preparing a brief opens the reporting
  tab; switching tabs keeps entered notes mounted. Tab URLs retain the real study
  path, selected version, and saved run. Reloading an imported report reopens the
  selected tab and recovers its saved draft notes.
