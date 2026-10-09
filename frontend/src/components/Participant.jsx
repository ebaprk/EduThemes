import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../supabase';
import './Studies.css';

export default function Participant() {
  const { code } = useParams();
  const [entryCode, setEntryCode] = useState('');
  const [study, setStudy] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(Boolean(code));
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code || !supabase) return;
    let active = true;
    setLoading(true);
    setStudy(null);
    setError('');
    supabase.rpc('get_public_study', { p_code: code }).then(({ data, error: loadError }) => {
      if (!active) return;
      setLoading(false);
      if (loadError) setError(loadError.message);
      else if (!data) setError('This study link is unavailable or the study is closed.');
      else setStudy(data);
    });
    return () => { active = false; };
  }, [code]);

  const submit = async (event) => {
    event.preventDefault();
    if (!study || submitting) return;
    setError('');
    setSubmitting(true);
    const { error: submitError } = await supabase.rpc('submit_study', {
      p_code: code,
      p_answers: answers,
    });
    setSubmitting(false);
    if (submitError) setError(submitError.message);
    else setFinished(true);
  };

  if (!code) return (
    <main className="study-shell participant-shell">
      <span className="study-eyebrow">Participant portal</span>
      <h1>Join a study</h1>
      <p>Enter the code your researcher shared with you.</p>
      <form className="study-panel join-form" onSubmit={(event) => {
        event.preventDefault();
        window.location.assign(`/join/${entryCode.trim().toUpperCase()}`);
      }}>
        <label htmlFor="study-code">Study code</label>
        <input id="study-code" value={entryCode} onChange={(event) => setEntryCode(event.target.value)} required maxLength={12} autoComplete="off" placeholder="12-character code" />
        <button className="study-primary" type="submit">Continue</button>
      </form>
    </main>
  );

  return (
    <main className="study-shell participant-shell">
      <span className="study-eyebrow">Participant portal</span>
      {!supabaseConfigured ? <p role="alert">This site has not been connected to Supabase yet.</p>
        : loading ? <p role="status">Loading study…</p>
          : finished ? (
            <section className="study-panel" role="status">
              <h1>Thank you for participating</h1>
              <p>Your responses were submitted successfully.</p>
              <Link to="/join">Join another study</Link>
            </section>
          ) : study ? (
            <>
              <h1>{study.title}</h1>
              {study.description && <p className="study-intro">{study.description}</p>}
              <p className="study-privacy">Your answers are shared with the researcher who created this study. No participant account is required.</p>
              <form className="study-panel participant-form" onSubmit={submit}>
                {(study.questions || []).map((question, index) => (
                  <div className="study-field" key={question.id}>
                    <label htmlFor={`answer-${question.id}`}>{index + 1}. {question.prompt}</label>
                    <textarea
                      id={`answer-${question.id}`}
                      value={answers[question.id] || ''}
                      onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))}
                      rows={5}
                      maxLength={10000}
                      required
                    />
                  </div>
                ))}
                {error && <p className="study-error" role="alert">{error}</p>}
                <button className="study-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit responses'}
                </button>
              </form>
            </>
          ) : <section className="study-panel"><h1>Study unavailable</h1><p role="alert">{error}</p><Link to="/join">Enter another code</Link></section>}
    </main>
  );
}
