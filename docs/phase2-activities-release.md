# Phase 2.1: study operations and activity plans

## Implemented scope

Researchers can save a recruitment target and private coordinator notes, inspect
enrollment progress across published versions, record compensation/course-credit
handoff statuses, and export a completion handoff without answers, private notes,
or participant access keys. A completed enrollment means every required activity
in its own published plan has a submission. Optional activities do not inflate
the completion requirement. Existing unlinked responses are counted separately;
the dashboard does not infer unique people from anonymous response rows.

Study drafts support up to 12 activities with up to 12 open-response questions
each. Activities have titles, types (baseline, follow-up, diary entry, or open
response), instructions, required/optional status, and opening/due days relative
to joining. Earlier required activities must be completed before later ones
unlock. Due dates are advisory; submissions after a due date remain possible.
A diary entry is one configured activity; repeating schedules are a later step.

Publishing freezes the activity plan, questions, consent, participant contact
information, and compensation description. Each submission and coding source
retains its study version, activity, and enrollment provenance.

## Participant experience

Multi-activity participants separately accept research consent and the linking
of their activities. They receive a random 256-bit private return key. The
database stores only its SHA-256 hash. Their `/my-studies` hub shows required
progress, activity availability, version-specific consent receipts, study
contacts, and coordinator-recorded compensation/credit status.

The private key is a capability: anyone holding it can read that enrollment's
saved drafts and progress. This is explained before joining and beside the
return-link controls. It is carried in the URL fragment, removed from the
address bar after opening, and sent to Supabase only in RPC request bodies.
There is no account requirement, email-based recovery, participant directory,
or cross-study identity matching. Participants can copy/download their link;
remembering it across browser restarts requires an explicit checkbox.

Activity drafts save to the database after a pause in typing and before returning
to the hub. A tab-local copy protects unfinished work. Saves use revisions so a
stale tab cannot overwrite another tab or device. A conflicting local copy stays
available for download while the participant chooses the newer saved draft.
Consent is confirmed again when reopening an activity. Submitted activities are
immutable through the participant functions, and retry IDs prevent duplicates.

An enrollment remains attached to its original published plan when a new version
opens. Closing or revising the study pauses new draft writes and submissions;
existing private hubs and receipts remain readable. Reopening resumes the same
enrolled plans. Single-activity participants still use the existing anonymous or
verified Canvas flow; old responses are never retroactively enrolled or linked.

The first multi-activity pilot uses private study codes without Canvas identity.
Canvas-identified studies remain single-activity. Real Canvas launches still
require UF approval and registration. Handoff statuses are manual records, not
payment transactions or automatic course-credit awards.

## Data and access

Apply `supabase/migrations/202610280002_study_operations_activities.sql` after all
three existing migrations. It runs in one transaction and adds activity metadata
to historical records without changing their original questions, answers,
analysis, consent timestamps, or ownership. Existing single-activity API calls
remain compatible. Cached clients cannot flatten a multi-activity draft or bypass
its per-activity submission flow.

Owners and researchers can change operations settings and handoff statuses.
Reviewers can read and export operations. Every operation checks current team
membership. Direct table access to enrollment keys, progress, and unfinished
answers is denied to both anonymous and authenticated API roles. Participant
RPCs validate the private key, pinned version, activity provenance, opening day,
prerequisites, study status, and answer boundaries. Team-facing operations RPCs
never return unfinished answers or access-key hashes.

Receipts preserve the research consent and, for linked activities, the exact
linking notice, its version, and the server-recorded acceptance time. Completion
handoffs contain study references and activity counts; response exports include
activity/enrollment IDs with spreadsheet-formula neutralization.

## Verification

Run from `frontend`:

```sh
npm test
npm run test:database
npm run build
node e2e/phase2-server.mjs
```

The last command builds isolated local previews, creates disposable PostgreSQL,
and serves the researcher at `http://127.0.0.1:5180` and participant app at
`http://127.0.0.1:5181`. It prints a synthetic sign-in and seeded draft study.
All RPCs and table reads use the real migrations and row-level policies. No
production service, credential, or participant record is used. Stop with Ctrl+C.
The sibling participant project must have its existing dependencies installed.

Run `npm test` and `npm run build` in `EduThemes-Participant` as well.

The local browser walkthrough verified activity editing and publication;
recruitment settings; explicit linking consent; private return-link recovery in a
fresh tab; draft conflicts and preservation of the older copy; baseline/follow-up
completion; optional-activity denominators; coordinator handoff status; and a
downloaded completion CSV containing one completed enrollment, two required
activity submissions, and no private coordinator notes.

## Release order and current status

Released on October 28, 2026. The migration is applied to the existing Supabase
project. The [participant app](https://eduthemes-participant-abepark.web.app/my-studies)
and [researcher app](https://eduthemes-abepark.web.app) are deployed.

Final checks passed: 15 researcher unit tests, 31 database tests, 14 participant
tests, and both production builds. Twelve researcher files and eight participant
files served by the live sites match the tested builds byte for byte.

The protected backup and post-migration snapshot confirm that every original
field in the existing studies, questions, submissions, analyses, versions, and
memberships is unchanged. All three new tables have row-level security and no
direct grants to either API role. Six live HTTP checks confirmed invalid-key
rejection, denied private-helper access, denied anonymous operations access,
and denied direct reads of each protected table.

The live participant hub was also checked through its loading, invalid-link,
and recovery states. The complete create/publish/join/draft/submit/handoff
walkthrough was performed on the isolated local database; its authenticated
production counterpart was interrupted by concurrent Chrome use. These release
checks added no production test study, enrollment, submission, or invitation.

Release sequence:

1. Export the existing studies, questions, submissions, analyses, versions, and
   memberships to the ignored owner-readable `backend/private/` directory.
2. Apply the new migration to the existing Supabase project in one transaction.
3. Verify original records against the backup, excluding only newly added fields.
4. Deploy the participant app, then the researcher app. No new backend service,
   credentials, or environment variables are required for this increment.
5. Compare the live files with the tested builds and check the live participant
   hub and protected API boundaries.

Backend analysis requests still use temporary sessions/files. Durable background
analysis jobs, account-based participant hubs, recruitment screeners, appointment
scheduling, automatic reminders, and repeating diary schedules are subsequent
increments.
