# Collaborative coding and adjudication

November 2, 2026.

## Workflow

The new **Team coding** destination works on a selected published study version.
The study owner selects a question, a saved codebook, existing active researchers,
and a response sample for each coder. Samples can overlap for comparison or be
separate to divide the work. A round supports up to ten coders and 500 responses.
The server freezes the codebook and actual submitted text; response identity fields,
screening records, earlier theme assignments, and AI classifications are not copied.

Each assigned owner/researcher saves a separate ballot. Notes can be saved before
coding is complete. A response needs an explicit theme selection or explicit
no-match choice before submission. Submission locks the ballot. Other ballots and
notes stay hidden through the round RPC, including from the owner, until every
active assigned coder has submitted and the owner opens comparison. Direct table
access is revoked and RLS is enabled. Existing study roles are unchanged: reviewers
remain read-only; owners create/reveal/finalize rounds and adjudicate decisions.

This provides independent choices **within the coding round**. Existing study
permissions still allow researchers to inspect other study materials and previous
analyses. It is not a guarantee of complete study blinding. The interface states
this limitation. No model request runs inside independent coding.

Comparison shows original choices and shared coder notes. Each disagreement needs
an explicit final theme set and rationale from the owner. An unresolved decision
has no default theme selection. Original submissions remain unchanged. Finalization
requires every disagreement to be resolved. Revisions protect ballots, adjudication,
and state transitions from stale saves. Removed/downgraded researchers cannot keep
coding. A round blocked by an inactive coder can be cancelled before comparison;
saved work is retained, and the owner can create a replacement round.

Finalized consensus can be applied once as a new analysis run in the existing
classification-review workflow, without another model classification. Earlier
findings are retained; an unfinished analysis cannot be overwritten. The handoff
uses the newly saved revision rather than the old workspace revision. Subsequent
analysis edits are allowed and logged separately. Research briefs for the resulting
saved run include its actual original coding/reconciliation process.

## Agreement and exports

Agreement is calculated from the original locked choices, before adjudication:

- Exact theme-set agreement: matching coder pairs divided by all coder pairs
  sharing a response. Theme ordering does not affect a match.
- With three coders sharing a response, three pairs enter the denominator.
- Explicit empty/no-match choices are included. Missing assignments are excluded.
- Per-theme agreement includes both joint inclusion and joint exclusion.
- Single-coded responses are reported separately. No overlap produces an
  unavailable percentage, rather than a fabricated zero or perfect score.

These are descriptive agreement rates, without chance correction. No kappa or
other reliability coefficient is claimed. Resolving a disagreement does not
inflate the original agreement score. The downloadable coding report includes
denominators, process, resolved counts, frozen codebook, and final coding counts.
It excludes raw response text, coder emails, coder notes, and decision rationales.
Those details remain available to the authorized team in the application.

## Verification

- Researcher unit suite: 40 tests, including overlap denominators, multiple coders,
  no-match choices, hidden comparisons, unresolved-decision defaults, and export
  boundaries/provenance.
- Nine new disposable PostgreSQL tests cover permissions, frozen assignment inputs,
  hidden ballots, submission locks, stale writes, invalid assignments/themes,
  adjudication rationale, finalization, consensus preservation, unfinished-work
  protection, report provenance, revoked access, cancellation, and deletion cascade.
- The complete database suite passed all 64 tests. Together with the 40 researcher
  tests, 104 checks passed. The final researcher production build passed.
- Local production-build walkthrough used two fabricated test accounts. The second
  coder could not see the owner's note before comparison. A deliberate disagreement
  produced 50% agreement; resolving it preserved that original score. Consensus
  finalized, its report downloaded correctly, and the analysis handoff opened the
  existing review screen with saved progress and the adjudicated coding.
- A 390px mobile comparison screenshot fit without document overflow.

Migration: `supabase/migrations/202611020004_collaborative_coding.sql`.
Adds four private coding tables and scoped RPCs, and augments saved-run review
provenance. No participant or backend application change is required.

Production migration and hosting publication are pending until the existing
Supabase publishing window is available for backup, application, and verification.
No production study or analysis has been changed by this phase so far.
