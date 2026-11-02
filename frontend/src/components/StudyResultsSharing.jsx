import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { findingsEntries, findingsUrl } from '../utils/studyWorkflow';
import { blankResults, resultSourceKey, resultsFields, resultsFingerprint } from '../utils/participantResults';
import '../styles/ParticipantResults.css';

function ResultsPreview({ content }) {
  return <article className="results-summary-document" aria-label="Participant summary preview">
    <span className="study-eyebrow">Study results</span><h3>{content.title || 'Your summary title'}</h3>
    {resultsFields.filter(([key]) => key !== 'title').map(([key, label]) => content[key] && <section key={key}><h4>{label}</h4><p>{content[key]}</p></section>)}
  </article>;
}

export default function StudyResultsSharing({ study, view, work, role }) {
  const [data, setData] = useState(null), [content, setContent] = useState(blankResults), [sources, setSources] = useState([]);
  const [options, setOptions] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState(false), [attested, setAttested] = useState(false);
  const generation = useRef(0);
  const dirtyRef = useRef(false);
  const busyRef = useRef('');
  busyRef.current = busy;
  const canEdit = ['owner', 'researcher'].includes(role), owner = role === 'owner';
  const entries = findingsEntries(work);
  const signature = entries.map(({ question, key }) => `${question.id}:${key}`).join('|');
  const savedFingerprint = data ? resultsFingerprint(data.draft?.content, data.draft?.sources || []) : '';
  const dirty = Boolean(data && savedFingerprint !== resultsFingerprint(content, sources));
  dirtyRef.current = dirty;
  const currentRelease = data?.releases.find(item => item.id === data.draft?.current_release_id);
  const sameAsReleased = currentRelease && resultsFingerprint(currentRelease.content, currentRelease.sources) === savedFingerprint;
  const adopt = (result) => {
    setData(result); setContent({ ...blankResults(), ...result.draft?.content }); setSources(result.draft?.sources || []); setAttested(false); setPreview(false);
  };
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const [{ data: result, error: failure }, available] = await Promise.all([
        supabase.rpc('get_study_results_workspace', { p_study_id: study.id, p_version_id: view }),
        Promise.all(entries.map(async ({ question, key, index }) => {
          const { data: review, error: failed } = await supabase.rpc('get_study_run_review', { p_study_id: study.id, p_version_id: view, p_question_id: question.id, p_run_key: key });
          return { question, key, index, review: failed ? null : review };
        })),
      ]);
      if (request !== generation.current) return;
      if (failure) throw failure;
      adopt(result); setOptions(available);
    } catch (failure) { if (request === generation.current) setError(failure.message || 'Could not load participant results.'); }
    finally { if (request === generation.current) setLoading(false); }
  // Entry identity changes only when the selected version gains or loses a run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study.id, view, signature]);
  useEffect(() => { if (view === 'draft') { setLoading(false); return; } if (dirtyRef.current || busyRef.current) { setNotice('Available findings changed. Your summary is preserved; reload when you are ready to refresh its sources.'); } else load(); }, [load, view]);
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const reload = () => { if (!dirty || window.confirm('Replace your unsaved summary with the latest saved version?')) { setNotice(''); load(); } };
  const mutate = async (kind) => {
    if (busy || loading) return;
    if (kind === 'withdraw' && !window.confirm('Withdraw the released summary from participant results? The team retains its release history. Downloaded copies cannot be recalled.')) return;
    const request = generation.current;
    setBusy(kind); setError(''); setNotice('');
    try {
      const args = { p_study_id: study.id, p_version_id: view, p_expected_revision: data.draft?.revision || 0 };
      const name = kind === 'save' ? 'save_study_results_draft' : kind === 'release' ? 'release_study_results' : 'withdraw_study_results';
      const { data: result, error: failure } = await supabase.rpc(name, { ...args, ...(kind === 'save' ? { p_content: content, p_sources: sources } : kind === 'release' ? { p_attested: attested } : {}) });
      if (request !== generation.current) return;
      if (failure) throw failure;
      adopt(result); setNotice(kind === 'save' ? 'Draft saved. The participant release has not changed.' : kind === 'release' ? 'Results released to participants in this study version through their private links.' : 'Results withdrawn. Participants will no longer see the released summary.');
    } catch (failure) { if (request === generation.current) setError(failure.message || 'Could not update participant results.'); }
    finally { if (request === generation.current) setBusy(''); }
  };
  const edit = (key, value) => { setContent(previous => ({ ...previous, [key]: value })); setAttested(false); setPreview(false); setNotice(''); };
  if (view === 'draft') return <section className="study-panel study-flow-empty"><h2>Results belong to a published study version</h2><p>Select a published version to prepare a summary for the participants who joined it.</p></section>;
  return <section className="results-sharing" aria-labelledby="results-sharing-title">
    <div className="study-section-heading"><div><span className="study-eyebrow">Close the research loop</span><h2 id="results-sharing-title">Return results to participants</h2><p>Prepare a plain-language summary for this study version. Participants open it through their private study or results link.</p></div><button className="study-secondary" disabled={loading || Boolean(busy)} aria-busy={loading} onClick={reload}>{loading ? <><Skeleton className="edu-skeleton--button" />Refreshing…</> : 'Reload summary and sources'}</button></div>
    {error && <p className="study-error" role="alert">{error}</p>}{notice && <p className="study-note" role="status">{notice}</p>}
    {!data ? loading ? <LoadingSkeleton variant="form" rows={2} label="Loading participant summary and reviewed findings…" /> : <button className="study-primary" onClick={load}>Retry loading results</button> : <>
      {loading && <LoadingSkeleton variant="inline" label="Refreshing summary and source reviews…" />}
      <div className="study-panel results-release-status"><div><span className="study-eyebrow">Participant access</span><h3>{currentRelease ? `Results release ${currentRelease.release_number} is available` : 'No results are currently released'}</h3><p>{currentRelease ? `Released ${new Date(currentRelease.released_at).toLocaleString()}. Editing a draft leaves this release available until the owner replaces or withdraws it.` : 'Drafts and source reviews are visible only to the study team.'}</p></div>{owner && currentRelease && <button className="study-secondary" disabled={Boolean(busy) || loading || dirty} aria-busy={busy === 'withdraw'} onClick={() => mutate('withdraw')}>{busy === 'withdraw' ? <><Skeleton className="edu-skeleton--button" />Withdrawing…</> : 'Withdraw release'}</button>}</div>
      <div className="results-sharing-grid"><div className="study-panel results-draft-editor"><h3>Participant summary draft</h3><p>Write for participants in everyday language. Only the sections below are released; source responses, review notes, and coding records remain private.</p>
        <fieldset className="study-unframed-fieldset" disabled={!canEdit || Boolean(busy) || loading}>
          {resultsFields.map(([key, label, max, required]) => <div className="study-field" key={key}><label htmlFor={`results-${key}`}>{label}{!required && ' (optional)'}</label>{key === 'title' ? <input id={`results-${key}`} maxLength={max} value={content[key]} onChange={event => edit(key, event.target.value)} /> : <textarea id={`results-${key}`} maxLength={max} rows={key === 'findings' ? 6 : 3} value={content[key]} onChange={event => edit(key, event.target.value)} />}</div>)}
        </fieldset>
        <div className="study-actions">{canEdit && <button className="study-primary" disabled={Boolean(busy) || loading || !dirty} aria-busy={busy === 'save'} onClick={() => mutate('save')}>{busy === 'save' ? <><Skeleton className="edu-skeleton--button" />Saving draft…</> : 'Save summary draft'}</button>}<button className="study-secondary" disabled={Boolean(busy) || loading || !data.draft || dirty} onClick={() => { setPreview(value => !value); setAttested(false); }}>{preview ? 'Hide participant preview' : 'Preview saved summary'}</button></div>
        {dirty && <p className="study-help" role="status">Unsaved changes. Save before previewing or releasing.</p>}
      </div><aside className="results-source-panel study-panel"><h3>Findings behind this summary</h3><p>Select the completed runs used in this summary. Every selected run needs a current review sign-off before release.</p>
        {options.length ? <fieldset className="study-unframed-fieldset" disabled={!canEdit || Boolean(busy) || loading}>{options.map(option => {
          const source = { question_id: option.question.id, run_key: option.key, snapshot_hash: option.review?.snapshot_hash, review_revision: option.review?.review?.revision || 0 };
          const checked = sources.some(item => resultSourceKey(item) === resultSourceKey(source));
          const fresh = checked && sources.some(item => resultSourceKey(item) === resultSourceKey(source) && item.snapshot_hash === source.snapshot_hash && item.review_revision === source.review_revision);
          return <div className="results-source" key={resultSourceKey(source)}><label className="study-check-choice"><input type="checkbox" disabled={!option.review} checked={checked} onChange={event => { setSources(previous => event.target.checked ? [...previous, source] : previous.filter(item => resultSourceKey(item) !== resultSourceKey(source))); setAttested(false); setPreview(false); }} /><span>{option.question.prompt}<small>{option.index === 0 ? 'Latest completed run' : 'Earlier completed run'} · {option.review ? option.review.current && option.review.review?.status === 'approved' ? 'Reviewed' : 'Review required' : 'Review unavailable'}</small></span></label>{checked && !fresh && <p className="study-note">This saved source changed. Uncheck and select it again after reviewing the updated findings.</p>}<Link to={findingsUrl(study.id, view, option.question.id, option.key)}>Open findings and review</Link></div>;
        })}</fieldset> : <p>No completed findings in this version yet. Finish an analysis before releasing results.</p>}
        {sources.filter(source => !options.some(option => `${option.question.id}:${option.key}` === resultSourceKey(source))).map(source => <div key={resultSourceKey(source)}><p className="study-error">A saved source is no longer available. Remove it or reload the study findings before release.</p>{canEdit && <button className="study-text-button" disabled={Boolean(busy) || loading} onClick={() => { setSources(previous => previous.filter(item => resultSourceKey(item) !== resultSourceKey(source))); setAttested(false); setPreview(false); }}>Remove unavailable source</button>}</div>)}
        <p className="study-help">No response text is copied into this draft automatically. Check the summary for identifying details and claims unsupported by the selected findings.</p>
      </aside></div>
      {preview && <section className="results-preview"><div className="study-section-heading"><h3>Participant preview · saved draft</h3><span className="review-status">Not released by this preview</span></div><ResultsPreview content={content} />{owner && !sameAsReleased && <div className="study-panel results-release-controls"><label className="study-consent-choice"><input type="checkbox" checked={attested} disabled={Boolean(busy) || loading} onChange={event => setAttested(event.target.checked)} />I reviewed this exact summary for the participant audience, checked its claims and identifying details, and intend to release it to participants in this version.</label><button className="study-primary" disabled={!attested || dirty || loading || Boolean(busy) || !sources.length} aria-busy={busy === 'release'} onClick={() => mutate('release')}>{busy === 'release' ? <><Skeleton className="edu-skeleton--button" />Releasing results…</> : currentRelease ? 'Release updated results' : 'Release results to participants'}</button></div>}{!owner && <p className="study-help">The study owner releases or withdraws participant results.</p>}</section>}
      {data.releases.length > 0 && <details className="study-panel results-release-history"><summary>Results release history · {data.releases.length}</summary><p>Earlier releases remain in the team record. Participants see only the current release.</p>{data.releases.map(release => <details key={release.id}><summary>Release {release.release_number} · {release.withdrawn_at ? 'Withdrawn' : release.id === currentRelease?.id ? 'Current' : 'Replaced'} · {new Date(release.released_at).toLocaleString()}</summary>{release.withdrawn_at && <p>Withdrawn {new Date(release.withdrawn_at).toLocaleString()}</p>}<ResultsPreview content={release.content} /></details>)}</details>}
    </>}
  </section>;
}
