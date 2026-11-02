# Returning results to participants

November 2, 2026.

## Workflow

The researcher workspace now has **Participant results** for each published study
version. Owners and researchers can prepare a plain-language summary, choose the
saved findings runs it draws on, save a draft, and preview the saved text. Reviewers
can read and preview but cannot edit. Only the owner can release or withdraw it.

Release requires a title, overview, findings, limitations, contact information,
at least one supporting findings run, and the owner's explicit participant-audience
review attestation. Every source must have a current sign-off matching the exact
saved analysis hash and review revision selected for this draft. A source change
requires refreshing, saving, and previewing again. No AI request is made and no
response text or generated research summary is copied automatically.

Drafts are separate from releases. Editing or saving a draft leaves the existing
release unchanged. Each new release freezes the participant text and source
references, with a server-recorded owner and timestamp. Earlier releases remain
available to the authorized study team. Withdrawal removes the current release
from participant access without falling back to an older release. Downloaded copies
cannot be recalled. Later analysis/review changes do not silently rewrite a release;
the owner must replace or withdraw it when necessary.

## Participant access

Participants with an enrollment can open results from **My studies**, using their
existing private return key. Single-activity participants receive a private results
link after submission, using the same submission ID and private request ID already
used to retrieve their consent receipt. The new link can be downloaded separately
from the ordinary receipt. Existing receipts without their private proof cannot
recover a results link from the submission ID alone.

The **Study results** page accepts either private link and stays tied to the original
published study version, including after collection closes or a new version opens.
Credentials are carried in the URL fragment, removed from the address after opening,
and stored only in the tab's session storage. Participants can download their private
link or forget this tab's stored results credential. Existing private study-link
storage is managed separately in My studies. The page supports refresh and a plain
text download of the released summary. It distinguishes a settled absence of results
from loading or an error. A release is optional; none is promised automatically.

The participant RPC returns only frozen study title/version/contact information
and the current released summary. It does not return draft content, raw answers,
screening, coder notes, source reviews, source hashes, or team identities. Knowing
a public study code or a submission ID alone does not grant results access. This
phase sends no email, creates no public results listing, and changes no study roles.

## Data and verification

Migration `202611020005_participant_results.sql` adds two private RLS tables and five
scoped RPCs. Browser roles have no direct table access. Saves, releases, and withdrawal
use optimistic revisions; authenticated identity and timestamps come from the server.

- Researcher tests: 42 passed.
- Participant tests: 19 passed.
- Database tests: 73 passed, including nine new results tests covering permissions,
  source validation, stale edits, sign-off requirements, access proof, version isolation,
  single-activity receipts, immutable releases, withdrawal, revoked membership, and
  the existing owner deletion cascade in a disposable database.
- Both production builds passed.
- Local browser walkthrough used fabricated responses and accounts: single-activity
  consent/submission, private results-link creation, unreleased state, summary drafting,
  source selection, preview/attestation, release, participant summary, hidden draft edits,
  stale second-editor save with input preservation, withdrawal, and a second release
  with retained history. Refresh restored the private results credential correctly.
- The actual downloaded release 2 text matched the released summary and excluded
  private draft/source details. Participant and researcher layouts fit a 390px viewport
  with no document overflow; the participant page was visually inspected.

Local fixture: `node frontend/e2e/participant-results-server.mjs` serves both apps
against disposable PostgreSQL. No production participant record or model request
is used by that walkthrough.

## Rollout

Production migration and publication are pending. No production results have been
drafted or released by this phase. The backend application requires no changes.
