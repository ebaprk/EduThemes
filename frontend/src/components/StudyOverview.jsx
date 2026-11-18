import React from 'react';
import { LuCheck } from 'react-icons/lu';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { analysisTask } from '../utils/analysisWorkflow';
import { Card } from '@eduthemes/ui/components/card';
import { Button } from '@eduthemes/ui/components/button';

export default function StudyOverview({
  study, snapshot, role, readiness, work, findings, submissionCount,
  nextAction, onAction, onSelect, renderQuestionAction, historical,
  saving, refreshing
}) {
  const canEdit = ['owner', 'researcher'].includes(role);
  const draft = study.status === 'draft' && snapshot?.isDraft;
  const required = readiness.filter(item => item.required);
  const answered = work.filter(item => item.count > 0);
  const pending = answered.filter(item => analysisTask(item).kind !== 'findings');
  const completed = answered.filter(item => analysisTask(item).kind === 'findings');
  const waitingForResponses = refreshing && !submissionCount;
  const actionButton = <Button className="study-primary" disabled={saving || refreshing}
    aria-busy={saving && nextAction.kind === 'publish'} onClick={onAction} size="auto">
    {saving && nextAction.kind === 'publish' ? <><Skeleton className="edu-skeleton--button" />Publishing…</> : nextAction.label}
  </Button>;
  const questionRows = items => <ul className="study-question-list">{items.map(item => {
    const task = analysisTask(item);
    const status = task.kind === 'findings' ? 'Findings saved'
      : task.kind === 'resume' ? item.analysis.stage === 'review' ? 'Review in progress' : 'Coding in progress'
      : item.newCount > 0 ? `${item.newCount} new since the saved run` : 'Ready for coding';
    return <li className="work-queue-row" key={item.question.id}>
      <div><h3>{item.question.prompt}</h3><p>{item.count} {item.count === 1 ? 'response' : 'responses'}<span aria-hidden="true"> · </span><span>{status}</span></p></div>
      {renderQuestionAction(item)}
    </li>;
  })}</ul>;

  return <div className="study-overview-layout">
    {waitingForResponses && !draft ? <LoadingSkeleton variant="inline" label="Updating study summary…" />
      : <ul className="study-overview-summary" aria-label="Study summary">
        <li><strong>{snapshot?.activities?.length || 0}</strong> {snapshot?.activities?.length === 1 ? 'activity' : 'activities'}</li>
        {draft ? <li><strong>{work.length}</strong> {work.length === 1 ? 'question' : 'questions'}</li> : <>
          <li><strong>{submissionCount}</strong> {submissionCount === 1 ? 'submission' : 'submissions'}</li>
          <li><strong>{answered.length}</strong> {answered.length === 1 ? 'question' : 'questions'} with responses</li>
          <li><strong>{findings.length}</strong> saved {findings.length === 1 ? 'analysis' : 'analyses'}</li>
        </>}
      </ul>}

    {draft ? <Card className="study-panel launch-readiness" aria-labelledby="launch-readiness-heading" as="section">
      <div className="study-section-heading"><div><h2 id="launch-readiness-heading">Study readiness</h2>
        <p>{required.filter(item => item.done).length} of {required.length} required items ready. Review the participant experience before publishing.</p>
      </div>{actionButton}</div>
      <ul className="study-readiness-list">{readiness.map(item => <li key={item.id}>
        <span className={`readiness-indicator${item.done ? ' is-ready' : ''}`} aria-label={item.done ? 'Ready' : 'Not added'}>{item.done ? <LuCheck aria-hidden="true" /> : <span aria-hidden="true" />}</span>
        <div><strong>{item.title}<small>{item.required ? 'Required' : 'Recommended'}</small></strong><p>{item.detail}</p></div>
        <Button type="button" onClick={() => onSelect('design', item.setup)} variant="link" size="auto">{canEdit ? item.done ? 'Review' : 'Add details' : 'View details'}</Button>
      </li>)}</ul>
      <div className="launch-readiness-footer"><p className="study-help">Publishing freezes this design, activity plan, screening, and consent as a new version.</p>
        {role !== 'owner' && <p className="study-help">The study owner publishes when the team is ready.</p>}
      </div>
    </Card> : waitingForResponses ? <LoadingSkeleton variant="cards" rows={1} label="Loading question responses…" />
      : answered.length > 0 ? <Card className="study-panel study-question-queue" as="section" aria-labelledby="overview-questions-heading">
        <h2 id="overview-questions-heading">{pending.length ? 'Questions to analyze' : 'Completed analyses'}</h2>
        {questionRows(pending.length ? pending : completed)}
        {pending.length > 0 && completed.length > 0 && <div className="study-completed-questions"><h3>Completed</h3>{questionRows(completed)}</div>}
      </Card> : <Card className="study-panel study-overview-empty" as="section">
        <div><h2>{historical || study.status === 'draft' ? 'No responses in this version' : study.status === 'closed' ? 'No responses collected' : 'Awaiting responses'}</h2>
          <p>{historical ? 'This published version has no submitted responses. The participant link opens the current version.' : nextAction.detail}</p>
        </div>{historical ? <Button variant="outline" size="auto" onClick={() => onSelect('collect')}>View version responses</Button> : actionButton}
      </Card>}
  </div>;
}
