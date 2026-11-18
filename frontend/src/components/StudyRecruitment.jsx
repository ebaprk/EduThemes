import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { applicationIsStale, recruitmentCounts, recruitmentStatuses } from '../utils/recruitment';
import { Button } from "@eduthemes/ui/components/button";
import { Card } from "@eduthemes/ui/components/card";
import { Label } from "@eduthemes/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@eduthemes/ui/components/table";
import { Textarea } from "@eduthemes/ui/components/textarea";
import { ContextHelp } from '@eduthemes/ui/workbench';
export default function StudyRecruitment({
  study,
  role,
  onRefreshed,
  screeningEnabled,
  onOpenResponses
}) {
  const [data, setData] = useState(null),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState(null);
  const [note, setNote] = useState(''),
    [decision, setDecision] = useState('eligible'),
    [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const generation = useRef(0);
  const reviewPanel = useRef(null);
  const canEdit = ['owner', 'researcher'].includes(role);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setRefreshing(true);
    try {
      const result = await supabase.rpc('get_study_recruitment', {
        p_study_id: study.id
      });
      if (request !== generation.current) return;
      if (result.error) throw result.error;
      setData(result.data);
    } catch (failure) {
      if (request === generation.current) setError(failure.message || 'Could not load recruitment.');
    } finally {
      if (request === generation.current) setRefreshing(false);
    }
  }, [study.id]);
  useEffect(() => {
    setData(null);
    setSelected(null);
    setError('');
    load();
    return () => {
      generation.current += 1;
    };
  }, [load]);
  const open = applicant => {
    setSelected(applicant);
    setNote(applicant.review_note);
    setDecision(applicant.decision === 'invited' ? 'invited' : 'eligible');
    setError('');
    setNotice('');
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 1100px)').matches) reviewPanel.current?.scrollIntoView({block:'start',behavior:'instant'});
      reviewPanel.current?.focus({preventScroll:true});
    });
  };
  const save = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const current = selected;
    try {
      const result = await supabase.rpc('review_study_applicant', {
        p_applicant_id: current.id,
        p_status: decision,
        p_note: note,
        p_expected_revision: current.revision
      });
      if (result.error) throw result.error;
      setSelected({
        ...current,
        decision,
        status: decision,
        review_note: note,
        revision: result.data
      });
      setNotice(`${current.reference}: ${recruitmentStatuses[decision].toLowerCase()} recorded. Participants see their status in their private hub.`);
      await load();
    } catch (failure) {
      setError(failure.message || 'Could not record this review. Your note is still here.');
    } finally {
      setBusy(false);
    }
  };
  const latest = selected && data?.applicants.find(a => a.id === selected.id);
  const stale = applicationIsStale(selected, latest);
  const counts = data ? recruitmentCounts(data.applicants) : {};
  const filtered = data?.applicants.filter(a => filter === 'all' || a.status === filter) || [];
  return <section className="study-recruitment" aria-labelledby="recruitment-heading">
    <div className="participant-records-toolbar"><h3 id="recruitment-heading">Applications{data?.applicants.length > 0 && <span className="record-count">{data.applicants.length}</span>}</h3>
      <div className="study-actions">{data?.applicants.length > 0 && <NativeSelect aria-label="Filter recruitment status" value={filter} onChange={event => setFilter(event.target.value)}><NativeSelectOption value="all">All applications ({data.applicants.length})</NativeSelectOption>{Object.entries(recruitmentStatuses).map(([status, label]) => <NativeSelectOption key={status} value={status}>{label} ({counts[status]})</NativeSelectOption>)}</NativeSelect>}
        <Button type="button" className="study-secondary" aria-label="Refresh recruitment" disabled={refreshing || busy} aria-busy={refreshing} onClick={async () => {
          setError(''); await load(); onRefreshed?.();
        }} variant="outline" size="auto">{refreshing ? <><Skeleton className="edu-skeleton--button" />Refreshing…</> : 'Refresh'}</Button>
      </div>
    </div>
    {error && <p className="study-error" role="alert">{error}</p>}{notice && <p className="study-note" role="status">{notice}</p>}
    {!data ? refreshing || !error ? <LoadingSkeleton variant="cards" rows={1} label="Loading screening applications…" /> : <Button className="study-secondary" onClick={load} variant="outline" size="auto">Retry recruitment</Button> : <>
      {refreshing && <LoadingSkeleton variant="inline" label="Refreshing recruitment…" />}
      {data.applicants.length > 0 && <ul className="participant-records-summary" aria-label="Application summary"><li><strong>{counts.awaiting_review}</strong> awaiting review</li><li><strong>{counts.invited}</strong> invited</li><li><strong>{counts.enrolled + counts.completed}</strong> joined</li></ul>}
      <div className={`recruitment-workspace${selected ? ' has-selection' : ''}`}><Card className="study-panel recruitment-applications" as="section" aria-label="Application list">
        {filtered.length ? <div className="study-table-scroll"><Table className="recruitment-table" containerClassName="contents"><TableCaption className="sr-only">Screening applications and current recruitment status</TableCaption><TableHeader><TableRow><TableHead scope="col">Reference</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col">Rule check</TableHead><TableHead scope="col">Review</TableHead></TableRow></TableHeader><TableBody>{filtered.map(applicant => <TableRow key={applicant.id}><TableCell><strong>{applicant.reference}</strong><small>Version {applicant.version_number}{!applicant.current_version ? ' · earlier version' : ''}</small><small>{new Date(applicant.screened_at).toLocaleDateString()}</small></TableCell><TableCell>{recruitmentStatuses[applicant.status]}</TableCell><TableCell>{applicant.rule_result === 'matches' ? 'Matches criteria' : 'Needs review'}</TableCell><TableCell><Button className="study-secondary" disabled={busy} aria-label={`Open ${applicant.reference}`} onClick={() => open(applicant)} variant="outline" size="auto">Review</Button></TableCell></TableRow>)}</TableBody></Table></div>
          : <div className="participant-empty-state"><p>{data.applicants.length ? 'No applications at this stage.' : 'No applications yet.'}</p><p className="study-help">{data.applicants.length ? 'Choose another status to see more applications.' : screeningEnabled ? 'Applications appear after volunteers submit screening answers.' : 'Screening is off for this version. Submitted answers are under Responses.'}</p>{!data.applicants.length && <Button variant="outline" size="auto" onClick={onOpenResponses}>{screeningEnabled && study.status === 'open' ? 'Share study' : 'View responses'}</Button>}</div>}
      </Card>{selected && <Card ref={reviewPanel} tabIndex={-1} className="study-panel recruitment-review" aria-labelledby="application-review-heading" as="section"><div><h3 id="application-review-heading">{selected.reference}</h3>
        <p className="application-review-meta">Version {selected.version_number} · {recruitmentStatuses[latest?.status || selected.status]}</p></div>
        <dl className="screening-answer-list">{selected.questions.filter(question => selected.answers[question.id]).map(question => <div key={question.id}><dt>{question.prompt}</dt><dd>{question.options.find(option => option.id === selected.answers[question.id])?.label || 'Recorded choice'}</dd></div>)}</dl>
        {stale && <p className="study-note">This application changed. Your note is preserved; open the latest application before recording a decision.</p>}
        {!selected.current_version && <p className="study-note">This earlier-version application cannot receive an invitation to the current version.</p>}
        {canEdit && !['enrolled', 'completed'].includes(latest?.status || selected.status) && <form onSubmit={save}><fieldset className="study-unframed-fieldset" disabled={busy}>
          <div className="study-field"><Label htmlFor="recruitment-decision">Review decision</Label><NativeSelect id="recruitment-decision" value={decision} onChange={event => setDecision(event.target.value)}>{['eligible', 'waitlisted', 'not_eligible', 'awaiting_review', ...(selected.decision === 'eligible' || selected.decision === 'invited' ? ['invited'] : [])].map(status => <NativeSelectOption key={status} value={status}>{recruitmentStatuses[status]}</NativeSelectOption>)}</NativeSelect></div>
          <div className="study-field"><Label htmlFor="recruitment-note">Private review note (optional)</Label><Textarea id="recruitment-note" value={note} maxLength={2000} rows={3} onChange={event => setNote(event.target.value)} /><p className="study-help">Team only; excluded from participant updates and research analysis.</p></div>
          {decision === 'invited' && <p className="study-help">Inviting enables access in the private hub. No email is sent.</p>}
          <Button className="study-primary" type="submit" disabled={Boolean(stale) || decision === 'invited' && (!selected.current_version || study.status !== 'open')} aria-busy={busy} size="auto">{busy ? <><Skeleton className="edu-skeleton--button" />Recording review…</> : 'Record decision'}</Button>
          {!['eligible', 'invited'].includes(selected.decision) && <p className="study-help">Record eligibility before inviting this volunteer.</p>}
        </fieldset></form>}
        {stale && latest && <Button className="study-secondary" disabled={busy} onClick={() => open(latest)} variant="outline" size="auto">Open latest application</Button>}
        <ContextHelp title="About screening decisions"><p>Rule checks support review; a researcher decides eligibility. Invitations enable joining but do not send email. {data.target > 0 && `The enrollment target is ${data.target}; it does not automatically invite or reject volunteers.`}</p></ContextHelp>
        {latest?.events?.length > 0 && <details><summary>Review history · {latest.events.length}</summary><ol>{latest.events.map((event, index) => <li key={index}><strong>{recruitmentStatuses[event.status]}</strong> · {new Date(event.recorded_at).toLocaleString()}{event.note && <p>{event.note}</p>}</li>)}</ol></details>}
      </Card>}</div>
    </>}
  </section>;
}
