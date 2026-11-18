import React, { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuArrowRight, LuChevronDown, LuEye, LuRefreshCw } from 'react-icons/lu';
import { submissionsToCsv, participantDetails } from '../utils/participantData';
import { findingsEntries, findingsUrl, nextStudyAction, studyReadiness, studySnapshot, studyWork } from '../utils/studyWorkflow';
import { runKey } from '../utils/analysisHistory';
import { analysisTask } from '../utils/analysisWorkflow';
import StudyForm from './StudyForm';
import StudyTeam from './StudyTeam';
import StudyParticipants from './StudyParticipants';
import StudyOverview from './StudyOverview';
import StudyDesignSummary from './StudyDesignSummary';
import StudyPreview from './StudyPreview';
import { StudyStatus } from './ResearchDashboard';
import { responsesToCsv } from '../utils/studyResponses';
import { studyLink } from '../appUrls';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { Button } from "@eduthemes/ui/components/button";
import { Badge } from "@eduthemes/ui/components/badge";
import { Label } from "@eduthemes/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Card } from "@eduthemes/ui/components/card";
import { ContextHelp } from '@eduthemes/ui/workbench';
const sections = [['overview', 'Overview'], ['design', 'Study setup'], ['recruit', 'Participants'], ['collect', 'Responses'], ['analysis', 'Analysis'], ['team-coding', 'Team coding'], ['findings', 'Findings'], ['participant-results', 'Participant results'], ['settings', 'Team & settings']];
const secondarySections = new Set(['team-coding', 'participant-results', 'settings']);
const fileSections = sections.filter(([key]) => ['collect', 'analysis', 'team-coding', 'findings', 'settings'].includes(key));
const fileSecondarySections = new Set(['settings']);
const TeamCoding = lazy(() => import('./TeamCoding'));
const StudyFindings = lazy(() => import('./StudyFindings'));
const StudyResultsSharing = lazy(() => import('./StudyResultsSharing'));
export default function StudyWorkspace({
  study,
  user,
  versions,
  view,
  setView,
  questions,
  responses,
  analyses,
  members,
  role,
  saving,
  refreshing,
  startingQuestionId,
  saveDraft,
  setStatus,
  copyLink,
  load,
  setError,
  setNotice,
  launchAnalysis
}) {
  const [preview, setPreview] = useState(false),
    [copying, setCopying] = useState(false);
  const [params, setParams] = useSearchParams();
  const fileStudy = study.source_type === 'file';
  const navigation = fileStudy ? fileSections : sections;
  const moreSections = fileStudy ? fileSecondarySections : secondarySections;
  const section = navigation.some(([key]) => key === params.get('section')) ? params.get('section') : fileStudy ? 'analysis' : 'overview';
  const moreNavigation = useRef(null);
  useEffect(() => {
    const closeOutside = event => {
      const menu = moreNavigation.current;
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  useEffect(() => {
    if (moreNavigation.current) moreNavigation.current.open = false;
  }, [section]);
  const content = useRef(null),
    previousSection = useRef(section);
  useLayoutEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    if (section === 'design') return; // The editor and design summary handle their own destinations.
    content.current?.scrollIntoView({
      block: 'start',
      behavior: 'instant'
    });
    const heading = content.current?.querySelector('h2,h3');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({
        preventScroll: true
      });
    }
  }, [section]);
  const select = (value, setup, resetVersion = false) => {
    if (moreNavigation.current) moreNavigation.current.open = false;
    setParams(previous => {
      const next = new URLSearchParams(previous);
      next.set('section', value);
      if (setup) next.set('setup', setup);else next.delete('setup');
      if (resetVersion) next.delete('version');
      return next;
    });
    if (['collect', 'analysis', 'findings', 'participant-results'].includes(value)) load();
  };
  const openedHash = useRef('');
  useEffect(() => {
    const hash = window.location.hash;
    if (section !== 'collect' || !hash || openedHash.current === hash) return;
    const target = document.getElementById(hash.slice(1));
    if (target) {
      openedHash.current = hash;
      target.closest('details')?.setAttribute('open', '');
      target.scrollIntoView({
        block: 'center'
      });
      target.tabIndex = -1;
      target.focus({
        preventScroll: true
      });
    }
  }, [section, responses]);
  const selected = versions.find(version => version.id === view),
    canEdit = ['owner', 'researcher'].includes(role);
  const snapshot = studySnapshot(study, selected, questions, view),
    readiness = studyReadiness(snapshot),
    work = studyWork(questions, responses, analyses),
    findings = findingsEntries(work);
  const nextAction = nextStudyAction({
    study,
    view,
    role,
    readiness,
    work
  });
  const historical = view !== 'draft' && view !== study.current_version_id;
  const editingDraft = study.status === 'draft' && view === 'draft' && canEdit && section === 'design';
  const publish = async () => {
    if (await setStatus('open')) select('collect', undefined, true);
  };
  const action = () => nextAction.kind === 'publish' ? publish() : select(nextAction.section, nextAction.setup);
  const copy = async () => {
    setCopying(true);
    try {
      await copyLink();
    } finally {
      setCopying(false);
    }
  };
  const questionAction = (item, primary = true) => {
    const task = analysisTask(item);
    if (task.kind === 'findings') return <Button asChild variant={primary ? 'default' : 'outline'} size="auto"><Link className={primary ? 'study-primary' : 'study-secondary'} to={findingsUrl(study.id, view, item.question.id, runKey(item.runs[0]))}>Open findings<span className="sr-only"> for {item.question.prompt}</span></Link></Button>;
    if (task.kind === 'collect') return null;
    if (!canEdit) return <Button className="study-secondary" onClick={() => select('collect')} variant="outline" size="auto">View responses<span className="sr-only"> for {item.question.prompt}</span></Button>;
    return <Button className="study-primary" disabled={saving || refreshing} aria-busy={startingQuestionId === item.question.id} onClick={() => launchAnalysis(item.question, item.analysis?.stage !== 'results' ? item.analysis : null)} variant="default" size="auto">{startingQuestionId === item.question.id ? <><Skeleton className="edu-skeleton--button" />Opening coding…</> : <>{task.label}<LuArrowRight aria-hidden="true" /></>}<span className="sr-only"> for {item.question.prompt}</span></Button>;
  };
  const downloadResponses = () => {
    const url = URL.createObjectURL(new Blob([fileStudy ? responsesToCsv(responses.map(row => row.answers[questions[0].id])) : submissionsToCsv(responses, questions)], {
      type: 'text/csv;charset=utf-8'
    }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileStudy ? 'imported-responses.csv' : `${study.share_code}-v${selected?.version_number || 'draft'}-responses.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <>
    <header className="study-hero study-workspace-header"><div className="study-title-row"><h1>{snapshot?.title || study.title}</h1>{fileStudy ? <Badge variant="secondary">Imported file</Badge> : historical ? <Badge variant="secondary">Historical version</Badge> : view !== 'draft' && study.status === 'draft' ? <Badge variant="secondary">Published version</Badge> : <StudyStatus status={study.status} />}</div><div className="study-workspace-tools">
      {!fileStudy && versions.length > 0 && <Label className="version-control"><span className="sr-only">Study version</span><NativeSelect aria-label="Study version" value={view} disabled={saving} onChange={event => {
            setView(event.target.value);
            setParams(previous => {
              const next = new URLSearchParams(previous);
              next.set('version', event.target.value);
              next.delete('setup');
              next.delete('round');
              return next;
            });
          }}>{study.status === 'draft' && <NativeSelectOption value="draft">Draft</NativeSelectOption>}{versions.map(version => <NativeSelectOption key={version.id} value={version.id}>v{version.version_number}{version.id === study.current_version_id ? ' · current' : ''}</NativeSelectOption>)}</NativeSelect></Label>}
      {!fileStudy && !editingDraft && <Button className="study-secondary" disabled={!snapshot || saving} onClick={() => setPreview(true)} variant="outline" size="auto"><LuEye aria-hidden="true" />Participant preview</Button>}
    </div></header>
    {historical && <p className="study-version-notice" role="note">You are viewing an earlier published version. Its design, responses, and findings are preserved. The participant link always opens the current published version.</p>}
    <nav className="study-section-nav study-workspace-nav" aria-label="Study sections">
      <Label className="study-section-picker">Study section<NativeSelect value={section} onChange={event => select(event.target.value)}>{navigation.map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Label>
      <div className="study-section-buttons">
        {navigation.filter(([value]) => !moreSections.has(value)).map(([value, label]) => <Button type="button" key={value} aria-current={section === value ? 'page' : undefined} onClick={() => select(value)} variant="ghost" size="auto">{label}{value === 'findings' && findings.length > 0 && <span className="study-nav-count">{findings.length}</span>}</Button>)}
        <details className={`study-more-nav${moreSections.has(section) ? ' is-active' : ''}`} ref={moreNavigation} onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}>
          <summary>{moreSections.has(section) ? navigation.find(([value]) => value === section)[1] : 'More'}<LuChevronDown aria-hidden="true" /></summary>
          <div className="study-more-options">{navigation.filter(([value]) => moreSections.has(value)).map(([value, label]) => <Button type="button" key={value} aria-current={section === value ? 'page' : undefined} onClick={() => select(value)} variant="ghost" size="auto">{label}</Button>)}</div>
        </details>
      </div>
    </nav>
    <div className="study-workspace-content" ref={content}>
      {section === 'overview' && <StudyOverview study={study} snapshot={snapshot} role={role} readiness={readiness} work={work} findings={findings} submissionCount={responses.length} nextAction={nextAction} onAction={action} onSelect={select} renderQuestionAction={item => questionAction(item, analysisTask(item).kind !== 'findings')} historical={historical} saving={saving} refreshing={refreshing} />}
      {section === 'design' && (study.status === 'draft' && view === 'draft' && canEdit ? <StudyForm key={`${study.id}:${study.draft_revision}`} initial={{
        ...study,
        questions: questions.map(q => q.prompt)
      }} initialSection={params.get('setup') || 'design'} draftKey={`${user.id}:${study.id}`} onSave={saveDraft} onCancel={() => select('overview')} saving={saving} /> : <StudyDesignSummary snapshot={snapshot} initialSection={params.get('setup')} onPreview={() => setPreview(true)} />)}
      {section === 'recruit' && <StudyParticipants key={study.id} study={study} snapshot={snapshot} role={role} onSelect={select} />}
      {section === 'collect' && <>
        <div className="study-section-heading"><h2>{fileStudy ? 'Imported responses' : 'Participant access and responses'}</h2><Button className="study-secondary" disabled={refreshing || saving} aria-busy={refreshing} onClick={load} variant="outline" size="auto">{refreshing ? <><Skeleton className="edu-skeleton--button" />Refreshing…</> : <><LuRefreshCw aria-hidden="true" />Refresh responses</>}</Button></div>
        {!fileStudy && (study.status === 'draft' ? <Card className="study-panel study-flow-empty" as="section"><h3>Prepare the study before sharing</h3><p>The public link is paused while the next draft is in preparation. Earlier responses remain available in their published versions.</p><Button className="study-primary" onClick={() => select('overview')} variant="default" size="auto">Review study readiness<LuArrowRight aria-hidden="true" /></Button></Card> : <Card className="study-panel share-panel" as="section"><div><span className="study-eyebrow">Current participant link</span><h3>{study.status === 'open' ? 'Ready to share' : 'Collection is closed'}</h3><p>{study.status === 'open' ? snapshot?.recruitment?.enabled ? 'Volunteers review the study, complete screening, and wait for an invitation.' : 'Participants review the study information and consent before answering.' : 'The link is not accepting new participation. Saved progress and receipts remain available.'}</p><a href={studyLink(study.share_code)} target="_blank" rel="noreferrer">{studyLink(study.share_code)}</a><div className="study-share-code">Study code <code>{study.share_code}</code></div></div><div className="study-actions"><Button className="study-primary" disabled={copying} aria-busy={copying} onClick={copy} variant="default" size="auto">{copying ? <><Skeleton className="edu-skeleton--button" />Copying link…</> : 'Copy participant link'}</Button></div></Card>)}
        {refreshing && !responses.length ? <LoadingSkeleton variant="responses" label="Loading study responses…" /> : <Card className="study-panel" as="section"><div className="study-section-heading"><div><h3>Responses · {responses.length} {fileStudy ? (responses.length === 1 ? 'imported response' : 'imported responses') : (responses.length === 1 ? 'submission' : 'submissions')}</h3></div><Button className="study-secondary" disabled={!responses.length} onClick={downloadResponses} variant="outline" size="auto">{fileStudy ? 'Download responses' : 'Download responses & consent'}</Button></div>{!responses.length ? <div className="study-flow-empty"><h3>No submissions in this version yet</h3><p>{study.status === 'open' ? 'Share the participant link or review recruitment to see who is ready to join.' : 'Saved responses appear here when participants submit to this version.'}</p>{study.status === 'open' && <Button className="study-secondary" onClick={() => select('recruit')} variant="outline" size="auto">Open recruitment</Button>}</div> : work.map(item => {
            const {
              question,
              count
            } = item;
            return <article className="study-response-group" key={item.question.id}><div className="study-section-heading"><div><h3>{item.question.prompt}</h3><p>{item.count} {item.count === 1 ? 'response' : 'responses'} · {analysisTask(item).detail}</p></div>{questionAction(item)}</div><details className="study-response-question"><summary>View {item.count} {item.count === 1 ? 'response' : 'responses'}</summary><ol>{responses.filter(response => response.answers?.[question.id]?.trim()).map(response => <li key={response.id} id={`response-${response.id}`}><p>{response.answers[question.id]}</p>{!fileStudy && <small>{response.consent_accepted_at ? `Consent accepted ${new Date(response.consent_accepted_at).toLocaleString()}` : 'No recorded consent (legacy)'}</small>}{response.participant_data?.source === 'canvas' && <details><summary>Canvas participant details</summary><dl>{participantDetails(response.participant_data).map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl></details>}</li>)}</ol></details></article>;
          })}</Card>}
        <ContextHelp title="About these responses">{fileStudy ? <p>Responses come from the imported file. Document recruitment, consent, and the source of the data in the report methods.</p> : <p>Responses and consent records belong to the selected study version. One participant can submit multiple activities.</p>}</ContextHelp>
      </>}
      {section === 'analysis' && <section className="study-analysis-queue"><div className="study-section-heading"><h2>Code, classify, and review</h2><Button className="study-secondary" disabled={refreshing || saving} aria-busy={refreshing} onClick={load} variant="outline" size="auto">{refreshing ? <><Skeleton className="edu-skeleton--button" />Refreshing…</> : 'Refresh responses'}</Button></div>
        {!selected ? <Card className="study-panel study-flow-empty" as="section"><h3>Publish before collecting research responses</h3><p>Preview the participant experience and review study readiness first.</p><Button className="study-primary" onClick={() => select('overview')} variant="default" size="auto">Open study overview</Button></Card> : refreshing && !responses.length ? <LoadingSkeleton variant="responses" label="Checking the current analysis work queue…" /> : work.map(item => <Card className="study-panel analysis-question-card" key={item.question.id} as="article"><div className="study-section-heading"><div><span className="study-eyebrow">Question {questions.indexOf(item.question) + 1} · {item.count} responses</span><h3>{item.question.prompt}</h3>{(!item.count || item.newCount > 0) && <p>{analysisTask(item).detail}</p>}</div>{questionAction(item)}</div>
          <div className="study-actions">{item.runs.length > 0 && analysisTask(item).kind !== 'findings' && <Button asChild variant="link"><Link className="study-text-button" to={findingsUrl(study.id, view, item.question.id, runKey(item.runs[0]))}>View earlier findings</Link></Button>}{!item.count && study.status === 'open' && <Button className="study-secondary" onClick={() => select('collect')} variant="outline" size="auto">Share study to collect responses</Button>}{canEdit && item.count > 0 && item.runs.length > 0 && item.analysis?.stage === 'results' && <details className="study-question-options"><summary>More analysis options</summary><Button className="study-secondary" disabled={saving || refreshing} onClick={() => launchAnalysis(item.question, null)} variant="outline" size="auto">Start a new run<span className="sr-only"> for {item.question.prompt}</span></Button><p className="study-help">Use this to try a different codebook. Earlier findings remain saved.</p></details>}</div></Card>)}
        {selected && <aside className="study-panel analysis-verification"><div><h3>Compare independent human coding</h3><p>Assign the same sample to another coder, compare original choices, and review agreement before resolving differences.</p></div><Button className="study-secondary" onClick={() => select('team-coding')} variant="outline" size="auto">Open team coding<LuArrowRight aria-hidden="true" /></Button></aside>}
        <ContextHelp title="About the coding workflow"><p>Define themes and code examples, review suggested assignments, then inspect findings. Earlier saved runs remain available while another analysis is in progress.</p></ContextHelp>
      </section>}
      {section === 'team-coding' && <Suspense fallback={<LoadingSkeleton variant="responses" label="Opening team coding…" />}><TeamCoding key={`${study.id}:${view}`} study={study} view={view} questions={questions} responses={responses} analyses={analyses} members={members} user={user} role={role} launchAnalysis={launchAnalysis} openTeamSettings={() => select('settings')} /></Suspense>}
      {section === 'findings' && snapshot && <Suspense fallback={<LoadingSkeleton variant="results" label="Opening the findings workspace…" />}><StudyFindings key={`${study.id}:${view}`} study={study} snapshot={snapshot} view={view} work={work} refreshing={refreshing} onSelect={select} /></Suspense>}
      {section === 'participant-results' && <Suspense fallback={<LoadingSkeleton variant="form" label="Opening participant results…" />}><StudyResultsSharing key={`${study.id}:${view}`} study={study} view={view} work={work} role={role} /></Suspense>}
      {section === 'settings' && <><div className="study-section-intro"><h2>Team & settings</h2><p>{fileStudy ? 'Manage access to imported responses and findings.' : 'Manage access, collection, and future versions.'}</p></div><StudyTeam study={study} members={members} role={role} onChanged={load} onError={setError} onNotice={setNotice} />{!fileStudy && role === 'owner' && <Card className="study-panel study-closeout" as="section"><h2>Collection and next version</h2><p>{study.status === 'open' ? 'Close collection to stop new submissions. Saved work remains available.' : study.status === 'closed' ? 'Reopen this version or prepare a new draft.' : 'The draft is private until published.'}</p><div className="study-actions">{study.status !== 'draft' && <Button className="study-secondary" disabled={saving} aria-busy={saving} onClick={() => setStatus(study.status === 'open' ? 'closed' : 'open')} variant="outline" size="auto">{saving ? <><Skeleton className="edu-skeleton--button" />Updating collection…</> : study.status === 'open' ? 'Close collection' : 'Reopen collection'}</Button>}{study.status === 'closed' && <Button className="study-primary" disabled={saving} aria-busy={saving} onClick={async () => {
              if (await setStatus('draft')) {
                setParams(previous => {
                  const next = new URLSearchParams(previous);
                  next.set('section', 'design');
                  next.set('version', 'draft');
                  next.delete('setup');
                  return next;
                });
              }
            }} variant="default" size="auto">{saving ? <><Skeleton className="edu-skeleton--button" />Preparing draft…</> : 'Prepare next version'}</Button>}</div></Card>}</>}
    </div>
    <StudyPreview show={preview} onHide={() => setPreview(false)} study={snapshot} />
  </>;
}
