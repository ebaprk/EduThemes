# Phase 1: teams, study versions, consent, and evidence

This release changes both local projects: `EduThemes` (researcher app, backend,
database) and the sibling `EduThemes-Participant` project. No production migration
or deployment is performed by the implementation itself.

## Included behavior

- Owners create email-bound invitations and share a copyable link themselves.
  A collaborator must sign in with the verified invited email and explicitly
  accept. Creating an invitation does not send a message or grant immediate access.
- Researchers can edit drafts and coding. Reviewers can read studies, responses,
  and findings, and export data. Only owners manage membership, publish, close,
  reopen, or start a revision. Removing membership revokes subsequent database
  access and access to newly bound study analysis sessions.
- Drafts save atomically. Competing draft and analysis saves detect stale
  revisions and preserve the other researcher's accepted save.
- Publication freezes the title, introduction, research context, questions,
  consent text, participation mode, publisher, and publication time as a numbered
  version. Consent is required for every newly published version.
- Close a study before choosing **Create next version**. Editing pauses its
  participant link until publication. History remains available, with responses
  and analyses scoped to their original versions.
- Anonymous studies do not attach Canvas details, even when a participant has a
  Canvas connection. Identified studies require a verified Canvas session plus a
  separate sharing confirmation. Research consent and identity sharing are distinct.
- Participants accept consent before answering. Consent is not restored from a
  draft after a refresh. Answers are recovered from tab session storage, separated
  by study version and identity context. This is browser-tab recovery, not an
  account-based or cross-device participant hub.
- Versioned submissions use stable retry IDs. The database checks consent,
  identity mode, question completeness, and the currently published version in
  the submission transaction. Successful retries do not create duplicate rows.
- Receipts contain the published consent, version, and server-recorded time.
  Retrieving a receipt requires both its submission ID and random request ID;
  the receipt endpoint never returns answers or participant identity.
- Newly imported study responses retain their submission, question, and version
  IDs. Saved theme evidence shows original responses, coding decisions, and
  links to the collected response and consent record. Evidence counts are
  calculated from saved coding. Legacy entries without source IDs retain their
  text and are explicitly shown without an inferred source link.
- Review decisions are saved with the coding snapshot and restored after reload.
  Decision timestamps are browser-recorded annotations. The database separately
  records the authenticated last saver and revision; this is not a complete,
  append-only event audit of every coding action.

## Existing records

The new migration backfills published historical studies as version 1. Existing
submissions and analyses reference that snapshot. Existing records receive no
fabricated consent text or acceptance timestamp. Their mode remains the legacy
anonymous-or-Canvas mode; a newly published revision must explicitly choose
anonymous or Canvas-identified participation and provide consent text.

Legacy submission functions continue to accept responses only for historical
versions without tracked consent. They cannot bypass consent for a new version.
The new participant app always uses the versioned submission contract.

Existing temporary backend sessions have no study association. New analysis
sessions launched from a study record its study ID and check current membership
on every read or write. The standalone response-file workflow retains its existing
session behavior. Original backend processing files remain temporary; saved study
snapshots can be reopened to rebuild an analysis session. An unfinished model
request may need to be retried after a server restart.

## Verification

From `EduThemes/frontend`:

```sh
npm ci
npm test
npm run test:database
npm run build
```

Database tests use disposable PostgreSQL through PGlite. They do not connect to
Supabase or use production credentials. The older Canvas test file checks the
original two-migration contract; the new test file exercises all three migrations,
historical data preservation, invitations, roles, consent, revision conflicts,
version isolation, idempotency, and identity boundaries.

From `EduThemes/backend`, activate its environment and run `python -m unittest`.
Install the already-declared requirements if that environment is incomplete.

From `EduThemes-Participant`, run `npm test` and `npm run build`.

After both frontend builds, run `npm run test:browser` from the researcher
frontend directory. It uses an installed Chrome by default. Set
`BROWSER_EXECUTABLE` to another supported Chromium executable if necessary, or
set `PARTICIPANT_PROJECT` when the participant project has a different location.
The browser checks serve both built apps locally and intercept remote services
with synthetic fixtures. They do not submit real studies, invitations, responses,
or emails. Screenshots are written to ignored `frontend/test-results/phase1/`.

## Coordinated production release

1. Build and verify both apps and the backend. Arrange a short maintenance window
   because the database write contract changes for researcher drafts and coding.
2. Back up production study data and apply
   `supabase/migrations/202610280001_teams_versions_consent.sql`, after the original
   studies and Canvas migrations. The migration runs in one transaction.
3. Deploy the backend, including `study_access.py`. It requires `SUPABASE_URL`
   and a server-held Supabase API key. `SUPABASE_PUBLISHABLE_KEY` is preferred;
   the existing `SUPABASE_SERVICE_ROLE_KEY` is also supported as the API gateway
   key. Authorization for study checks always uses the caller's JWT, so row
   access is evaluated as that researcher. No service key enters a frontend.
4. Deploy the participant app, then the researcher app, during the same window.
5. Verify a fresh anonymous study using synthetic responses: create, invite,
   accept, publish, consent, submit, code, inspect evidence, close, revise,
   republish, and inspect the old version. Verify reviewer access and removal.
6. Verify Canvas participation only after UF registration is available. Its
   existing approval and registration requirements still apply.

An application-only rollback is insufficient after the migration because old
researcher builds use superseded draft and analysis writes. Plan any rollback
around the coordinated database/application contract and preserve newly collected
versions and consent records.

## Later phases

The university-wide study directory, account-based participant hub, screening,
scheduling, multi-activity studies, reminders, payment/credit integrations,
conversational interviews, and cross-study library remain later releases.
