# EduThemes — UF Canvas LTI review request draft

This draft supplies the technical details for the faculty sponsor's request.
It has not been submitted to UF and does not represent institutional approval.

## Request

I am working under Professor Ashish Aggarwal on the EduThemes research project.
Please review EduThemes for an LTI 1.3 integration with UF Canvas. EduThemes
allows researchers to publish open-response studies, collect participant
responses, and conduct researcher-reviewed thematic analysis. The requested
Canvas integration lets participants launch EduThemes from an approved course
and include Canvas-supplied participant information with their study answers.

Participants see the supplied information and explicitly confirm sharing it
for each study. Only the researcher who owns the study can read the collected
answers and participant details. Researchers can download a CSV containing
their study's responses and participant information.

## Technical registration

| Setting | Value |
| --- | --- |
| Tool | EduThemes |
| LTI version | 1.3 |
| Configuration JSON | https://eduthemes-api.onrender.com/lti/config |
| OIDC initiation | https://eduthemes-api.onrender.com/lti/login |
| Redirect and target URI | https://eduthemes-api.onrender.com/lti/launch |
| Public signing keys | https://eduthemes-api.onrender.com/lti/jwks |
| Participant app | https://eduthemes-participant-abepark.web.app |
| Researcher app | https://eduthemes-abepark.web.app |
| Placement | Course Navigation, disabled by default, open in a new window |
| Message | LtiResourceLinkRequest |
| Canvas API / Advantage scopes | None |

After approval and installation, please provide the exact issuer, client ID,
and deployment ID so the backend can allow only the approved UF deployment.
The app is configured to reject Canvas launches until this registration is set.

## Data requested

Standard launch fields, when released by UF, include participant name, email,
language, course context, course name/code, roles, and LTI identity identifiers.
The configuration also requests the Canvas user ID and course ID through Canvas
variable substitutions. EduThemes stores only a bounded allowlist of verified
fields with the submitted answers; it does not store the original Canvas ID token.

The faculty sponsor would also like academic year where available. Please advise
whether UF can supply a participant-specific `academic_year` custom claim through
an approved source. It is not inferred from courses, names, or student IDs.
`major` can also be supported if UF approves supplying that field. EduThemes
requests no roster, grades, transcript, age, ZIP code, or other demographics.

## Hosting and controls

The frontend apps use Firebase Hosting. The backend uses Render, and study data
uses Supabase PostgreSQL with row-level access controls. The present deployment
uses free hosting tiers; Render may sleep during inactivity. UF should assess
these providers, hosting arrangements, and availability requirements as part of
its review. This request does not assert that the current hosting is approved by UF.

The backend checks Canvas signatures against configured platform public keys,
as well as the registered issuer, audience, deployment, token times, nonce,
browser-bound single-use login state, resource link, and launch target.
Participant sessions expire after two hours. Expired sessions fail visibly, and
participants can disconnect Canvas to participate without Canvas details.

The thematic analysis workflow sends response text to the configured UF
NaviGator AI service. Canvas participant metadata is excluded from that analysis
input. Researcher-controlled downloads may contain participant information.

Study data currently remains until its study is deleted. A required study
retention schedule, withdrawal process, research permissions, and any IRB
requirements must be confirmed by the faculty sponsor and UF before collection.

## Faculty sponsor details still needed

- Sponsor's UF email, department, and responsible support contact (Professor
  Ashish Aggarwal is the supervisor identified for this research project).
- Intended course(s), term, participant population, and estimated number of users.
- Intended use (course feedback, research, or both) and research/IRB status where applicable.
- Retention and deletion requirements, and approved participant notice/consent language.
- Whether name/email is necessary for the proposed studies and which optional fields UF permits.

Official entry point: [UF Learning Tool Integration Requests](https://it.ufl.edu/services/385).
The faculty sponsor should review these facts and supply the missing institutional
details before the request is submitted.
