import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { studyLink } from '../appUrls';
import { supabase, supabaseConfigured } from '../supabase';
import { participantDetails, submissionsToCsv } from '../utils/participantData';
import StudyForm from './StudyForm';
import StudyTeam from './StudyTeam';
import StudyEvidence from './StudyEvidence';
import StudyOperations from './StudyOperations';
import StudySectionNav from './StudySectionNav';
import ResearchDashboard, { StudyStatus } from './ResearchDashboard';
import { LuArrowRight, LuCheck, LuFlaskConical, LuLogOut, LuMessageSquare, LuShieldCheck, LuSparkles } from 'react-icons/lu';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import './Studies.css';

function AuthForm({ onAuthenticated }) {
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = mode === 'sign-up'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else if (data.session) onAuthenticated(data.user);
      else setMessage('Check your email to confirm your account, then sign in.');
    } catch (failure) { setMessage(failure.message || 'We could not connect. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="auth-layout">
      <section className="auth-story" aria-labelledby="auth-story-title"><span className="page-eyebrow"><span aria-hidden="true" />BUILT FOR CURIOUS MINDS</span><h2 id="auth-story-title">Every response<br />has a story.<br /><span>Find the themes.</span></h2><p>Bring your questions, your participants, and your team together. Turn what you hear into what you understand.</p><div className="auth-research-visual" aria-hidden="true"><div className="research-visual-header"><span><LuFlaskConical />The discovery process</span><span className="visual-dots">•••</span></div><div className="research-visual-response"><span className="visual-avatar">01</span><div><span>A question worth asking</span><p>What helps students feel they belong?</p></div><LuMessageSquare /></div><div className="research-visual-connector" /><div className="research-visual-themes"><span><LuSparkles />Room for discovery</span><div><span>Connection</span><span>Confidence</span><span>Support</span></div></div><div className="research-visual-footer"><LuCheck /><span>Human insight, with a little help.</span></div></div><div className="auth-principles"><span><LuShieldCheck aria-hidden="true" />Consent comes first</span><span><LuCheck aria-hidden="true" />You guide the analysis</span></div></section>
      <section className="auth-form-area"><div className="auth-form-container"><span className="auth-form-icon"><LuFlaskConical aria-hidden="true" /></span><span className="page-eyebrow">YOUR RESEARCH WORKSPACE</span><h1>{mode === 'sign-in' ? 'Welcome back' : 'A fresh start for your research'}</h1><p>{mode === 'sign-in' ? 'Sign in to pick up your next discovery.' : 'Create an account to bring your questions to life.'}</p>
      <form className="auth-form" onSubmit={submit}>
        <div className="study-field"><label htmlFor="researcher-email">Email address</label><input id="researcher-email" type="email" autoComplete="email" placeholder="you@university.edu" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></div>
        <div className="study-field"><label htmlFor="researcher-password">Password</label><input id="researcher-password" type="password" minLength={6} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder={mode === 'sign-in' ? 'Enter your password' : 'At least 6 characters'} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></div>
        {message && <p className={message.startsWith('Check') ? 'study-note' : 'study-error'} role="status">{message}</p>}
        <button className="study-primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? <><Skeleton className="edu-skeleton--button" />{mode === 'sign-in' ? 'Signing in…' : 'Creating account…'}</> : <>{mode === 'sign-in' ? 'Sign in' : 'Create account'}<LuArrowRight aria-hidden="true" /></>}</button>
        <p className="auth-switch">{mode === 'sign-in' ? 'New to EduThemes?' : 'Already have an account?'} <button className="study-text-button" type="button" disabled={busy} onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); }}>{mode === 'sign-in' ? 'Create an account' : 'Sign in'}</button></p>
      </form><div className="auth-form-footnote"><LuShieldCheck aria-hidden="true" /><p>A dedicated space for your studies,<br />your team, and your next insight.</p></div></div><span className="auth-page-footer">Made for thoughtful educational research.</span></section>
    </main>
  );
}

export default function Researcher({ onAnalyze, hasActiveAnalysis, onResumeAnalysis }) {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [studies, setStudies] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [study, setStudy] = useState(null);
  const [draftQuestions, setDraftQuestions] = useState([]);
  const [versions, setVersions] = useState([]);
  const [view, setView] = useState('draft');
  const [submissions, setSubmissions] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [members, setMembers] = useState([]);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadedKey, setLoadedKey] = useState(null);
  const [startingQuestionId, setStartingQuestionId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingSection, setEditingSection] = useState('design');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const loadGeneration = useRef(0);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return undefined; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setUser((current) => current?.id === data.session?.user?.id && current?.email === data.session?.user?.email ? current : data.session?.user || null); setAuthLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser((current) => current?.id === session?.user?.id && current?.email === session?.user?.email ? current : session?.user || null);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const load = useCallback(async () => {
    if (!user || !supabase) return;
    const generation = ++loadGeneration.current;
    setLoading(true); setError(''); setLoadError('');
    try {
      if (!studyId) {
        const [list, pending] = await Promise.all([
          supabase.from('studies').select('id,title,status,share_code,created_at,owner_id').order('created_at', { ascending: false }),
          supabase.rpc('pending_study_invitations'),
        ]);
        if (generation !== loadGeneration.current) return;
        if (list.error || pending.error) throw list.error || pending.error;
        setStudies(list.data || []); setInvitations(pending.data || []);
      } else {
        const results = await Promise.all([
          supabase.from('studies').select('*').eq('id', studyId).single(),
          supabase.from('study_questions').select('*').eq('study_id', studyId).order('position'),
          supabase.from('study_submissions').select('*').eq('study_id', studyId).order('created_at'),
          supabase.from('study_analyses').select('*').eq('study_id', studyId),
          supabase.from('study_versions').select('*').eq('study_id', studyId).order('version_number', { ascending: false }),
          supabase.from('study_members').select('*').eq('study_id', studyId).order('created_at'),
          supabase.rpc('study_role', { p_study_id: studyId }),
        ]);
        if (generation !== loadGeneration.current) return;
        const failed = results.find((result) => result.error);
        if (failed) throw failed.error;
        const [s, q, r, a, v, m, access] = results.map((result) => result.data);
        setStudy(s); setDraftQuestions(q || []); setSubmissions(r || []); setAnalyses(a || []);
        setVersions(v || []); setMembers(m || []); setRole(access);
        setView(s.status === 'draft' ? 'draft' : s.current_version_id); setEditing(false);
      }
    } catch (failure) { if (generation === loadGeneration.current) { setError(failure.message || 'The study could not be loaded.'); setLoadError(failure.message || 'The study could not be loaded.'); setStudy(null); setRole(null); } }
    finally { if (generation === loadGeneration.current) { setLoadedKey(`${user.id}:${studyId || 'list'}`); setLoading(false); } }
  }, [user, studyId]);
  useEffect(() => { setStudy(null); setRole(null); setStudies([]); setInvitations([]); setCreating(false); setEditing(false); load(); return () => { loadGeneration.current += 1; }; }, [load]);

  const saveDraft = async (form) => {
    setSaving(true); setError('');
    try {
      const { data, error: saveError } = await supabase.rpc('save_study_draft', {
        p_study_id: creating ? null : study.id, p_form: form,
        p_expected_revision: creating ? 0 : study.draft_revision,
      });
      if (saveError) throw saveError;
      setCreating(false); setEditing(false);
      if (studyId === data) await load(); else navigate(`/studies/${data}`);
    } catch (failure) { setError(failure.message || 'The draft could not be saved.'); }
    finally { setSaving(false); }
  };
  const setStatus = async (status) => {
    setSaving(true); setUpdatingStatus(true); setError('');
    try {
      const { data, error: statusError } = await supabase.from('studies').update({ status }).eq('id', study.id).select('id');
      if (statusError) throw statusError;
      if (!data?.length) throw new Error('Only the study owner can change publication status.');
      setNotice(status === 'draft' ? 'A new draft is ready. The participant link is paused until you publish it. Earlier versions and responses are preserved.' : status === 'open' ? 'The study is open to participants.' : 'The study is closed to new responses.');
      await load();
    } catch (failure) { setError(failure.message || 'The study status could not be changed.'); }
    finally { setSaving(false); setUpdatingStatus(false); }
  };
  const acceptInvitation = async (invitation) => {
    setSaving(true); setError('');
    try {
      const { data, error: acceptError } = await supabase.rpc('accept_study_invitation', { p_invitation_id: invitation.id });
      if (acceptError) throw acceptError;
      navigate(`/studies/${data}`);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(studyLink(study.share_code)); setNotice('Study link copied.'); }
    catch { setError('Copy the study link shown below.'); }
  };
  const download = (content, type, name) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  };
  const selectedVersion = versions.find((version) => version.id === view);
  const questions = selectedVersion?.questions || (view === 'draft' ? draftQuestions : []);
  const responses = selectedVersion ? submissions.filter((submission) => submission.study_version_id === selectedVersion.id) : [];
  const versionAnalyses = selectedVersion ? analyses.filter((analysis) => analysis.study_version_id === selectedVersion.id) : [];
  const canEdit = role === 'owner' || role === 'researcher';
  const launchAnalysis = async (question, analysis = null) => {
    if (!canEdit || !selectedVersion) return;
    setError(''); setSaving(true); setStartingQuestionId(question.id);
    try {
      const previous = versionAnalyses.find((entry) => entry.question_id === question.id);
      await onAnalyze({ ...study, ...selectedVersion, id: study.id, owner_id: study.owner_id, current_version_id: selectedVersion.id }, question, responses, analysis, previous?.revision || 0);
    } catch (failure) { setError(failure.message || 'Could not start coding.'); }
    finally { setSaving(false); setStartingQuestionId(null); }
  };
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      navigate('/');
    } catch (failure) { setError(failure.message || 'Could not sign out. Please try again.'); }
    finally { setSigningOut(false); }
  };

  if (!supabaseConfigured) return <main className="study-shell"><h1>Connect Supabase to EduThemes</h1><p>Follow the setup steps in the README to connect the workspace.</p></main>;
  if (authLoading) return <main className="study-shell"><LoadingSkeleton variant={studyId ? 'study' : 'workspace'} label="Loading researcher workspace…" /></main>;
  if (!user) return <AuthForm onAuthenticated={setUser} />;
  const loadingData = loading || loadedKey !== `${user.id}:${studyId || 'list'}`;

  return <main className="study-shell researcher-shell">
    <div className="study-topbar"><span className="study-eyebrow">{studyId ? 'STUDY WORKSPACE' : 'WORKSPACE OVERVIEW'}</span><button type="button" className="study-text-button sign-out-button" onClick={signOut} disabled={signingOut} aria-busy={signingOut}>{signingOut ? <><Skeleton className="edu-skeleton--button" />Signing out…</> : <><LuLogOut aria-hidden="true" />Sign out</>}</button></div>
    {error && <p className="study-error" role="alert">{error}</p>}{notice && <p className="study-note" role="status">{notice}</p>}
    {(saving || (loadingData && studyId && study?.id === studyId)) && <LoadingSkeleton variant="inline" label={startingQuestionId ? 'Preparing coding workspace…' : saving ? 'Saving study changes…' : 'Refreshing study…'} />}
    {!studyId ? <>
      <ResearchDashboard studies={studies} user={user} loading={loadingData} error={loadError} onCreate={() => setCreating(true)} onRetry={load} creating={creating} invitations={invitations} saving={saving} onAcceptInvitation={acceptInvitation} hasActiveAnalysis={hasActiveAnalysis} onResumeAnalysis={onResumeAnalysis}>
      {creating && <StudyForm onSave={saveDraft} onCancel={() => setCreating(false)} saving={saving} />}
      </ResearchDashboard>
    </> : <>
      <Link className="study-back" to="/">← All studies</Link>
      {loadingData && study?.id !== studyId ? <LoadingSkeleton variant="study" label="Loading study…" /> : study ? <>
        <div className="study-hero"><div><StudyStatus status={study.status} /><h1>{study.title}</h1><p>{study.research_question}</p></div>
          {role === 'owner' && <div className="study-actions">{study.status === 'draft' ? <button className="study-primary" disabled={saving || !study.consent_text.trim() || study.participant_mode === 'optional_canvas'} aria-busy={updatingStatus} onClick={() => setStatus('open')}>{updatingStatus ? <><Skeleton className="edu-skeleton--button" />Publishing…</> : <>Publish {versions.length ? 'new version' : 'study'}</>}</button> : <>
            <button className="study-secondary" disabled={saving} aria-busy={updatingStatus} onClick={() => setStatus(study.status === 'open' ? 'closed' : 'open')}>{updatingStatus ? <><Skeleton className="edu-skeleton--button" />Updating study…</> : study.status === 'open' ? 'Close study' : 'Reopen study'}</button>
            {study.status === 'closed' && <button className="study-primary" disabled={saving} aria-busy={updatingStatus} onClick={() => setStatus('draft')}>{updatingStatus ? <><Skeleton className="edu-skeleton--button" />Preparing draft…</> : 'Create next version'}</button>}
          </>}</div>}
        </div>
        {role === 'reviewer' && <p className="study-note">You have read-only access to this study.</p>}
        <StudySectionNav hasResponses={Boolean(selectedVersion)} responseCount={responses.length} teamCount={members.filter((member) => member.accepted_at).length + 1} />
        <div id="study-overview"><StudyOperations study={study} role={role} /></div>
        {study.status === 'draft' && <>
          {!study.consent_text.trim() && <p className="study-note">Add participant consent text before publishing this draft.</p>}
          {editing ? <StudyForm key={`${study.id}-${study.draft_revision}`} initialSection={editingSection} initial={{ ...study, questions: draftQuestions.map((question) => question.prompt) }} onSave={saveDraft} onCancel={() => setEditing(false)} saving={saving} /> : <section className="study-panel study-inline"><div><h2>Draft questions</h2><ol>{draftQuestions.map((question) => <li key={question.id}>{question.prompt}</li>)}</ol></div>{canEdit && <button className="study-secondary" onClick={() => { setEditingSection('design'); setEditing(true); }}>Edit draft</button>}</section>}
        </>}
        <div className={`study-detail-grid${selectedVersion ? '' : ' is-draft'}`}><aside id="study-participation" className="study-context" aria-label="Study information">
        {study.status === 'draft' && <section className="study-panel"><span className="study-eyebrow">CURRENT DRAFT</span><h2>Participation</h2><p>{study.participant_mode === 'anonymous' ? 'Anonymous responses' : study.participant_mode === 'canvas' ? 'Identified through Canvas' : 'Choose a participant identity mode before publishing.'}</p><p>{study.consent_text.trim() ? 'Consent text is ready for your review.' : 'Add consent text before you publish your study.'}</p>{study.consent_text.trim() && <details><summary>Review draft consent</summary><p className="study-consent-copy">{study.consent_text}</p></details>}{canEdit && <button type="button" className="study-secondary" disabled={saving || editing} onClick={() => { setEditingSection('participation'); setEditing(true); }}>Edit participation</button>}</section>}
        {study.status !== 'draft' && <section className="study-panel share-panel"><div><h2>Participant link</h2><p>This link opens the latest published version when the study is open.</p><code>{studyLink(study.share_code)}</code><p className="study-code">Code: {study.share_code}</p></div><button className="study-secondary" onClick={copyLink}>Copy link</button></section>}
        {versions.length > 0 && <section className="study-panel study-history"><div className="study-field"><label htmlFor="study-version">Study history</label><select id="study-version" value={view || ''} onChange={(event) => setView(event.target.value)}>
          {study.status === 'draft' && <option value="draft">Current draft</option>}{versions.map((version) => <option value={version.id} key={version.id}>Version {version.version_number}{version.id === study.current_version_id ? ' · latest published' : ''} · {new Date(version.published_at).toLocaleDateString()}</option>)}
        </select></div>{selectedVersion && <><p>Viewing version {selectedVersion.version_number} · {selectedVersion.activities?.length > 1 ? 'Responses linked by private study code' : selectedVersion.participant_mode === 'anonymous' ? 'Anonymous responses' : selectedVersion.participant_mode === 'canvas' ? 'Canvas-identified responses' : 'Anonymous or Canvas responses (legacy)'}</p><details><summary>View published questions and consent</summary>{selectedVersion.activities?.length ? selectedVersion.activities.map((activity) => <div className="study-published-activity" key={activity.id}><h3>{activity.title}</h3>{selectedVersion.activities.length > 1 && <p className="study-help">{activity.required ? 'Required' : 'Optional'} · Opens on day {activity.opens_after_days}{activity.due_after_days != null ? ` · Due on day ${activity.due_after_days}` : ''} after joining</p>}{activity.instructions && <p>{activity.instructions}</p>}<ol>{activity.questions.map((question) => <li key={question.id}>{question.prompt}</li>)}</ol></div>) : <ol>{selectedVersion.questions.map((question) => <li key={question.id}>{question.prompt}</li>)}</ol>}<h3>Participant consent</h3><p className="study-consent-copy">{selectedVersion.consent_required ? selectedVersion.consent_text : 'No research consent text was recorded for this version. It was published before consent tracking was introduced.'}</p>{selectedVersion.compensation_details && <><h3>Compensation or course credit</h3><p>{selectedVersion.compensation_details}</p></>}{selectedVersion.contact_info && <><h3>Study contact</h3><p>{selectedVersion.contact_info}</p></>}</details></>}</section>}
        </aside>
        {selectedVersion && <section id="study-responses" className="study-responses"><div className="study-section-heading"><div><h2>Questions and responses</h2><p>{responses.length} {responses.length === 1 ? 'submission' : 'submissions'} · Version {selectedVersion.version_number}</p></div><div className="study-actions"><button type="button" className="study-secondary" aria-label="Download responses and consent records" disabled={!responses.length} onClick={() => download(submissionsToCsv(responses, questions), 'text/csv;charset=utf-8', `eduthemes-${study.share_code}-v${selectedVersion.version_number}-responses.csv`)}>Download responses</button><button type="button" className="study-text-button" disabled={loading} onClick={load}>Refresh</button></div></div>
          {questions.map((question) => {
            const answers = responses.filter((submission) => Boolean(submission.answers?.[question.id]?.trim()));
            const analysis = versionAnalyses.find((entry) => entry.question_id === question.id);
            const activity = selectedVersion.activities?.find((item) => item.questions.some((entry) => entry.id === question.id));
            return <article className="study-panel study-question-card" key={question.id}>
              <div className="study-question-top"><span>{activity && selectedVersion.activities.length > 1 ? `${activity.title} · ` : ''}Question {question.position + 1}</span><span>{answers.length} {answers.length === 1 ? 'response' : 'responses'}</span></div><h3>{question.prompt}</h3>
              {startingQuestionId === question.id && <LoadingSkeleton label="Preparing responses for coding…" rows={4} />}
              {analysis && <p className="study-note">{analysis.stage === 'results' ? 'Findings saved' : 'Coding in progress'} · {analysis.response_count} responses in saved analysis{answers.length > analysis.response_count ? ` · ${answers.length - analysis.response_count} new since then` : ''}</p>}
              {canEdit && <div className="study-actions">{analysis && analysis.stage !== 'results' && <button className="study-primary" disabled={saving} aria-busy={startingQuestionId === question.id} onClick={() => launchAnalysis(question, analysis)}>{startingQuestionId === question.id ? <><Skeleton className="edu-skeleton--button" />Preparing coding…</> : 'Resume coding'}</button>}{answers.length > 0 && <button className={analysis ? 'study-secondary' : 'study-primary'} disabled={saving} aria-busy={startingQuestionId === question.id} onClick={() => launchAnalysis(question)}>{startingQuestionId === question.id ? <><Skeleton className="edu-skeleton--button" />Preparing coding…</> : analysis ? 'Analyze current responses' : 'Start coding'}</button>}</div>}
              {answers.length > 0 && <details className="study-answer-list"><summary>View collected responses</summary><ol>{answers.map((submission) => <li key={submission.id} id={`response-${submission.id}`}><p>{submission.answers[question.id]}</p><small>{submission.consent_accepted_at ? `Consent accepted ${new Date(submission.consent_accepted_at).toLocaleString()}` : 'Legacy submission · no recorded research consent'}</small>{submission.participant_data?.source === 'canvas' ? <details><summary>Canvas participant details{submission.participant_data.name ? ` · ${submission.participant_data.name}` : ''}</summary><dl>{participantDetails(submission.participant_data).map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl></details> : <small>{submission.enrollment_id ? 'Study-code participant · activities linked' : 'Anonymous participant'}</small>}</li>)}</ol></details>}
              {analysis?.stage === 'results' && <div className="study-findings"><h4>Saved findings</h4><p>{analysis.results?.summary || 'No summary saved.'}</p><ul>{(analysis.results?.themes || []).map((theme) => <li key={theme.name}>{theme.name}: {theme.frequency}</li>)}</ul><StudyEvidence analysis={analysis} responses={responses} questionId={question.id} /><button type="button" className="study-text-button" onClick={() => download(JSON.stringify({ study: study.title, question: question.prompt, version: selectedVersion, ...analysis }, null, 2), 'application/json', `eduthemes-${study.share_code}-v${selectedVersion.version_number}-question-${question.position + 1}.json`)}>Download coded results</button></div>}
            </article>;
          })}
        </section>}
        </div>
        <div id="study-team"><StudyTeam study={study} members={members} role={role} onChanged={load} onError={setError} onNotice={setNotice} /></div>
      </> : !loadingData && <section className="study-panel"><h1>Study unavailable</h1><p>Check that you have accepted your invitation and still have access to this study.</p></section>}
    </>}
  </main>;
}
