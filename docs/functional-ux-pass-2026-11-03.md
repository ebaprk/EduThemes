# Functional UX pass — November 3, 2026

Both apps keep the warm white, stone, and charcoal theme, book logo, spacious cards, useful top bars, and shared skeleton loading conventions.

## Researcher changes

- Primary study sections use one row of underlined tabs. Team coding, participant results, and team settings remain accessible through More. Smaller screens use a labelled selector.
- The overview keeps a next action, linked study counts, readiness, and a question work queue. Repeated roadmap and process cards are removed.
- Work-queue actions open the selected question’s coding/review workspace or exact saved findings run. Published activity-plan links scroll and focus the activity plan.
- Repeated publication buttons are consolidated. Read-only draft actions say “View details.”
- Clearing filters clears search and status together. Layout switching survives unavailable browser storage.
- Replacing the current analysis asks for confirmation. Cancellation and failed requests retain the current analysis.
- Recruitment refreshes do not treat a successful local decision as an external conflict. Genuine newer revisions and changed enrollment status still require review.
- Section changes move to their content. The draft editor avoids stacking two sticky menus over fields.
- Select controls reserve a fixed chevron gutter, including the version picker, mobile section picker, and library sort. More supports keyboard activation, Escape with focus return, selection dismissal, and outside-click dismissal.

## Participant changes

- Joining and returning have concise, distinct actions. Promotional entry cards and repeated private-link guidance are replaced with optional contextual help.
- Study codes are validated before navigating to the study.
- Saved studies precede manual private-link entry in both visual and keyboard order.
- “Forget saved link” explains its effect and removes both session and persistent browser shortcuts. It leaves participation and answer drafts intact. Private links still restore access.
- The saved-link preference carries from screening into enrollment and respects an explicit opt-out.
- Native confirmation dialogs support keyboard focus, Escape, cancellation, and narrow screens.

## Verification

- 46 researcher and 23 participant automated tests passed; both production builds passed.
- Disposable local PostgreSQL walkthrough: draft readiness → participant preview → publication → screening with conditional questions → eligibility decision → invitation → separate study consent → enrollment → baseline draft save/return/resume → review/submit → follow-up unlock/submit → consent receipts and completed progress → researcher responses → question-specific coding workspace.
- Verified combined search/status clearing, published activity deep links, team settings access, analysis replacement cancellation and request failure, participant results with no released summary, saved-link cancellation/removal/restoration, and mobile navigation at 390 and 320 pixels without page overflow.
- No real study records were changed during the walkthrough. No external model generation, new database migration, or backend deployment was needed for this pass. The legacy standalone browser scripts were not run; UI checks used the controlled browser against production builds.

This pass addresses the inspected workflows. It is not a claim that every possible role, browser, network failure, or AI-generated output has been exhaustively tested.
