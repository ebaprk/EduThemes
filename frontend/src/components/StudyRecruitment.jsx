import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { applicationIsStale, recruitmentCounts, recruitmentStatuses } from '../utils/recruitment';

export default function StudyRecruitment({ study, role, onRefreshed }) {
  const [data,setData] = useState(null), [filter,setFilter] = useState('all'), [selected,setSelected] = useState(null);
  const [note,setNote] = useState(''), [decision,setDecision] = useState('eligible'), [busy,setBusy] = useState(false);
  const [refreshing,setRefreshing] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const generation = useRef(0);
  const canEdit = ['owner','researcher'].includes(role);
  const load = useCallback(async () => {
    const request = ++generation.current; setRefreshing(true);
    try {
      const result = await supabase.rpc('get_study_recruitment',{p_study_id:study.id});
      if (request !== generation.current) return;
      if (result.error) throw result.error;
      setData(result.data);
    } catch(failure) { if(request === generation.current) setError(failure.message || 'Could not load recruitment.'); }
    finally { if(request === generation.current) setRefreshing(false); }
  },[study.id]);
  useEffect(() => { setData(null); setSelected(null); setError(''); load(); return () => { generation.current += 1; }; },[load]);
  const open = applicant => { setSelected(applicant); setNote(applicant.review_note); setDecision(applicant.decision === 'invited' ? 'invited' : 'eligible'); setError(''); setNotice(''); };
  const save = async event => {
    event.preventDefault(); if(busy) return; setBusy(true); setError(''); setNotice('');
    const current=selected;
    try {
      const result=await supabase.rpc('review_study_applicant',{p_applicant_id:current.id,p_status:decision,p_note:note,p_expected_revision:current.revision});
      if(result.error) throw result.error;
      setSelected({...current,decision,status:decision,review_note:note,revision:result.data});
      setNotice(`${current.reference}: ${recruitmentStatuses[decision].toLowerCase()} recorded. Participants see their status in their private hub.`);
      await load();
    } catch(failure) { setError(failure.message || 'Could not record this review. Your note is still here.'); }
    finally { setBusy(false); }
  };
  const latest=selected && data?.applicants.find(a=>a.id===selected.id);
  const stale=applicationIsStale(selected,latest);
  const counts=data ? recruitmentCounts(data.applicants) : {};
  const filtered=data?.applicants.filter(a=>filter==='all'||a.status===filter) || [];
  return <section className="study-recruitment" aria-labelledby="recruitment-heading">
    <div className="study-section-heading"><div><span className="study-eyebrow">Recruitment</span><h2 id="recruitment-heading">From screening to participation</h2><p>Review eligibility, manage a waitlist, and invite participants to their private study hub.</p></div><button type="button" className="study-secondary" disabled={refreshing||busy} aria-busy={refreshing} onClick={async()=>{setError('');await load();onRefreshed?.();}}>{refreshing ? <><Skeleton className="edu-skeleton--button"/>Refreshing…</> : 'Refresh recruitment'}</button></div>
    {error && <p className="study-error" role="alert">{error}</p>}{notice && <p className="study-note" role="status">{notice}</p>}
    {!data ? refreshing || !error ? <LoadingSkeleton variant="results" label="Loading screening applications and recruitment progress…"/> : <button className="study-secondary" onClick={load}>Retry recruitment</button> : <>
      {refreshing && <LoadingSkeleton variant="inline" label="Refreshing recruitment…"/>}
      <div className="recruitment-funnel" aria-label="Current recruitment stages">{Object.entries(recruitmentStatuses).map(([status,label])=><button type="button" key={status} aria-pressed={filter===status} onClick={()=>setFilter(filter===status?'all':status)}><strong>{counts[status]}</strong><span>{label}</span></button>)}</div>
      <p className="study-help">Counts show current application stages, not unique people across studies. Invitations enable joining in the private hub; they do not send email. {data.target > 0 && `Recruitment target: ${data.target}. Targets do not automatically invite or reject volunteers.`}</p>
      <div className="recruitment-workspace"><section className="study-panel"><div className="study-section-heading"><h3>Applications · {filtered.length}</h3><label>Show<select aria-label="Filter recruitment status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All applications</option>{Object.entries(recruitmentStatuses).map(([s,l])=><option key={s} value={s}>{l}</option>)}</select></label></div>
        {filtered.length ? <div className="study-table-scroll"><table className="recruitment-table"><caption className="visually-hidden">Screening applications and current recruitment status</caption><thead><tr><th scope="col">Reference</th><th scope="col">Status</th><th scope="col">Rules</th><th scope="col">Review</th></tr></thead><tbody>{filtered.map(a=><tr key={a.id}><td><strong>{a.reference}</strong><small>Version {a.version_number}{!a.current_version?' · earlier version':''}</small><small>{new Date(a.screened_at).toLocaleDateString()}</small></td><td>{recruitmentStatuses[a.status]}</td><td>{a.rule_result==='matches'?'Matches configured criteria':'Needs closer review'}</td><td><button className="study-secondary" disabled={busy} onClick={()=>open(a)}>Open {a.reference}</button></td></tr>)}</tbody></table></div> : <p>{data.applicants.length ? 'No applications at this stage.' : 'No screening applications yet. Share an open study with screening enabled to receive applications.'}</p>}
      </section><section className="study-panel recruitment-review" aria-labelledby="application-review-heading"><h3 id="application-review-heading">{selected ? selected.reference : 'Application review'}</h3>{!selected ? <p>Select an application to review its screening answers and record a decision.</p> : <>
        <p>Version {selected.version_number} · {recruitmentStatuses[latest?.status || selected.status]}</p><p className="study-help">Rule checks support your review. They do not decide eligibility.</p>
        <dl className="screening-answer-list">{selected.questions.filter(q=>selected.answers[q.id]).map(q=><div key={q.id}><dt>{q.prompt}</dt><dd>{q.options.find(o=>o.id===selected.answers[q.id])?.label || 'Recorded choice'}</dd></div>)}</dl>
        {stale && <p className="study-note">This application has changed. Your note is preserved. Open the latest version before recording another decision.</p>}
        {!selected.current_version && <p className="study-note">This application belongs to an earlier study version. It cannot receive a new invitation to the current version.</p>}
        {canEdit && !['enrolled','completed'].includes(latest?.status || selected.status) && <form onSubmit={save}><fieldset className="study-unframed-fieldset" disabled={busy}>
          <div className="study-field"><label htmlFor="recruitment-decision">Review decision</label><select id="recruitment-decision" value={decision} onChange={e=>setDecision(e.target.value)}>{['eligible','waitlisted','not_eligible','awaiting_review',...(selected.decision==='eligible'||selected.decision==='invited'?['invited']:[])].map(s=><option key={s} value={s}>{recruitmentStatuses[s]}</option>)}</select></div>
          <div className="study-field"><label htmlFor="recruitment-note">Private review note (optional)</label><textarea id="recruitment-note" value={note} maxLength={2000} rows={3} onChange={e=>setNote(e.target.value)}/><p className="study-help">Visible to the study team. Excluded from participant status and research analysis.</p></div>
          <button className="study-primary" type="submit" disabled={Boolean(stale)|| (decision==='invited'&&(!selected.current_version||study.status!=='open'))} aria-busy={busy}>{busy?<><Skeleton className="edu-skeleton--button"/>Recording review…</>:'Record decision'}</button>
          {!['eligible','invited'].includes(selected.decision)&&<p className="study-help">Record eligibility first. You can then invite this volunteer.</p>}
        </fieldset></form>}
        {stale && latest && <button className="study-secondary" disabled={busy} onClick={()=>open(latest)}>Open latest application</button>}
        {latest?.events?.length > 0 && <details><summary>Review history · {latest.events.length}</summary><ol>{latest.events.map((event,index)=><li key={index}><strong>{recruitmentStatuses[event.status]}</strong> · {new Date(event.recorded_at).toLocaleString()}{event.note&&<p>{event.note}</p>}</li>)}</ol></details>}
      </>}</section></div>
    </>}
  </section>;
}
