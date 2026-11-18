# EduThemes project brief

November 16, 2026

## Purpose

Develop the complete researcher-directed qualitative analysis workflow described in the professor meeting: upload data, define a research question, guide coding with human examples, inspect and correct assignments, verify coding, finalize the dataset, and present a documented scientific report. The researcher must understand and control the decisions at each stage.

This brief applies the [literature review](../outputs/research-report-2026-11-16/ai-automated-research-literature-review.md) to development. It does not claim a novel contribution or evaluated benefit. The contribution section will be written after the app is finalized and evaluated.

## November 17 closeout

The researcher site and Render backend are live. **Import & continue** saves the file as a private study and opens coding. The study appears under **Imported** in Studies. From Findings, **Compare independent coding** opens Team coding for that same study, where a researcher can assign a shared sample and reconcile differences. The database changes are in `202611170001_imported_studies.sql` and `202611170002_save_import_on_upload.sql`.

A desktop browser rehearsal used the real CSV parser, a disposable PostgreSQL database, scripted model suggestions, and two fictional accounts. A researcher corrected a proposed coding, one planned disagreement produced a Planning kappa of 0.50, and the reconciled report preserved that value. The scratch-study setup and publication workflow also passed a separate browser check. This is software verification using fabricated inputs.

The [research report](../outputs/professor-closeout-2026-11-17/eduthemes-research-report.pdf) includes the EduThemes contribution. The [rehearsal research brief](../outputs/professor-closeout-2026-11-17/synthetic-rehearsal-research-brief.pdf) shows the app export. The [narrated demo](../outputs/professor-closeout-2026-11-17/eduthemes-demo.mp4) and [captions](../outputs/professor-closeout-2026-11-17/eduthemes-demo-captions.srt) are ready for upload.

## Requirements from the meeting

| Meeting requirement | Acceptance criteria |
| --- | --- |
| Upload data and define research questions, 0:00–0:18 | Original responses and their research question remain visible and associated throughout coding and reporting. |
| Human feedback guides analysis, 0:19–1:01 | The complete set of researcher-approved example assignments guides every subsequent classification batch; multi-theme and explicit no-match examples are supported. Researcher examples remain unchanged by classification. |
| Verify coding and calculate reliability, 1:03–2:01 | Preserve independent original choices. Calculate clearly identified agreement measures before adjudication; report the sample and denominators. Explain undefined or unavailable coefficients. |
| Intuitive UI and researcher control, 2:01–2:25 | Clear stage descriptions, original text beside decisions, editable codebook, reversible review, saved progress, accessible loading and error states. Maintain the established shared design system. |
| Scientific reporting, 2:26–2:50 | A report includes the question, methods, reviewed findings, selected evidence, limitations, AI disclosure, and codebook. Do not invent consent, model identity, independent review, or statistical results. |
| Video demonstration, 5:33–5:52 | A coherent demonstration eventually covers the full workflow, including a correction, independent verification, final findings, and export. Recording and sharing follow validation of the app. |

## Evidence and design decisions

Chew et al. and Xiao et al. support explicit codebooks and example-guided deductive coding. Implement feedback as prompt guidance and retained researcher decisions; do not describe it as training model weights. Evaluate generalization using responses kept separate from the guidance examples.

Braun and Clarke distinguish coding reliability approaches from reflexive thematic analysis. This app's fixed-codebook comparison is described as a coding reliability workflow. It must not imply that kappa is required for every qualitative method.

Artstein and Poesio, together with Hill et al.'s empirical example, motivate reporting observed agreement and code prevalence alongside chance-corrected agreement. Use Cohen's kappa for two fixed human coders on the same responses. Because responses can have multiple themes, calculate a separate binary coefficient for each theme. With more coders, retain separate pair comparisons; never pool them into a purported Cohen's kappa. Calculate from submitted choices before reconciliation. This is a methodological implementation choice, since the professor left the precise timing and comparison design to be decided.

SRQR provides broad reporting guidance; COREQ specifically concerns interviews and focus groups. Use those sources to guide report preparation, without presenting a completed text field or sign-off as certification of methodological quality or institutional approval. Both imported-file and saved-study analyses need a usable report path.

Amershi et al. and Buçinca et al. motivate visible source evidence and deliberate review. Keep corrections inspectable and avoid using an approval click as proof that independent coding occurred.

## First implementation pass

1. Carry all researcher examples into each classification batch, preserve all assigned themes, and distinguish intentional no-match examples from untouched responses.
2. Add per-theme Cohen's kappa for submitted coder pairs, including overlap counts, category frequencies, undefined cases, and exportable calculation details.
3. Add shared reporting guidance and an imported-file report draft with selected supporting quotes, methods, limitations, AI disclosure, and accessible preview/export. Preserve existing saved-study approval controls.
4. Verify the changed calculations and feedback behavior with focused tests, run regression checks and production build, and exercise the affected screens with fabricated data.

## Evidence needed before final delivery

- A real two-coder exercise is needed to obtain a research reliability result. Synthetic software checks demonstrate calculation and workflow behavior only.
- A held-out human–AI evaluation, if included in the project, needs a separately designed sample and frozen reference; ordinary review clicks do not establish independence.
- Review the complete export and researcher workflow with the professor or intended researchers. Record actual usability observations rather than assuming the interface is effective.
- Apply and verify the finished changes in the intended deployment before recording the final demo. This local implementation pass does not itself publish or upload a video.

## Local implementation and verification

The first pass is implemented in the local researcher app and backend. No database migration or participant-app change is required. These changes have not been deployed.

- Every classification batch receives the full researcher example bank, including multi-theme and intentional no-match examples. Example assignments are preserved and fully coded datasets require no classification model request.
- Team coding displays per-theme Cohen's kappa for a selected submitted coder pair. Exports retain all eligible pairs with denominators and inclusion frequencies. Constant identical choices produce an undefined coefficient; disjoint samples produce no coefficient. Original scores survive adjudication.
- Both analysis paths offer reporting guidance. Imported-file analyses can retain draft notes within the browser tab, select original quotes, preview or print, and download a research brief. File imports do not imply anonymous participation or consent. Saved studies retain their existing review and sign-off process.
- Focused checks: 52 frontend unit tests, 47 backend tests, and 73 disposable database tests passed. The researcher production build passed.
- Two new browser scenarios passed against the production bundle with fabricated responses: example coding through final findings and report preparation, plus an independent team comparison and agreement export. Checks covered note recovery after reload, quote selection, and 390px layouts. No live model or real participant was used.
- The broader browser suites are not green. After updating two older participant-fixture assumptions, the phase-one suite reaches an obsolete selector for “View published questions and consent.” The researcher UI suite expects dashboard metric markup that the current interface no longer renders. These older scenarios need maintenance before they can provide a full regression result; the two new scenarios pass independently.

All cited research and accessible source links are in the review's numbered bibliography and [source notes](../outputs/research-report-2026-11-16/source-notes.md).


## Practical interface follow-up · November 16

Both local apps now use compact panels and a shared heading scale. Outer panel
padding is 20px on desktop and 16px on phones; nested coding choices and ballots
use smaller insets. The final card stylesheet no longer inflates every panel.
Page titles are 28px (24px on phones), section headings 20px, and subheadings 16px.

The coding and review grid now targets the actual form wrapper, restoring the
side-by-side theme context and response work area on desktop. Study overview
counts use compact rows. Optional templates start collapsed, and phone study-form
actions follow the fields instead of covering them with a tall sticky footer.

Validation: both production builds passed, along with 52 researcher and 23
participant unit tests. Focused browser checks covered the library, study setup,
overview, published design, responses, analysis, findings, manual coding, and
classification review at 1440px, 390px, and 320px. Entered fields survived resizing
and applying a template still populated the form. The coding-to-report, kappa
export, participant entry/private return, and participant answer/review scenarios
also passed with synthetic services. These focused results do not supersede the
broader browser-suite limitations above. No deployment was performed.

Comparison screenshots and measurements are in
`frontend/test-results/density-before` and `frontend/test-results/density-after`.
The study setup page is about one-third shorter in the same synthetic comparison.


## Researcher flow refinement · November 16

The researcher journey now puts each next action beside its work. Entry actions
are on the study library; fresh file imports skip the separate workspace-creation
screen. Draft setup leads to readiness review and publication. Collected questions
link directly to coding. Completed questions open saved findings instead of
starting another run; a deliberate new-run option remains available.

Theme editing is grouped with the codebook. Coding and review continuation sits
after the work with explicit prerequisites. Study analyses no longer show a
misleading upload/setup step that sends researchers to the published study design.
Independent team coding is linked from the analysis list. Findings open on their
summary, then offer evidence, charts, and a separate report-preparation destination.

Verification: 57 researcher unit tests and the production build passed. Six focused
browser scenarios passed using synthetic services: setup through publication and
collection, direct import with failed-upload recovery, responses through coding and
return navigation, saved findings with report-note retention across tabs, complete
coding/review/report export with draft recovery, and independent kappa export.
Checks exercised 1440px, 390px, and 320px coding/review layouts. Study tab navigation
was checked to retain its real study path, version, and saved-run query. No live
model, real publication, or deployment was used. These checks do not make the older
browser suites a complete passing regression suite.

Preview captures are in `frontend/test-results/phase1/streamlined-*.png`.


## Page hierarchy correction · November 16

The redundant researcher desktop utility bar is removed across the app. Each
page opens on its actual heading; study search is grouped with the library
filters, sort, and view controls. Search preserves the active filter and sort,
including rapid consecutive changes. Phones retain only the brand and menu
strip above the page. Drawer keyboard behavior and sticky-menu offsets were
checked at desktop, 390px, and 320px widths. The researcher build and 57 unit
tests pass; a focused browser walkthrough covered the revised controls and
navigation. Preview captures are in `frontend/test-results/page-hierarchy`.
