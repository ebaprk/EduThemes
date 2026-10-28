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

## Browser verification limit

The researcher app is signed out in the deployment browser. An interactive
authenticated create/invite/code/revise walkthrough awaits researcher sign-in;
the corresponding production database functions and authorization policies were
verified directly as described above. No password was requested in chat, reset,
or changed. Browser flows were verified before release with synthetic services;
production build bytes and the signed-out page were verified after release.

Real Canvas launches still require UF approval and registration as documented in
`canvas-activation-status.md`.
