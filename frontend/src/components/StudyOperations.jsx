import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { completionHandoffCsv, enrollmentComplete, operationsMetrics, rewardStatuses } from '../utils/studyActivities';
import { Button } from "@eduthemes/ui/components/button";
import { Label } from "@eduthemes/ui/components/label";
import { Progress } from "@eduthemes/ui/components/progress";
import { Input } from "@eduthemes/ui/components/input";
import { Textarea } from "@eduthemes/ui/components/textarea";
import { Card } from "@eduthemes/ui/components/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@eduthemes/ui/components/table";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { ContextHelp } from '@eduthemes/ui/workbench';
export default function StudyOperations({
  study,
  role,
  refreshSignal = 0,
  onOpenResponses
}) {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({
    target: 0,
    notes: '',
    revision: 0
  });
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const lastRefresh = useRef(refreshSignal);
  const canEdit = role === 'owner' || role === 'researcher';
  const load = useCallback(async (initialize = false) => {
    const request = ++generation.current;
    setRefreshing(true);
    try {
      const {
        data: result,
        error: failure
      } = await supabase.rpc('get_study_operations', {
        p_study_id: study.id
      });
      if (request !== generation.current) return;
      if (failure) throw failure;
      setData(result);
      if (initialize) setSettings({
        target: result.recruitment_target,
        notes: result.coordinator_notes,
        revision: result.revision
      });
    } catch (failure) {
      if (request === generation.current) setError(failure.message || 'Could not load study operations.');
    } finally {
      if (request === generation.current) setRefreshing(false);
    }
  }, [study.id]);
  useEffect(() => {
    setData(null);
    setError('');
    load(true);
    return () => {
      generation.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (lastRefresh.current !== refreshSignal) {
      lastRefresh.current = refreshSignal;
      load();
    }
  }, [refreshSignal, load]);
  const save = async event => {
    event.preventDefault();
    setBusy('settings');
    setError('');
    setNotice('');
    try {
      const {
        data: revision,
        error: failure
      } = await supabase.rpc('save_study_operations', {
        p_study_id: study.id,
        p_recruitment_target: Number(settings.target),
        p_coordinator_notes: settings.notes,
        p_expected_revision: settings.revision
      });
      if (failure) throw failure;
      setSettings(current => ({
        ...current,
        revision
      }));
      setNotice('Operations settings saved.');
      await load();
    } catch (failure) {
      setError(failure.message || 'Could not save operations settings.');
    } finally {
      setBusy('');
    }
  };
  const recordReward = async (participant, status) => {
    setBusy(participant.id);
    setError('');
    setNotice('');
    try {
      const {
        error: failure
      } = await supabase.rpc('update_participation_reward', {
        p_enrollment_id: participant.id,
        p_status: status,
        p_expected_revision: participant.revision
      });
      if (failure) throw failure;
      setNotice(`Handoff status recorded for ${participant.participant_reference}.`);
      await load();
    } catch (failure) {
      setError(failure.message || 'Could not record the handoff status.');
    } finally {
      setBusy('');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([completionHandoffCsv(study.title, data.participants)], {
      type: 'text/csv;charset=utf-8'
    }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `eduthemes-${study.share_code}-completion-handoff.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const metrics = data ? operationsMetrics(data.participants) : null;
  return <section className="study-operations" aria-labelledby="operations-title">
    <div className="participant-records-toolbar"><h3 id="operations-title">Enrollments{data?.participants.length > 0 && <span className="record-count">{data.participants.length}</span>}</h3>
      <div className="study-actions"><Button type="button" className="study-secondary" aria-label="Refresh progress" aria-busy={refreshing} disabled={refreshing || Boolean(busy)} onClick={() => {
          setError('');
          load(!data);
        }} variant="outline" size="auto">{refreshing ? <><Skeleton className="edu-skeleton--button" />Refreshing…</> : 'Refresh'}</Button>{data?.participants.length > 0 && <Button type="button" className="study-secondary" disabled={refreshing || Boolean(busy)} onClick={download} variant="outline" size="auto">Download completion handoff</Button>}</div>
    </div>
    {error && <p className="study-error" role="alert">{error}</p>}{notice && <p className="study-note" role="status">{notice}</p>}
    {!data ? refreshing || !error ? <LoadingSkeleton variant="cards" rows={1} label="Loading enrollments…" /> : <Button type="button" className="study-secondary" onClick={() => {
      setError('');
      load(true);
    }} variant="outline" size="auto">Retry loading operations</Button> : <>
      {(refreshing || busy) && <LoadingSkeleton variant="inline" label={busy === 'settings' ? 'Saving operations settings…' : busy ? 'Recording handoff status…' : 'Refreshing progress…'} />}
      {data.participants.length > 0 && <ul className="participant-records-summary" aria-label="Enrollment summary">{[['enrolled', metrics.enrolled], ['started', metrics.started], ['completed', metrics.completed], ['overdue', metrics.overdue]].map(([label, value]) => <li key={label}><strong>{value}</strong> {label}</li>)}</ul>}
      {data.recruitment_target > 0 && <div className="study-recruitment-progress"><Label htmlFor="recruitment-progress">{metrics.enrolled} of {data.recruitment_target} target enrollments</Label><Progress id="recruitment-progress" max={data.recruitment_target} value={Math.min(metrics.enrolled, data.recruitment_target)} /></div>}
      {data.unlinked_responses > 0 && <p className="study-help unlinked-response-note">{data.unlinked_responses} {data.unlinked_responses === 1 ? 'submission has' : 'submissions have'} no enrollment record. <Button onClick={onOpenResponses} variant="link" size="auto">View responses</Button></p>}
      <Card className="study-panel study-enrollment-panel" as="div">
        {data.participants.length ? <div className="study-table-scroll"><Table className="study-enrollment-table" containerClassName="contents"><TableCaption className="sr-only">Enrollment completion and compensation or credit handoff status</TableCaption><TableHeader><TableRow><TableHead scope="col">Study reference</TableHead><TableHead scope="col">Version</TableHead><TableHead scope="col">Activity progress</TableHead><TableHead scope="col">Compensation or credit</TableHead></TableRow></TableHeader><TableBody>
          {data.participants.map(participant => <TableRow key={participant.id}><TableCell><strong>{participant.participant_reference}</strong><small>Joined {new Date(participant.joined_at).toLocaleDateString()}</small></TableCell><TableCell>Version {participant.version_number}</TableCell><TableCell><strong>{enrollmentComplete(participant) ? 'Completed' : participant.overdue_count ? `${participant.overdue_count} overdue` : participant.started ? 'In progress' : 'Joined'}</strong><small>{participant.completed_required} of {participant.required_count} required · {participant.completed_activities} of {participant.activity_count} total</small></TableCell><TableCell>
            {canEdit ? <NativeSelect aria-label={`Handoff status for ${participant.participant_reference}`} disabled={Boolean(busy)} value={participant.reward_status} onChange={event => recordReward(participant, event.target.value)}>{Object.entries(rewardStatuses).map(([value, label]) => <NativeSelectOption value={value} key={value}>{label}</NativeSelectOption>)}</NativeSelect> : rewardStatuses[participant.reward_status]}
            {participant.reward_updated_at && <small>Recorded {new Date(participant.reward_updated_at).toLocaleString()}</small>}
          </TableCell></TableRow>)}
        </TableBody></Table></div> : <div className="participant-empty-state"><p>No enrollments yet.</p><p className="study-help">Screened and multi-activity participants appear after they consent and join.</p></div>}
      </Card>
      <details className="study-operations-settings"><summary>{canEdit ? 'Recruitment target and coordinator notes' : 'View operations settings'}</summary>
        <form onSubmit={save}><fieldset disabled={!canEdit || Boolean(busy)} className="study-unframed-fieldset">
          <div className="study-field"><Label htmlFor="recruitment-target">Recruitment target (enrollments)</Label><Input id="recruitment-target" type="number" min={0} max={1000000} step={1} required value={settings.target} onChange={event => setSettings(current => ({
                ...current,
                target: event.target.value
              }))} /><p className="study-help">Use 0 until a target is set.</p></div>
          <div className="study-field"><Label htmlFor="coordinator-notes">Coordinator notes</Label><Textarea id="coordinator-notes" rows={3} maxLength={5000} value={settings.notes} onChange={event => setSettings(current => ({
                ...current,
                notes: event.target.value
              }))} /><p className="study-help">Team only; excluded from participant pages and exports.</p></div>
          {canEdit && <Button type="submit" className="study-primary" aria-busy={busy === 'settings'} variant="default" size="auto">{busy === 'settings' ? <><Skeleton className="edu-skeleton--button" />Saving…</> : 'Save operations settings'}</Button>}
        </fieldset></form>
        {canEdit && error && <Button type="button" className="study-text-button" disabled={refreshing || Boolean(busy)} onClick={() => {
          setError('');
          load(true);
        }} variant="link" size="auto">Replace settings with the latest saved version</Button>}
      </details>
      <ContextHelp title="About enrollments and handoffs"><p>Each enrollment is counted once across its published activity plan. Single-activity and historical submissions without enrollment records remain under Responses; they are not enrollment totals.</p><p>Compensation and credit use your existing process. Handoff statuses are coordinator records. These counts do not deduplicate people who join more than once.</p></ContextHelp>
    </>}
  </section>;
}
