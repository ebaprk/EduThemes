# Recruitment and screening

Implemented November 2, 2026. Apply `202611020002_recruitment_screeners.sql`
before deploying either frontend. This is an opt-in extension for anonymous studies;
existing published studies retain their participation flow.

## Researcher workflow

In a study draft, enable “Require screening and a researcher invitation.” Add the
eligibility description, time estimate, location, study-specific screening notice,
and 1–12 single-choice questions with 2–8 choices each. Questions may depend on an
answer in an earlier question. Answer rules flag an application for closer review;
they never decide eligibility or reject a participant automatically.

Publishing freezes the preview, screener, branching, and notice with the existing
study version, activity plan, and study consent. The Recruit section shows current
application stages: awaiting review, eligible, waitlisted, not eligible, invited,
enrolled, and completed. A researcher records eligibility before inviting someone.
An invitation enables participation through the volunteer's private hub; no email
or other message is sent. Recruitment targets remain coordinator planning values,
not automatic admission limits. Waitlist promotion is manual.

Owners and researchers may review applications. Reviewers may inspect them. Every
review checks current team access and an optimistic revision, and adds a review
history event. Notes are private to the study team. Enrolled participants cannot be
retroactively rejected through recruitment. Completion comes from actual required
activity submissions, not a manually set pipeline status. Counts are application
records, not deduplicated people across studies or devices.

## Participant workflow

The shared study link opens a preview of eligibility, time, location, activities,
compensation, and study contact. Screening permission is separate from study consent.
Branching clears hidden answers, and the server independently validates all visible
questions, choices, and the published version. Participants review before submitting.
Network retries with the same private key and exact answers are idempotent.

A private return link opens screening status in My studies without an account.
Participants can copy/download the link and opt into remembering it on their browser.
The key is carried in a URL fragment, removed after opening, and sent only in RPC
request bodies. Only its SHA-256 hash is stored in the database. Anyone holding the
link can access that participation; this is explained before screening and in the hub.
No name, email, cross-study profile, or notification service is introduced.

An invited volunteer separately reviews study consent and accepts linking before
joining the existing activity hub, including for a single-activity screened study.
Closure pauses joining; a newer version does not silently transfer an old invitation.
Existing enrollments retain their original plan and receipts. A lost private key
cannot be recovered by the study team.

## Data boundaries

Screening answers and review history use separate tables with RLS and no direct
anonymous/authenticated table grants. Helper functions and the renamed base RPCs
are not callable by browser roles. Researcher RPCs enforce current study membership;
participant RPCs require the full private capability. Participant status omits rule
results, private notes, review history, other volunteers, and key hashes.

Screening answers never enter `study_submissions`, analysis datasets, response
exports, or the model. Server-side enrollment and submission triggers prevent old
clients or direct legacy RPC calls from bypassing an enabled screener. Existing
study consent is still required after an invitation. No real participants, contacts,
or invitations are needed for verification.

## Summary completeness

New summaries request concise, complete sentences with sample-size limitations and
no unsupported causal/statistical claims. Complete text is retained verbatim. Output
budget exhaustion or a paragraph ending in a fragment triggers one shorter retry;
persistently unfinished output fails visibly instead of being saved as complete.
This detects obvious cut-offs, not all factual or stylistic flaws. Existing saved
findings are preserved; regenerate a new run to use the updated checks.

## Verification

- Backend: 40 unit tests.
- Researcher: 21 unit tests.
- Participant: 16 unit tests.
- Database: 48 tests, including 8 screening/recruitment scenarios.
- Both production frontend builds.
- `node frontend/e2e/recruitment-server.mjs`: two production builds and a real
  disposable PostgreSQL/RPC facade with fabricated data. Fake sign-in and study code
  are printed. Stop the process when done; nothing is written to production.
- Local UI walkthrough: edit and save the screener, publish, preview, grant screening
  permission, answer a conditional question, review, submit, waitlist, confirm
  eligibility, invite, accept separate study consent/linking, complete baseline and
  follow-up, and verify the same application reaches Completed. The participant
  view did not include the private coordinator note.

## Deployment

1. Back up all existing study, question, submission, analysis, version, membership,
   operations, enrollment, activity-progress, and analysis-job records to ignored,
   owner-readable files. Never commit participant records or capabilities.
2. Apply the additive migration as a transaction. Compare all original fields with
   the backup and verify RPC/table privileges.
3. Publish the participant app, then the researcher app. Deploy the backend summary
   change on the existing Render service. No hosting upgrade or new service is needed.
4. Repeat the workflow with an explicitly labeled fabricated study and close it to
   new participation afterward. Keep the verification records separate from research.

Rollback frontends/backend as needed; retain the additive schema and private records.
Do not drop screening gates on already-published screened studies. A later client
without screening support cannot submit to those studies, while unscreened studies
remain compatible.

The current NaviGator key remains limited to Nemotron and a $5 budget, with automatic
rotation disabled. Toolkit rejects “Never resets”; its November 29 expiry precedes
the first scheduled reset. A permanent no-reset replacement still requires resolving
that provider setting. This release does not extend or renew the credential.

Deployment status: local checks passed; production rollout pending.
