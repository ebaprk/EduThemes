import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { studyLink, supabase, supabaseConfigured } from '../supabase';
import './Studies.css';

const emptyForm = { title: '', description: '', research_question: '', additional_context: '', questions: [''] };

function StudyForm({ initial = emptyForm, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initial, questions: initial.questions?.length ? initial.questions : [''] }));
  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const updateQuestion = (index, value) => setField('questions', form.questions.map((question, position) => position === index ? value : question));
  const submit = (event) => {
    event.preventDefault();
    onSave({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      research_question: form.research_question.trim(),
      additional_context: form.additional_context.trim(),
      questions: form.questions.map((question) => question.trim()),
    });
  };

  return (
    <form className="study-panel study-editor" onSubmit={submit}>
      <div className="study-field"><label htmlFor="study-title">Study title</label><input id="study-title" value={form.title} onChange={(event) => setField('title', event.target.value)} maxLength={160} required placeholder="e.g. How students learn with AI" /></div>
      <div className="study-field"><label htmlFor="study-description">Participant introduction</label><textarea id="study-description" value={form.description} onChange={(event) => setField('description', event.target.value)} rows={3} placeholder="Explain the study and what participants will do." /></div>
      <div className="study-field"><label htmlFor="research-question">Research question</label><input id="research-question" value={form.research_question} onChange={(event) => setField('research_question', event.target.value)} maxLength={500} required placeholder="What are you trying to understand?" /></div>
      <div className="study-field"><label htmlFor="additional-context">Analysis context <span>(optional)</span></label><textarea id="additional-context" value={form.additional_context} onChange={(event) => setField('additional_context', event.target.value)} rows={3} placeholder="Context for theme suggestions" /></div>
      <div className="study-question-heading"><h3>Open response questions</h3><span>{form.questions.length} of 12</span></div>
      {form.questions.map((question, index) => (
        <div className="study-question-row" key={index}>
          <label htmlFor={`question-${index}`}>Question {index + 1}</label>
          <textarea id={`question-${index}`} value={question} onChange={(event) => updateQuestion(index, event.target.value)} rows={2} maxLength={1000} required placeholder="Ask an open ended question" />
          {form.questions.length > 1 && <button type="button" className="study-text-button" onClick={() => setField('questions', form.questions.filter((_, position) => position !== index))}>Remove</button>}
        </div>
      ))}
      {form.questions.length < 12 && <button type="button" className="study-secondary" onClick={() => setField('questions', [...form.questions, ''])}>+ Add question</button>}
      <div className="study-actions"><button type="submit" className="study-primary" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</button><button type="button" className="study-text-button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

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
    const { data, error } = mode === 'sign-up'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (data.session) onAuthenticated(data.user);
    else setMessage('Check your email to confirm your account, then sign in.');
  };

  return (
    <main className="study-shell auth-shell">
      <span className="study-eyebrow">Researcher workspace</span>
      <h1>{mode === 'sign-in' ? 'Welcome back' : 'Create a researcher account'}</h1>
      <p>Build studies, collect participant responses, and code what you learn.</p>
      <form className="study-panel auth-form" onSubmit={submit}>
        <div className="study-field"><label htmlFor="researcher-email">Email</label><input id="researcher-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <div className="study-field"><label htmlFor="researcher-password">Password</label><input id="researcher-password" type="password" minLength={6} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        {message && <p className={message.startsWith('Check') ? 'study-note' : 'study-error'} role="status">{message}</p>}
        <button className="study-primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
        <button className="study-text-button" type="button" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setMessage(''); }}>{mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
      </form>
    </main>
  );
}

export default function Researcher({ onAnalyze, hasActiveAnalysis, onResumeAnalysis }) {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [studies, setStudies] = useState([]);
  const [study, setStudy] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setUser(data.session?.user || null); setAuthLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user || null);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  const load = useCallback(async () => {
    if (!user || !supabase) return;
    setLoading(true);
    setError('');
    if (!studyId) {
      const { data, error: queryError } = await supabase.from('studies').select('id,title,status,share_code,created_at').order('created_at', { ascending: false });
      if (queryError) setError(queryError.message);
      else setStudies(data || []);
    } else {
      setStudy(null);
      setQuestions([]);
      setSubmissions([]);
      setAnalyses([]);
      const [studyResult, questionResult, submissionResult, analysisResult] = await Promise.all([
        supabase.from('studies').select('*').eq('id', studyId).single(),
        supabase.from('study_questions').select('*').eq('study_id', studyId).order('position'),
        supabase.from('study_submissions').select('id,answers,created_at').eq('study_id', studyId).order('created_at'),
        supabase.from('study_analyses').select('*').eq('study_id', studyId),
      ]);
      const queryError = studyResult.error || questionResult.error || submissionResult.error || analysisResult.error;
      if (queryError) setError(queryError.message);
      else {
        setStudy(studyResult.data);
        setQuestions(questionResult.data || []);
        setSubmissions(submissionResult.data || []);
        setAnalyses(analysisResult.data || []);
      }
    }
    setLoading(false);
  }, [user, studyId]);

  useEffect(() => { load(); }, [load]);

  const saveNew = async (form) => {
    setSaving(true); setError('');
    const { data, error: createError } = await supabase.from('studies').insert({
      owner_id: user.id,
      title: form.title,
      description: form.description,
      research_question: form.research_question,
      additional_context: form.additional_context,
    }).select('id').single();
    if (createError) { setError(createError.message); setSaving(false); return; }
    const rows = form.questions.map((prompt, position) => ({ study_id: data.id, position, prompt }));
    const { error: questionError } = await supabase.from('study_questions').insert(rows);
    if (questionError) {
      await supabase.from('studies').delete().eq('id', data.id);
      setError(questionError.message);
    } else {
      setCreating(false);
      navigate(`/studies/${data.id}`);
    }
    setSaving(false);
  };

  const saveDraft = async (form) => {
    setSaving(true); setError('');
    const { error: studyError } = await supabase.from('studies').update({
      title: form.title,
      description: form.description,
      research_question: form.research_question,
      additional_context: form.additional_context,
    }).eq('id', study.id);
    if (studyError) { setError(studyError.message); setSaving(false); return; }
    for (let position = 0; position < form.questions.length; position += 1) {
      const row = questions[position];
      const query = row
        ? supabase.from('study_questions').update({ prompt: form.questions[position], position }).eq('id', row.id)
        : supabase.from('study_questions').insert({ study_id: study.id, prompt: form.questions[position], position });
      const { error: questionError } = await query;
      if (questionError) { setError(questionError.message); setSaving(false); return; }
    }
    if (questions.length > form.questions.length) {
      const removed = questions.slice(form.questions.length).map((question) => question.id);
      const { error: deleteError } = await supabase.from('study_questions').delete().in('id', removed);
      if (deleteError) { setError(deleteError.message); setSaving(false); return; }
    }
    setEditing(false); setSaving(false); await load();
  };

  const setStatus = async (status) => {
    setSaving(true); setError('');
    const { error: statusError } = await supabase.from('studies').update({ status }).eq('id', study.id);
    setSaving(false);
    if (statusError) setError(statusError.message);
    else await load();
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(studyLink(study.share_code)); setNotice('Study link copied.'); }
    catch { setNotice('Copy the study link shown below.'); }
  };

  const exportAnalysis = (analysis, question) => {
    const blob = new Blob([JSON.stringify({ study: study.title, question: question.prompt, ...analysis }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `eduthemes-${study.share_code}-question-${question.position + 1}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const launchAnalysis = async (question, analysis = null) => {
    setError('');
    setSaving(true);
    try { await onAnalyze(study, question, submissions, analysis); }
    catch (launchError) { setError(launchError.message || 'Could not start coding.'); }
    finally { setSaving(false); }
  };

  const signOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else navigate('/');
  };

  if (!supabaseConfigured) return <main className="study-shell"><h1>Connect Supabase to EduThemes</h1><p>Add the project URL and publishable key to the frontend environment, then apply the SQL migration. The setup steps are in the README.</p></main>;
  if (authLoading) return <main className="study-shell"><p role="status">Loading researcher workspace…</p></main>;
  if (!user) return <AuthForm onAuthenticated={setUser} />;

  return (
    <main className="study-shell researcher-shell">
      <div className="study-topbar"><span className="study-eyebrow">Researcher workspace</span><button type="button" className="study-text-button" onClick={signOut}>Sign out</button></div>
      {error && <p className="study-error" role="alert">{error}</p>}
      {notice && <p className="study-note" role="status">{notice}</p>}
      {!studyId ? (
        <>
          <div className="study-hero"><div><h1>Your studies</h1><p>Collect responses and turn them into themes.</p></div><button type="button" className="study-primary" onClick={() => setCreating(true)}>+ Create study</button></div>
          {hasActiveAnalysis && <section className="study-panel study-inline"><div><strong>Analysis in progress</strong><p>Continue your coding session.</p></div><button className="study-secondary" onClick={onResumeAnalysis}>Continue analysis</button></section>}
          {creating && <StudyForm onSave={saveNew} onCancel={() => setCreating(false)} saving={saving} />}
          {loading ? <p role="status">Loading studies…</p> : studies.length ? (
            <div className="study-list">{studies.map((item) => <Link to={`/studies/${item.id}`} className="study-list-card" key={item.id}><span className="study-status">{item.status}</span><h2>{item.title}</h2><p>Created {new Date(item.created_at).toLocaleDateString()}</p><span className="study-open-link">Open study →</span></Link>)}</div>
          ) : !creating && !error && <section className="study-panel study-empty"><h2>No studies yet</h2><p>Create a study, add questions, and share its link with participants.</p><button type="button" className="study-secondary" onClick={() => setCreating(true)}>Create your first study</button></section>}
          <div className="study-legacy-link"><Link to="/analysis">Analyze an existing response file →</Link></div>
        </>
      ) : (
        <>
          <Link className="study-back" to="/">← All studies</Link>
          {loading && !study ? <p role="status">Loading study…</p> : study ? (
            <>
              <div className="study-hero"><div><span className="study-status">{study.status}</span><h1>{study.title}</h1><p>{study.research_question}</p></div><div className="study-actions">{study.status === 'draft' ? <button className="study-primary" disabled={saving} onClick={() => setStatus('open')}>Publish study</button> : <button className="study-secondary" disabled={saving} onClick={() => setStatus(study.status === 'open' ? 'closed' : 'open')}>{study.status === 'open' ? 'Close study' : 'Reopen study'}</button>}</div></div>
              {study.status === 'draft' ? (
                editing ? <StudyForm key={study.id} initial={{ ...study, questions: questions.map((question) => question.prompt) }} onSave={saveDraft} onCancel={() => setEditing(false)} saving={saving} />
                  : <section className="study-panel study-inline"><div><h2>Draft questions</h2><ol>{questions.map((question) => <li key={question.id}>{question.prompt}</li>)}</ol></div><button className="study-secondary" onClick={() => setEditing(true)}>Edit draft</button></section>
              ) : <section className="study-panel share-panel"><div><h2>Participant link</h2><p>Share this link or code with students and participants.</p><code>{studyLink(study.share_code)}</code><p className="study-code">Code: {study.share_code}</p></div><button className="study-secondary" onClick={copyLink}>Copy link</button></section>}
              <section className="study-responses"><div className="study-section-heading"><div><h2>Questions and responses</h2><p>{submissions.length} {submissions.length === 1 ? 'submission' : 'submissions'} received</p></div><button type="button" className="study-text-button" onClick={load}>Refresh</button></div>
                {questions.map((question) => {
                  const answerCount = submissions.filter((submission) => Boolean(submission.answers?.[question.id]?.trim())).length;
                  const analysis = analyses.find((entry) => entry.question_id === question.id);
                  return <article className="study-panel study-question-card" key={question.id}>
                    <div className="study-question-top"><span>Question {question.position + 1}</span><span>{answerCount} {answerCount === 1 ? 'response' : 'responses'}</span></div>
                    <h3>{question.prompt}</h3>
                    {analysis && <p className="study-note">{analysis.stage === 'results' ? 'Findings saved' : 'Coding in progress'} · {analysis.response_count} responses in saved analysis{answerCount > analysis.response_count ? ` · ${answerCount - analysis.response_count} new since then` : ''}</p>}
                    <div className="study-actions">
                      {analysis?.stage !== 'results' && analysis && <button className="study-primary" disabled={saving} onClick={() => launchAnalysis(question, analysis)}>Resume coding</button>}
                      {answerCount > 0 && <button className={analysis ? 'study-secondary' : 'study-primary'} disabled={saving} onClick={() => launchAnalysis(question)}>{analysis ? 'Analyze current responses' : 'Start coding'}</button>}
                    </div>
                    {answerCount > 0 && <details className="study-answer-list"><summary>View collected responses</summary><ol>{submissions.filter((submission) => submission.answers?.[question.id]?.trim()).map((submission) => <li key={submission.id}>{submission.answers[question.id]}</li>)}</ol></details>}
                    {analysis?.stage === 'results' && <div className="study-findings"><h4>Saved findings</h4><p>{analysis.results?.summary || 'No summary saved.'}</p><ul>{(analysis.results?.themes || []).map((theme) => <li key={theme.name}>{theme.name}: {theme.frequency}</li>)}</ul><button type="button" className="study-text-button" onClick={() => exportAnalysis(analysis, question)}>Download coded results</button></div>}
                  </article>;
                })}
              </section>
            </>
          ) : !loading && <section className="study-panel"><h1>Study not found</h1><p>It may have been removed or belongs to another researcher.</p></section>}
        </>
      )}
    </main>
  );
}
