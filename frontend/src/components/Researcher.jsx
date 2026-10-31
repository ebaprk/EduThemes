import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { studyLink } from '../appUrls';
import { supabase, supabaseConfigured } from '../supabase';
import { participantDetails, submissionsToCsv } from '../utils/participantData';
import StudyForm from './StudyForm';
import StudyWorkspace from './StudyWorkspace';
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

  const [recovering, setRecovering] = useState(false);
  const recover = async () => {
    if (!email.includes('@')) { setMessage('Enter your email address first.'); return; }
    setRecovering(true); setMessage('');
    try { const {error} = await supabase.auth.resetPasswordForEmail(email, {redirectTo:`${window.location.origin}/reset-password`}); if(error) throw error; setMessage('Check your email for a password recovery link.'); }
    catch(error) {setMessage(error.message || 'Could not send recovery link.');} finally {setRecovering(false);}
  };

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
      <section className="auth-form-area"><div className="auth-form-container"><h1>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h1>
      <form className="auth-form" onSubmit={submit}>
        <div className="study-field"><label htmlFor="researcher-email">Email address</label><input id="researcher-email" type="email" autoComplete="email" placeholder="you@university.edu" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></div>
        <div className="study-field"><label htmlFor="researcher-password">Password</label><input id="researcher-password" type="password" minLength={6} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} placeholder={mode === 'sign-in' ? 'Enter your password' : 'At least 6 characters'} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></div>
        {message && <p className={message.startsWith('Check') ? 'study-note' : 'study-error'} role="status">{message}</p>}
        <button className="study-primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? <><Skeleton className="edu-skeleton--button" />{mode === 'sign-in' ? 'Signing in…' : 'Creating account…'}</> : <>{mode === 'sign-in' ? 'Sign in' : 'Create account'}<LuArrowRight aria-hidden="true" /></>}</button>
        {mode === 'sign-in' && <button type="button" className="study-text-button" disabled={busy || recovering} aria-busy={recovering} onClick={recover}>{recovering ? <><Skeleton className="edu-skeleton--button" /> Sending recovery link…</> : 'Forgot password?'}</button>}
        <p className="auth-switch">{mode === 'sign-in' ? 'New to EduThemes?' : 'Already have an account?'} <button className="study-text-button" type="button" disabled={busy} onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); }}>{mode === 'sign-in' ? 'Create an account' : 'Sign in'}</button></p>
      </form></div></section>
    </main>
  );
}

export default function Researcher({ onAnalyze, hasActiveAnalysis, onResumeAnalysis }) {
  const { studyId } = useParams();
  const location = useLocation();
  const isNew = location.pathname === '/studies/new';
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
        const [responseSummary, analysisSummary] = await Promise.all([
          supabase.from('study_submissions').select('study_id,created_at'),
          supabase.from('study_analyses').select('study_id,study_version_id,question_id,stage,updated_at')]);
        if (generation !== loadGeneration.current) return;
        setStudies((list.data || []).map(item => { const entries=(responseSummary.data || []).filter(r=>r.study_id===item.id); const progress=(analysisSummary.data || []).filter(a=>a.study_id===item.id); return {...item, resume:progress.find(a=>a.stage!=='results'), progress_available:!responseSummary.error&&!analysisSummary.error, response_count:entries.length, pending_count:progress.filter(a=>a.stage!=='results').length, findings_count:progress.filter(a=>a.stage==='results').length, updated_at:[item.created_at,...entries.map(r=>r.created_at),...progress.map(a=>a.updated_at)].filter(Boolean).sort().at(-1)}; })); setInvitations(pending.data || []);
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
        if (failed) { if (results[0].error || !results[0].data || results[6].error || !results[6].data) { setStudy(null); setRole(null); } throw failed.error; }
        const [s, q, r, a, v, m, access] = results.map((result) => result.data);
        setStudy(s); setDraftQuestions(q || []); setSubmissions(r || []); setAnalyses(a || []);
        setVersions(v || []); setMembers(m || []); setRole(access);
        setView(current => { const requested = new URLSearchParams(window.location.search).get('version'); return requested || (v?.some(version => version.id === current) ? current : s.status === 'draft' ? 'draft' : s.current_version_id); });
      }
    } catch (failure) { if (generation === loadGeneration.current) { setError(failure.message || 'The study could not be loaded.'); setLoadError(failure.message || 'The study could not be loaded.'); if (failure.status === 401 || failure.status === 403) { setStudy(null); setRole(null); } } }
    finally { if (generation === loadGeneration.current) { setLoadedKey(`${user.id}:${studyId || 'list'}`); setLoading(false); } }
  }, [user, studyId]);
  useEffect(() => { setStudy(null); setRole(null); setStudies([]); setInvitations([]); setCreating(false); setEditing(false); load(); return () => { loadGeneration.current += 1; }; }, [load]);

  const saveDraft = async (form) => {
    setSaving(true); setError('');
    try {
      const { data, error: saveError } = await supabase.rpc('save_study_draft', {
        p_study_id: isNew ? null : study.id, p_form: form,
        p_expected_revision: isNew ? 0 : study.draft_revision,
      });
      if (saveError) throw saveError;
      setCreating(false); setEditing(false);
      if (studyId === data) await load();
      setNotice('Draft saved.'); navigate(`/studies/${data}?section=overview`);
    return true;
    } catch (failure) { setError(failure.message || 'The draft could not be saved.'); return false; }
    finally { setSaving(false); }
  };
  const setStatus = async (status) => {
    setSaving(true); setUpdatingStatus(true); setError('');
    try {
      const { data, error: statusError } = await supabase.from('studies').update({ status }).eq('id', study.id).select('id');
      if (statusError) throw statusError;
      if (!data?.length) throw new Error('Only the study owner can change publication status.');
      setNotice(status === 'draft' ? 'A new draft is ready. The participant link is paused until you publish it. Earlier versions and responses are preserved.' : status === 'open' ? 'The study is open to participants.' : 'The study is closed to new responses.');
      await load(); if (status === 'draft') setView('draft');
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
      await onAnalyze({ ...study, ...selectedVersion, id: study.id, owner_id: study.owner_id, current_version_id: selectedVersion.id }, question, Object.assign([...responses], { savedAnalysis: previous }), analysis, previous?.revision || 0);
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
    <div className="study-topbar"><span className="study-eyebrow">{''}</span><button type="button" className="study-text-button sign-out-button" onClick={signOut} disabled={signingOut} aria-busy={signingOut}>{signingOut ? <><Skeleton className="edu-skeleton--button" />Signing out…</> : <><LuLogOut aria-hidden="true" />Sign out</>}</button></div>
    {error && <p className="study-error" role="alert">{error}</p>}{notice && <p className="study-note" role="status">{notice}</p>}
    {(saving || (loadingData && studyId && study?.id === studyId)) && <LoadingSkeleton variant="inline" label={startingQuestionId ? 'Preparing coding workspace…' : saving ? 'Saving study changes…' : 'Refreshing study…'} />}
    {!studyId ? <>
      <ResearchDashboard studies={studies} user={user} loading={loadingData} error={loadError} onCreate={() => navigate('/studies/new')} onRetry={load} creating={isNew} invitations={invitations} saving={saving} onAcceptInvitation={acceptInvitation} hasActiveAnalysis={hasActiveAnalysis} onResumeAnalysis={onResumeAnalysis}>
      {isNew && <StudyForm draftKey={`${user.id}:new`} onSave={saveDraft} onCancel={() => navigate('/')} saving={saving} />}
      </ResearchDashboard>
    </> : <>
      {loadingData && study?.id !== studyId ? <LoadingSkeleton variant="study" label="Loading study…" /> : study ? <StudyWorkspace study={study} user={user} versions={versions} view={view} setView={setView} questions={questions} responses={responses} analyses={versionAnalyses} members={members} role={role} saving={saving} startingQuestionId={startingQuestionId} saveDraft={saveDraft} setStatus={setStatus} copyLink={copyLink} load={load} setError={setError} setNotice={setNotice} launchAnalysis={launchAnalysis} /> : !loadingData && <p role="alert">Study unavailable. Check your access and try again.</p>}
    </>}
  </main>;
}
