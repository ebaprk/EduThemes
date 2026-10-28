# Phase 1 production release — October 28, 2026

## Live deployments

- Researcher workspace: https://eduthemes-abepark.web.app/
- Participant app: https://eduthemes-participant-abepark.web.app/
- Backend: https://eduthemes-api.onrender.com/
- Researcher/backend source: `1c190179c7cca981e2fb881cd25198bad0e3f184`
- Participant source: `6a3c2259c21b37b48e67a2bb54953f05a041a5f4`
- Successful Render deployment: `dep-dbgu5s142hec73e19o6g`
- Applied database migration: `202610280001_teams_versions_consent.sql`

Both source commits were pushed to their existing main branches. The compatible
backend was deployed first, followed by a brief researcher maintenance page, the
database transaction, the participant app, and the researcher app. Maintenance
has ended. No UF Canvas registration was added or changed.

## Data preservation

A pre-release export was saved as owner-readable files in the ignored
`backend/private/` directory:

- `study-backup-phase1-2026-10-28.json`
- `study-backup-phase1-2026-10-28.csv`

The backup contained 2 studies, 2 questions, 2 submissions, and 1 analysis. Those
counts were unchanged immediately after migration. Both studies received a
historical published version, every existing submission received its version,
and historical consent timestamps remained empty.

Canonical JSON digests of every original record, excluding only the newly added
columns, matched the backup for all four tables. The private digest manifest is
`backend/private/phase1-original-data-digests.json`. No original record contents
were added to source control.

## Verification completed

- The backend deployment reports success for the expected source commit.
- Backend health returns HTTP 200.
- A study-scoped analysis request without authentication is rejected with HTTP
  401 and `STUDY_ACCESS_DENIED`.
- Both live HTML pages reference the current built assets; published JavaScript
  and CSS match the local build bytes.
- The public study lookup function is available and returns no study for an
  unknown code.
- An invalid versioned submission is rejected with HTTP 422.
- Anonymous table access to participant submissions is rejected with HTTP 401.
- A rollback-only production transaction passed the actual study functions and
  row-level policies for publication, invitations and acceptance, researcher and
  reviewer roles, consent enforcement and receipts, idempotent submission,
  analysis saving, stale-save rejection, access revocation, publication of a
  second version, historical response/analysis preservation, and rejection of a
  participant holding a stale version.
- The transaction's synthetic auth rows, study, invitations, responses, versions,
  and analysis were rolled back. A subsequent production query confirmed zero
  synthetic auth users and the original 2 studies, 2 submissions, 1 analysis,
  and 2 migrated historical versions.
- Prior to release, 80 automated checks and both production builds passed,
  including disposable PostgreSQL authorization/migration tests and synthetic
  browser walkthroughs.

## Authenticated production browser verification

The signed-in walkthrough completed against the deployed apps, production
database, and live analysis service. A clearly labeled synthetic study was used:
`TEST ONLY — Phase 1 browser verification — 2026-10-28`
(`0f0e936d-705a-4e28-8b97-45617f49bff6`).

- Created a draft, published version 1 with explicit consent, and opened its
  anonymous participant link.
- Created, copied, and removed a pending reviewer invitation addressed to
  `phase1-reviewer@example.invalid`. No invitation email was sent and no real
  collaborator received access. Invitation acceptance and role restrictions
  were covered by the rollback-only database verification above.
- Refreshed an unfinished participant response: the answer was recovered while
  consent required confirmation again. Submitted one fabricated answer, then
  refreshed the thank-you screen without creating a duplicate submission.
- Downloaded the server-timestamped version 1 receipt and confirmed it contains
  consent information without answers or participant identity.
- Started an authenticated analysis session, created a theme, assigned the
  response, and completed classification with the live model service. Accepted
  the classification and confirmed that the saved decision survived reload.
- Resumed the saved review into a fresh analysis session, generated the final
  summary, and confirmed the study displayed saved findings for version 1.
- Downloaded the final dataset, summary, version-specific coded results, and
  responses/consent CSV. The exports retained the original submission and
  version IDs, accepted decision, and consent text/time. The receipt and coded
  export contained matching version 1 consent text; the CSV contained exactly
  one anonymous response and empty identity fields.
- Opened the saved theme evidence and followed its link to the original response
  and recorded consent time.
- Published version 2 with revised question and consent text. Its participant
  page displayed the new consent, while version 1 retained its original
  response, coding, review decision, and final findings. No version 2 response
  was submitted.
- Closed the test study and reloaded its participant link, which displayed
  **Study unavailable**.

Unlike the rollback-only database smoke test, this browser walkthrough leaves
one closed, clearly labeled test study with two published versions, one
fabricated response, and saved version 1 findings for inspection. No original
study or response was edited or deleted. No password was requested in chat,
reset, or changed.

Real Canvas launches still require UF approval and registration as documented in
`canvas-activation-status.md`.
