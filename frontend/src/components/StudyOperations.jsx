import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { completionHandoffCsv, enrollmentComplete, operationsMetrics, rewardStatuses } from '../utils/studyActivities';

export default function StudyOperations({ study, role }) {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({ target: 0, notes: '', revision: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const canEdit = role === 'owner' || role === 'researcher';
  const load = useCallback(async (initialize = false) => {
    const request = ++generation.current;
    setRefreshing(true);
    try {
      const { data: result, error: failure } = await supabase.rpc('get_study_operations', { p_study_id: study.id });
      if (request !== generation.current) return;
      if (failure) throw failure;
      setData(result);
      if (initialize) setSettings({ target: result.recruitment_target, notes: result.coordinator_notes, revision: result.revision });
    } catch (failure) { if (request === generation.current) setError(failure.message || 'Could not load study operations.'); }
    finally { if (request === generation.current) setRefreshing(false); }
  }, [study.id]);
  useEffect(() => { setData(null); setError(''); load(true); return () => { generation.current += 1; }; }, [load]);

  const save = async (event) => {
    event.preventDefault(); setBusy('settings'); setError(''); setNotice('');
    try {
      const { data: revision, error: failure } = await supabase.rpc('save_study_operations', {
        p_study_id: study.id, p_recruitment_target: Number(settings.target),
        p_coordinator_notes: settings.notes, p_expected_revision: settings.revision,
      });
      if (failure) throw failure;
      setSettings((current) => ({ ...current, revision })); setNotice('Operations settings saved.'); await load();
    } catch (failure) { setError(failure.message || 'Could not save operations settings.'); }
    finally { setBusy(''); }
  };
  const recordReward = async (participant, status) => {
    setBusy(participant.id); setError(''); setNotice('');
    try {
      const { error: failure } = await supabase.rpc('update_participation_reward', {
        p_enrollment_id: participant.id, p_status: status, p_expected_revision: participant.revision,
      });
      if (failure) throw failure;
      setNotice(`Handoff status recorded for ${participant.participant_reference}.`); await load();
    } catch (failure) { setError(failure.message || 'Could not record the handoff status.'); }
    finally { setBusy(''); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([completionHandoffCsv(study.title, data.participants)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `eduthemes-${study.share_code}-completion-handoff.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const metrics = data ? operationsMetrics(data.participants) : null;
  return <section className="study-operations" aria-labelledby="operations-title">
    <div className="study-section-heading"><div><span className="study-eyebrow">Study operations</span><h2 id="operations-title">From joining to completion</h2><p>Progress across published activity plans. Each enrollment is counted once.</p></div>
      <div className="study-actions"><button type="button" className="study-text-button" disabled={refreshing || Boolean(busy)} onClick={() => { setError(''); load(!data); }}>Refresh progress</button>{data && <button type="button" className="study-secondary" disabled={!data.participants.length || refreshing || Boolean(busy)} onClick={download}>Download completion handoff</button>}</div>
    </div>
    {error && <p className="study-error" role="alert">{error}</p>}{notice && <p className="study-note" role="status">{notice}</p>}
    {!data ? refreshing || !error ? <LoadingSkeleton variant="results" label="Loading study operations…" /> : <button type="button" className="study-secondary" onClick={() => { setError(''); load(true); }}>Retry loading operations</button> : <>
      {(refreshing || busy) && <LoadingSkeleton variant="inline" label={busy === 'settings' ? 'Saving operations settings…' : busy ? 'Recording handoff status…' : 'Refreshing progress…'} />}
      <div className="study-operations-metrics">
        {[['Recruitment target', data.recruitment_target || 'Not set'], ['Enrolled', metrics.enrolled], ['Started', metrics.started], ['Completed required activities', metrics.completed], ['With overdue activities', metrics.overdue]].map(([label, value]) => <div className="study-operation-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      {data.recruitment_target > 0 && <div className="study-recruitment-progress"><label htmlFor="recruitment-progress">{metrics.enrolled} of {data.recruitment_target} target enrollments</label><progress id="recruitment-progress" max={data.recruitment_target} value={Math.min(metrics.enrolled, data.recruitment_target)} /></div>}
      {data.unlinked_responses > 0 && <p className="study-note">{data.unlinked_responses} single-activity or historical response records are tracked separately. They are not treated as unique people or linked to these enrollments.</p>}
      <details className="study-panel study-operations-settings"><summary>{canEdit ? 'Recruitment target and coordinator notes' : 'View operations settings'}</summary>
        <form onSubmit={save}><fieldset disabled={!canEdit || Boolean(busy)} className="study-unframed-fieldset">
          <div className="study-field"><label htmlFor="recruitment-target">Recruitment target (enrollments)</label><input id="recruitment-target" type="number" min={0} max={1000000} step={1} required value={settings.target} onChange={(event) => setSettings((current) => ({ ...current, target: event.target.value }))} /><p className="study-help">Use 0 while a target is undecided. Enrollment counts do not deduplicate people who join more than once.</p></div>
          <div className="study-field"><label htmlFor="coordinator-notes">Coordinator notes</label><textarea id="coordinator-notes" rows={3} maxLength={5000} value={settings.notes} onChange={(event) => setSettings((current) => ({ ...current, notes: event.target.value }))} /><p className="study-help">Visible to the study team. Never included on participant pages or in the completion handoff.</p></div>
          {canEdit && <button type="submit" className="study-primary" aria-busy={busy === 'settings'}>{busy === 'settings' ? <><Skeleton className="edu-skeleton--button" />Saving…</> : 'Save operations settings'}</button>}
        </fieldset></form>
        {canEdit && error && <button type="button" className="study-text-button" disabled={refreshing || Boolean(busy)} onClick={() => { setError(''); load(true); }}>Replace settings with the latest saved version</button>}
      </details>
      <div className="study-panel study-enrollment-panel"><h3>Enrollments and handoffs</h3><p className="study-help">Compensation and course credit are arranged through your existing process. Statuses below are coordinator records.</p>
        {data.participants.length ? <div className="study-table-scroll"><table className="study-enrollment-table"><caption className="visually-hidden">Enrollment completion and compensation or credit handoff status</caption><thead><tr><th scope="col">Study reference</th><th scope="col">Version</th><th scope="col">Activity progress</th><th scope="col">Compensation or credit</th></tr></thead><tbody>
          {data.participants.map((participant) => <tr key={participant.id}><td><strong>{participant.participant_reference}</strong><small>Joined {new Date(participant.joined_at).toLocaleDateString()}</small></td><td>Version {participant.version_number}</td><td><strong>{enrollmentComplete(participant) ? 'Completed' : participant.overdue_count ? `${participant.overdue_count} overdue` : participant.started ? 'In progress' : 'Joined'}</strong><small>{participant.completed_required} of {participant.required_count} required · {participant.completed_activities} of {participant.activity_count} total</small></td><td>
            {canEdit ? <select aria-label={`Handoff status for ${participant.participant_reference}`} disabled={Boolean(busy)} value={participant.reward_status} onChange={(event) => recordReward(participant, event.target.value)}>{Object.entries(rewardStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select> : rewardStatuses[participant.reward_status]}
            {participant.reward_updated_at && <small>Recorded {new Date(participant.reward_updated_at).toLocaleString()}</small>}
          </td></tr>)}
        </tbody></table></div> : <div className="study-operations-empty"><h4>Ready for the first enrollment</h4><p>A study with multiple activities gives participants a private return link. Their progress will appear here after they consent and join.</p></div>}
      </div>
    </>}
  </section>;
}
