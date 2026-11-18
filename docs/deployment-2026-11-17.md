# November 17, 2026 deployment

The current researcher and participant UI builds are published to the existing Firebase sites:

- Researcher: https://eduthemes-abepark.web.app/
- Participant: https://eduthemes-participant-abepark.web.app/

The researcher release includes the top bar, compact workflow headers, response coding picker, theme-suggestions dialog, and the preceding shared shadcn UI changes. Participant UI changes from the same work session are published as well.

Both production builds passed. The release retains 57 researcher, 23 participant, and 47 backend unit-test results. The preceding screen diagnostic covered 132 states and 305 captures. Every published researcher file (25) and participant file (12) matches its local build. Live public pages rendered at desktop and phone widths without runtime errors or page overflow. Authenticated study writes and paid model generation were not exercised during this deployment.

## Backend status

The compatible coding-example patch and its tests were committed and pushed to the existing main branch as `f75e4452122908928a16f03641136a7235a5ba5d`. The source push is complete, but the live backend still returns the previous validation behavior. Backend activation is not claimed complete. Its health endpoint and configured model availability remain healthy.

The Render integration is available but is not installed/connected. No direct deployment hook is configured on the repository. Direct Render access is needed to activate and inspect this backend release if the configured automatic deployment does not pick it up.

The synthetic release probe uses temporary, unscoped analysis sessions and invalid calibration input that is rejected before any model request. Each probe removed its temporary session. The positive multi-theme/no-match probe is gated until the new validation behavior is live.

No database migration or hosting-plan change was performed. Previous Firebase releases, current release IDs, file digests, source fingerprints, live screenshots, and the pending backend check are retained in `outputs/deployment-2026-11-17`.

The frontend release was built from the current working tree. Other local UI/source work remains uncommitted; only the four backend files required by the existing backend pipeline were committed.

## Codebook dialog follow-up

The researcher site was republished with the compact codebook editor, optional coding rules, and explicit JSON and CSV/TXT import controls. Overlength errors identify the field and its character limit. The supplied Independent thinking definition was shortened to fit the existing 200-character limit, and the research kit now includes a complete JSON codebook as well as the corrected TXT alternative.

All 25 published files match the tested build. Both actual sample files imported six themes through the published site's browser controls using intercepted services and fictional data. Editing, rule retention, download, saved-codebook reuse, failed-import preservation, and focus return passed. Empty, import, imported, and editing states fit five widths from 320 to 1440 pixels. The 57 researcher unit tests, existing researcher import scenario, and six theme-dialog/error audit states passed. Evidence is retained in `outputs/codebook-dialog-2026-11-17`.

This follow-up changes the researcher frontend only; the backend activation status above remains unverified.
