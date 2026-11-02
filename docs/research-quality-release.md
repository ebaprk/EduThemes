# Research quality and reusable study materials

November 2, 2026.

## Researcher workflow

- Study setup offers reflection, written interview, and baseline/follow-up templates.
  Reusable JSON templates can be downloaded and imported. They copy design and
  questions through an explicit allowlist, with fresh consent and recruitment
  setup required for each new study. They never copy submissions or participant keys.
- Codebooks include definitions, inclusion/exclusion rules, and fabricated examples.
  JSON import/export preserves these fields. Researchers can reuse a codebook from
  an accessible saved question, including the latest completed run while a new run
  is in progress. Copying definitions does not copy responses or review decisions.
  Theme edits preserve assignments when a theme is renamed. NaviGator classification
  and summary instructions receive the researcher-entered rules.
- Each completed findings run has report sections for methods, limitations, and AI
  assistance disclosure, response flags, and explicitly selected supporting quotes.
  Unresolved flags prevent sign-off. Researchers attest to the review they performed;
  the application does not infer that reading or independent coding took place.
- Owners and researchers can save and sign off; existing reviewer roles remain
  read-only. Sign-off records the actual authenticated actor and database timestamp.
  It is a researcher attestation, not institutional/IRB certification.
- Sign-off is tied to a server-computed SHA-256 hash of the actual saved run's
  labels, responses, results, and response count. A changed snapshot invalidates
  approval. Concurrent review saves use revision checking. The review panel reads
  the server's saved snapshot so it cannot approve an unseen competing analysis.
  Earlier retained runs keep their own review records.
- Coding and codebook changes, review drafts, and approvals produce append-only
  events through database functions/triggers. Browser roles cannot write the audit
  tables directly. Events store theme/decision changes and review versions, without
  duplicating raw response text. The UI displays up to 100 recent events per run.
  History begins with this release; past actions are not reconstructed.
- Research briefs include frozen study purpose and consent language, documented
  methods, saved findings, counts, selected quotes, limitations, AI disclosure,
  review status, and a codebook appendix. Briefs download as Markdown and have a
  printable preview. The study Findings report combines the runs currently shown.
  Draft or invalidated reviews are labeled as drafts. Screening data, participant
  identifiers, and private flags are excluded. Quotes and generated summary text
  still need researcher review for identifying information before sharing.

## Data and verification

Migration: `supabase/migrations/202611020003_research_quality.sql`.
Adds `study_run_reviews`, `study_quality_events`, scoped RPCs, and a coding trigger.
The private run resolver cannot be called by browser roles. Anonymous users cannot
read reviews/history or list codebooks. No participant application changes are needed.

- Researcher suite: 34 tests.
- Database suite: 55 tests, including seven new review/access/concurrency/provenance
  checks against disposable PostgreSQL.
- Backend suite: 42 tests, including codebook rule formatting.
- Production researcher build and both disposable walkthrough builds passed.
- Local browser checks: applying/saving the follow-up template and fresh consent
  readiness; codebook reuse, editing rules, and downloading preserved definitions;
  review draft saving, unresolved-flag gating, resolution, sign-off, reloading approval,
  and research-brief download/preview. The downloaded brief retained original
  published consent, selected evidence, methods, limitations, and AI disclosure.

The production migration was applied after a private backup. Exact before/after
comparison of every original field and row in 12 research tables passed. Backups
are ignored, permission-restricted files under `backend/private/`.

No production study was created or republished by this release. No new API key,
funding, email delivery, or hosting upgrade is part of this phase. The previously
documented NaviGator key expiry remains an operational follow-up before a pilot.

## Published status

Implementation commit: `967cc0a`, pushed to GitHub. The researcher Firebase site
was published successfully. The participant app remains unchanged.

Live checks confirmed review lookup, draft saving/reloading, an unresolved
uncertainty flag, and a server-recorded history event on the existing closed,
synthetic recruitment verification study. Its original response, coding, and
summary were not edited. It remains unsigned; no scientific approval is implied.
The combined downloaded report correctly marked itself as draft, included the
saved report sections, and excluded the private flag and unselected response.
The live review panel fit a measured 390px viewport without document overflow.

Backend deployment is pending: the existing Render dashboard became blank after
refresh and could not expose deployment controls. The codebook instruction update
is committed and tested, but is not yet confirmed running on Render. Existing
classification remains available with its prior definition-only instructions.
The database review/report features are already live and independently verified.
Print preview was exercised; a final exported PDF was not visually checked.
