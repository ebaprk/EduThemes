import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { supabase } from '../supabase';
import { API_URL } from '../api';
import LoadingSkeleton, { Skeleton } from '../components/LoadingSkeleton';

// The server owns execution. Polling only observes the durable study job.
export default function useAnalysisJob(source, kind, onComplete, beforeJob) {
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(Boolean(source));
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const complete = useRef(onComplete); complete.current = onComplete;
  const identity = [source?.studyId, source?.versionId, source?.questionId, source?.runId, kind].join(':');
  const current = useRef(identity); current.current = identity;
  const submitted = useRef(false);
  const args = () => ({p_study_id:source.studyId,p_version_id:source.versionId,p_question_id:source.questionId,p_run_id:source.runId,p_kind:kind});
  const read = async (extra = {}) => {
    const {data, error: failure} = await supabase.rpc('analysis_job', {...args(), ...extra});
    if (failure) throw new Error(failure.message);
    return data;
  };
  useEffect(() => {
    if (!source || !supabase) { setChecking(false); return; }
    let disposed = false; let timer;
    submitted.current = false; setJob(null); setError(''); setChecking(true);
    const poll = async () => {
      try {
        const next = await read();
        if (disposed) return;
        setError(''); setJob(next); setChecking(false);
        if (next?.status === 'completed' && submitted.current) {
          submitted.current = false; complete.current(next);
        }
      } catch { if (!disposed) { setError('Could not check analysis progress. Reconnecting… Your saved job is retained.'); setChecking(false); } }
      if (!disposed) timer = setTimeout(poll, 4000);
    };
    axios.get(`${API_URL}/models`).then(({data}) => {
      if (disposed) return;
      setEnabled(Boolean(data.background_analysis));
      if (data.background_analysis) poll(); else setChecking(false);
    }).catch(() => { if (!disposed) { setEnabled(true); poll(); } });
    return () => { disposed = true; clearTimeout(timer); };
    // Only restart when switching study, version, question, run, or operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);
  const start = async (payload) => {
    const captured = identity;
    setSaving(true); setError('');
    try {
      await beforeJob?.();
      const next = await read({p_payload:payload});
      if (current.current !== captured) return;
      setJob(next); submitted.current = true;
      if (next.status === 'completed') { submitted.current = false; complete.current(next); }
    } catch (failure) { if (current.current === captured) setError(`Could not save the analysis job: ${failure.message}. Your work is retained; try again.`); }
    finally { if (current.current === captured) setSaving(false); }
  };
  const retry = async () => {
    const captured = identity;
    setSaving(true);
    try { const next = await read({p_retry:true}); if (current.current === captured) { setJob(next); submitted.current = true; setError(''); } }
    catch { if (current.current === captured) setError('Could not retry. Your saved job is retained; try again.'); }
    finally { if (current.current === captured) setSaving(false); }
  };
  const pending = job && ['queued','running'].includes(job.status);
  const busy = checking || saving || Boolean(pending);
  const panel = source && (checking || saving || job || error) ? <section className="study-panel" aria-label="Saved analysis job" style={{marginBottom:20}}>
    {checking || saving || pending ? <LoadingSkeleton variant="inline" label={checking ? 'Checking saved analysis…' : saving ? 'Saving analysis job…' : job.status === 'queued' ? 'Analysis queued…' : 'Analysis in progress…'} /> : null}
    {pending && <p>You can close this tab. Return to this question to check progress. Processing uses your submitted responses and themes.</p>}
    {error && <p role="alert">{error}</p>}
    {job?.status === 'failed' && <><p role="alert">{job.error}</p><button className="study-primary" disabled={saving} aria-busy={saving} onClick={retry}>{saving && <Skeleton className="edu-skeleton--button" />}Retry saved analysis</button></>}
    {job?.status === 'completed' && <><p role="status">Your analysis is ready. Open it to restore the submitted responses and themes with the results.</p><button className="study-primary" onClick={() => complete.current(job)}>Open completed analysis</button></>}
  </section> : null;
  return {enabled, busy, panel, start};
}
