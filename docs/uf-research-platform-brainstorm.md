# EduThemes at UF: research and participant service brainstorm

Prepared October 28, 2026. These are product proposals, informed by the current repository and public primary sources. Institutional partnerships, integrations, and approvals described below are proposed; their availability has not been established.

## Product direction

Make EduThemes the shared workspace for running qualitative and mixed-methods human-participant research at the University of Florida, from a research question through recruitment, participation, analysis, reporting, and study closeout.

Start with education, social science, communication, and campus experience studies. This builds directly on the existing product and gives UF a practical setting in which to evaluate the service before broader expansion.

The central promise: a researcher can move a study forward without losing its history, and a participant can understand and manage their involvement throughout the study.

## Current foundation

The repository documents and implements study drafts, publication and closure, open-response questions, a separate participant app, anonymous link/code submissions, researcher-reviewed AI coding, saved analysis by question, and exports. Access currently centers on the individual study owner.

The backend already connects to UF's NaviGator AI Toolkit. Canvas LTI support is implemented, but the repository's latest activation record says UF registration and a real launch remain pending. Durable study records exist, while some backend analysis files and sessions are temporary. These observations come from the [README](../README.md), [Canvas activation record](canvas-activation-status.md), study schema, and researcher/review/results components; they are not a fresh production audit.

## What to borrow from the reference products

**Claude Science:** Its documented strengths include reproducible artifacts with their code and history, connected research tools, and review of citations and calculations. Apply that pattern to qualitative evidence, coding decisions, analysis versions, and publication outputs. [Product source](https://claude.com/product/claude-science)

**Listen Labs:** Its documented workflow connects study design, recruitment, AI-moderated interviews with follow-up questions, source-linked deliverables, and reuse of previous research. Apply that continuity to UF studies and participant relationships. [Product source](https://listenlabs.ai/)

The proposals below adapt these ideas to academic methods, consent, collaboration, and UF's existing services. They are not claims that either reference product offers the proposed UF features.

## Three connected experiences

| Experience | Main job | Home screen |
| --- | --- | --- |
| Researcher workspace | Design and run a study, work with colleagues, defend findings | Studies, next actions, recruitment progress, review queue |
| Participant hub | Find opportunities and manage participation | Eligible opportunities, upcoming activities, consent documents, compensation status, results |
| Coordinator console | Support labs and departments | Study readiness, access, budgets, support requests, retention and closeout tasks |

Retain simple link-based participation. Offer a personal hub when someone wants ongoing participation; a permanent account should not become a prerequisite for every short study.

## Feature opportunities

### 1. Study design copilot

Turn a research goal into a draft study plan: research questions, population, recruitment approach, question guide, analysis approach, timeline, and budget assumptions. Link claims about prior work to sources that a researcher can inspect. Flag leading questions and places where the instrument does not address the research question.

Include reusable templates for classroom reflections, course redesign, campus service evaluations, interview studies, and longitudinal diaries. Keep established measures linked to their original wording, source, and usage conditions. The researcher approves the actual study design.

### 2. Versioned protocol and consent workspace

Keep the protocol, recruitment materials, interview guide, consent language, approval documents, and amendments together. Record which approved version each participant encountered. Provide a comparison when the guide changes and a readiness checklist configured for the study's requirements.

Generate a reviewable submission packet for myIRB, with researcher-entered status and document uploads initially. A direct connection would require separate confirmation of access and institutional support. UF already uses myIRB for study creation, revisions, approved documents, and review activities. [UF source](https://irb.ufl.edu/myirb/myirb-how-to-guidance)

### 3. UF study discovery and screening

Give participants a clear study listing: purpose, eligibility, duration, location or remote option, compensation, activities, and contact details. Allow opt-in matching by interests and eligibility information people choose to provide.

For researchers, add screeners, eligibility rules, cohort targets, waitlists, invitation batches, and a recruitment funnel. Begin with participating departments and approved listings. Explore referrals with CTSI recruitment services and ResearchMatch through their established processes. UF's CTSI already provides recruitment support and several routes for volunteers to find studies. [UF participation source](https://www.ctsi.ufl.edu/community/become-a-research-participant/), [ResearchMatch at UF](https://www.ctsi.ufl.edu/research/participant-recruitment/researchmatch/)

### 4. Participant control center

Show consent receipts, the next activity, expected time commitment, study contacts, reminder preferences, compensation progress, and an option to request withdrawal. Let participants pause future invitations and separately choose whether they can be contacted about another study.

Explain the limits of withdrawal before submission. If a study truly removes the link between a person and their response, the service may be unable to retrieve that response later. Cross-study discoverability must have its own permission rather than being inferred from participation in one study.

### 5. Flexible response collection

Extend open text with multiple choice, scales, branching, optional questions, file uploads, and save-and-resume. Support text and voice, with transcript correction, as distinct collection choices. Add accessible mobile layouts and researcher-reviewed translations.

Allow imported interviews and datasets to enter the same analysis workflow. Preserve the original response, transcript revisions, source file, question version, and recording timestamps so later interpretations can be checked.

### 6. Bounded AI interviews

Let researchers define approved topics, required questions, follow-up boundaries, stopping rules, maximum duration, and handoff contacts. The moderator can ask for clarification or an example while staying inside that guide. Record the exact questions and follow-ups that were asked.

Pilot text interviews first. Make AI involvement explicit and allow participants to skip or end the interview under the study's rules. Changes to moderator behavior should be versioned and reviewed through the applicable study process.

### 7. Longitudinal studies and diaries

Support baseline, follow-up, diary, and exit activities with study-specific participant IDs. Show researchers which activities are due, incomplete, or missed, and let participants resume the correct activity easily.

Compare themes over time and record guide changes between waves. Provide reminder schedules with participant preferences and researcher review. This opens studies of changing experiences across a semester, a program, or a campus intervention.

### 8. Scheduling and fieldwork operations

Offer appointment slots, calendar invitations, remote-session links, rescheduling, waitlist replacement, equipment or room instructions, and coordinator notes. Connect completion records to the rest of the study without placing private response content in scheduling views.

Track recruitment sources and where people leave the workflow. A coordinator can see that many eligible volunteers are failing to book a slot, then adjust available times instead of simply sending more invitations.

### 9. Collaborative coding

Add study membership and roles for principal investigators, coordinators, coders, and read-only reviewers. Support codebooks with definitions and examples, response assignments, independent coding, discussion, adjudication, and analytic memos.

Offer agreement statistics for methods that use a shared coding standard. For approaches such as reflexive thematic analysis, emphasize interpretive memos and researcher reflexivity. Method selection should shape the workflow rather than impose one standard on every study.

### 10. Evidence-linked findings

Make each finding open into its supporting response passages, contrasting evidence, code definitions, and review decisions. Let researchers ask questions such as: "What did transfer students say about advising, and what challenges that interpretation?"

Separate generated drafts from reviewed findings. Calculate counts from saved records, display the denominator, and preserve the difference between participants, responses, and theme mentions. Report unresolved classifications and limitations alongside the findings.

This is the strongest candidate for a signature feature because it extends EduThemes' existing human review workflow and improves the credibility of every output.

### 11. Reproducible analysis history

Save dataset versions, exclusions, codebook versions, model identifiers, prompts, processing settings, reviewer actions, and report versions. Allow a lab to compare two analysis approaches while preserving the original. Record changes in the underlying service or model where an exact frozen version is unavailable.

Add resumable background jobs, visible failure recovery, and durable analysis assets. A study should be recoverable when a browser closes or an analysis server restarts.

### 12. Mixed-methods analysis

Connect themes to consented participant attributes, structured survey measures, study conditions, and time points. Provide cross-tabulations and joint displays that place numerical patterns next to qualitative evidence.

Show sample sizes and missingness, with controls for small groups. Keep exploratory comparisons distinguishable from preregistered analyses. Convenience samples and observational comparisons should retain their stated limitations in exported reports.

### 13. Reports and research outputs

Generate editable findings briefs, methods drafts, codebook appendices, tables, figures, presentations, and de-identified datasets. Tie each report to the analysis version and source evidence that produced it. Include the actual AI assistance and human review performed in a draft disclosure.

Offer separate outputs for a journal manuscript, dissertation committee, campus decision-maker, and participant audience. Publication and sharing remain explicit researcher actions.

### 14. Returning results to participants

Provide an optional plain-language results page and a notification when results are available. Let participants submit questions or, where the study design calls for it, review an interview summary or contribute a member-checking response.

Keep participant feedback as an attributed part of the research record. Release only findings reviewed for that audience, and record permission separately for public quotations or media clips.

### 15. Compensation and course credit tracking

Track promised compensation, completed milestones, approved amounts, handoff status, and payment confirmation. Give coordinators reconciliation tools and participants a clear status view. Keep payment identity separate from analytic response data and collect sensitive payment details through the approved payment process.

UF already has a Research Participant Payments system in myUFL. Begin with supported exports or a documented coordinator handoff, then explore a formal integration. [UF RPP source](https://cfo.ufl.edu/directive-hub/overview-of-rpp/)

For course participation, explore completion-token handoffs to the department's SONA workflow and, once approved, Canvas. UF CJC already uses SONA for recruitment and credit allocation. Configure alternative activities and instructor visibility to fit the approved study and course arrangements. [UF SONA source](https://www.jou.ufl.edu/about-the-college/faculty-staff-resources/sona/)

### 16. Consent-aware lab knowledge library

Let labs find previous guides, codebooks, methods, approved summaries, and reusable workflow templates. A researcher could ask, "What have our last three advising studies found?" and receive references to the relevant studies.

Make reuse permissions explicit at both the study and artifact levels. Sharing a summary within a lab should not automatically expose raw responses, identities, or data from another protocol. Broader departmental discovery can begin with approved metadata and summaries.

### 17. UF data and service controls

Add study-level data classification, appropriate model selection, identity separation, access history, retention schedules, export controls, and closeout records. Configure who can access participant contacts separately from who can code responses.

UF's NaviGator model inventory distinguishes deployment locations and approved data classifications. Use a maintained allowlist appropriate to the project rather than expose every available model. UF's guidance also describes IRM approval for AI systems. A permitted model does not establish approval of EduThemes' storage, hosting, logs, or overall data flow. [NaviGator model inventory](https://docs.ai.it.ufl.edu/docs/navigator_models/), [UF agentic AI guidance](https://it.ufl.edu/ai/agentic-ai/)

### 18. Study concierge service

Pair the software with onboarding, office hours, template selection, recruitment planning, coding calibration, and a clear support contact. Provide a study setup package for graduate researchers and departments that need help getting started.

Explore partnerships with faculty methods experts, departmental research coordinators, and CTSI services. Treat institutional review and payment decisions as functions of the responsible UF offices, while EduThemes helps researchers prepare and track the work.

## Integration approach

| UF system or service | Proposed relationship | Practical starting point |
| --- | --- | --- |
| GatorLink / UF identity | Researcher and coordinator access | Confirm supported institutional sign-in and sponsorship |
| Canvas | Course entry and approved completion workflows | Finish existing LTI registration and a real launch |
| Qualtrics | Bring existing survey responses into analysis | Reviewed CSV import with stable IDs and source metadata |
| REDCap | Exchange study data where authorized | Supported export/import; confirm project-specific API permissions later |
| myIRB | Keep study materials and review status aligned | Submission packet, approval uploads, manual status |
| SONA | Recruit and reconcile course participation | Department-approved completion handoff |
| RPP / myUFL | Coordinate compensation | Supported export or coordinator handoff |
| NaviGator / research computing | Approved AI analysis and later compute workflows | Data-classification-aware model selection and usage tracking |

UF already offers [Qualtrics](https://it.ufl.edu/services/for-faculty/survey-tools/qualtrics/) and [REDCap](https://www.ctsi.ufl.edu/research/study-design-and-analysis/redcap/). Supporting studies that use those tools would make adoption easier. Direct integrations require confirmation of each system's supported interfaces and authorization.

## Suggested release sequence

### Release 1: One complete departmental pilot

Build team roles, versioned consent and guides, participant progress/resume, reliable analysis recovery, and evidence-linked findings. Add a basic operations view and a documented compensation or course-credit handoff. Complete the existing Canvas launch work when institutional registration is available.

Pilot a small number of faculty-led education or social science studies using data permitted by the approved deployment. Include at least one multi-researcher study and one participant journey with more than a single activity.

### Release 2: Recruitment and richer participation

Add departmental study discovery, screeners, scheduling, reminders, longitudinal diaries, and a bounded text-interview pilot. Support Qualtrics/REDCap imports and independent coding workflows.

Compare moderated interviews with the existing open-response approach using the same research goals and a researcher-reviewed evaluation plan. Assess response depth, bias, burden, completion, and analytic usefulness.

### Release 3: A shared UF research service

Expand to more departments with coordinator tools, reusable templates, budget reporting, consent-aware research reuse, participant results pages, and formal integrations where approved. Add deeper statistical and compute workflows as participating labs demonstrate a need.

Clinical and other especially sensitive workflows become a separate expansion with the relevant UF partners, deployment requirements, and study-specific review.

## A concrete flagship experience

A UF researcher studies first-generation students' advising experiences. EduThemes helps draft the plan and guide, keeps the approved materials together, and accepts responses from an approved recruitment route. Participants review consent, choose text or an approved interview format, resume later, and see what remains to complete.

Two researchers review the coding. A finding about scheduling barriers links to the supporting passages, exceptions, and review history. The team exports an editable report, hands compensation or credit completion to the approved process, and releases a plain-language summary to participants who requested it.

That experience would demonstrate the entire service in a form close to EduThemes' current strengths.

## Measures of success

- Researcher time from approved materials to launch, and from collected responses to reviewed findings.
- Participant completion, time spent, accessibility problems, missed follow-ups, and satisfaction.
- Recruitment conversion and cost per completed eligible participant, reported by source with clear denominators.
- Time from completed activity to compensation or credit confirmation.
- Accuracy of sampled evidence links and numerical summaries; researcher corrections to AI drafts.
- Reproducibility and recovery of saved analyses; unresolved access or retention issues.
- Labs returning for a second study and their support burden.

Set improvement targets after measuring the current workflow. The first pilot should establish whether these features save effort while preserving participant experience and methodological quality.
