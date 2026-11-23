import { FeatureHelp } from '@eduthemes/ui/components/feature-help';
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuArrowDownUp, LuArrowRight, LuArrowUpRight, LuFlaskConical, LuFolder, LuLayoutGrid, LuList, LuPlus, LuSearch, LuUpload, LuUsers, LuX } from 'react-icons/lu';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { Badge } from "@eduthemes/ui/components/badge";
import { Button } from "@eduthemes/ui/components/button";
import { Card } from "@eduthemes/ui/components/card";
import { Label } from "@eduthemes/ui/components/label";
import { Input } from "@eduthemes/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@eduthemes/ui/components/table";
const filters = [['all', 'All studies'], ['open', 'Collecting'], ['draft', 'Drafts'], ['closed', 'Closed'], ['imported', 'Imported']];
const matchesFilter = (study, filter) => filter === 'all' || (study.source_type === 'file' ? filter === 'imported' : study.status === filter);
const statusLabels = {
  open: 'Collecting',
  draft: 'Draft',
  closed: 'Closed'
};
const formatDate = date => new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
}).format(new Date(date));
export function StudyStatus({
  status,
  sourceType
}) {
  if (sourceType === 'file') return <Badge className="study-status" variant="secondary">Imported file</Badge>;
  return <Badge className={`study-status study-status--${status}`} variant="secondary"><span aria-hidden="true" />{statusLabels[status] || status}</Badge>;
}
function studyProgress(study) {
  if (!study.progress_available) return 'Progress unavailable';
  const responseLabel = study.source_type === 'file'
    ? (study.response_count === 1 ? 'imported response' : 'imported responses')
    : (study.response_count === 1 ? 'submission' : 'submissions');
  return `${study.response_count} ${responseLabel} · ${study.pending_count} ${study.pending_count === 1 ? 'analysis' : 'analyses'} in progress · ${study.findings_count} ${study.findings_count === 1 ? 'finding' : 'findings'}`;
}
function StudyLibraryTable({ children, loading = false }) {
  return <div className="study-library-table-wrap"><Table className={`study-library-table${loading ? ' study-library-table--loading' : ''}`} containerClassName="contents">
    {loading && <colgroup>{[29, 12, 9, 39, 11].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>}
    <TableCaption className="sr-only">Your research studies</TableCaption>
    <TableHeader><TableRow>{['Study name', 'Status', 'Access', 'Progress', 'Updated'].map(label => <TableHead scope="col" key={label}>{label}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{children}</TableBody>
  </Table></div>;
}
function StudyLibrarySkeleton({ layout }) {
  return <LoadingSkeleton variant="study-library" className="study-library-loading" label="Loading studies…">
    {layout === 'grid' ? <div className="study-list">{Array.from({ length: 6 }, (_, index) => <div className="study-list-card" key={index}>
      <div className="study-card-top"><Skeleton className="study-loading-icon" /><Skeleton className="study-loading-status" /></div>
      <h3><Skeleton className="study-loading-title" /></h3>
      <p className="study-card-access"><Skeleton className="study-loading-access" /></p>
      <p><Skeleton className="study-loading-progress" /></p>
      <div className="study-card-bottom"><Skeleton className="study-loading-date" /><Skeleton className="study-loading-arrow" /></div>
    </div>)}</div> : <StudyLibraryTable loading>{Array.from({ length: 8 }, (_, index) => <TableRow key={index}>
      <TableCell><span className="study-loading-name"><Skeleton className="study-loading-symbol" /><Skeleton className="study-loading-title" /><Skeleton className="study-loading-arrow" /></span></TableCell>
      <TableCell><Skeleton className="study-loading-status" /></TableCell>
      <TableCell><Skeleton className="study-loading-access" /></TableCell>
      <TableCell><Skeleton className="study-loading-progress" /></TableCell>
      <TableCell><Skeleton className="study-loading-date" /></TableCell>
    </TableRow>)}</StudyLibraryTable>}
  </LoadingSkeleton>;
}
export default function ResearchDashboard({
  studies,
  user,
  loading,
  error,
  onCreate,
  onRetry,
  creating,
  children,
  invitations,
  saving,
  onAcceptInvitation,
  hasActiveAnalysis,
  onResumeAnalysis
}) {
  const [params, setParams] = useSearchParams();
  const requestedStatus = params.get('status') || 'all';
  const status = filters.some(([value]) => value === requestedStatus) ? requestedStatus : 'all';
  const query = params.get('q') || '';
  const [layout, setLayout] = useState(() => {
    try {
      return localStorage.getItem('eduthemes.studyLayout') === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });
  const changeLayout = value => {
    setLayout(value);
    try {
      localStorage.setItem('eduthemes.studyLayout', value);
    } catch {/* Layout changes still work when browser storage is unavailable. */}
  };
  const sort = params.get('sort') || 'newest';
  // Read the current URL so rapid filter/search changes cannot overwrite each other.
  const updateParams = (update, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    update(next);
    setParams(next, {
      replace
    });
  };
  const setQuery = value => updateParams(next => {
    if (value) next.set('q', value);else next.delete('q');
  }, true);
  const setSort = value => updateParams(next => {
    if (value !== 'newest') next.set('sort', value);else next.delete('sort');
  }, true);
  const counts = Object.fromEntries(filters.map(([value]) => [value, studies.filter(study => matchesFilter(study, value)).length]));
  const setFilter = value => updateParams(next => {
    if (value === 'all') next.delete('status');else next.set('status', value);
  });
  const clearFilters = () => updateParams(next => {
    next.delete('q');
    next.delete('status');
  }, true);
  const visible = studies.filter(study => matchesFilter(study, status) && study.title.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : sort === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at));
  if (creating) return <div className="study-creation-workspace">{children}</div>;
  return <>
    <header className="study-hero dashboard-heading"><div><h1>Studies</h1><p>Import a response file to analyze existing data, or create a study to collect responses.</p><FeatureHelp guide="study-library" label="How to use Studies" /></div><div className="study-actions"><Button asChild variant="default" size="auto"><Link className="study-primary" to="/analysis" aria-label="Import response file"><LuUpload aria-hidden="true" />Import file</Link></Button><Button className="study-secondary" onClick={onCreate} variant="outline" size="auto"><LuPlus aria-hidden="true" />Create study</Button></div></header>
    {invitations.length > 0 && <Card className="study-panel study-invitations" as="section"><div className="section-title-with-icon"><LuUsers aria-hidden="true" /><div><h2>You're invited to collaborate</h2><p>Study invitations for {user.email}.</p></div></div>{invitations.map(invitation => <div className="study-inline" key={invitation.id}><div><strong>{invitation.title}</strong><p>Invited as {invitation.role}</p></div><Button type="button" className="study-primary" disabled={saving} aria-busy={saving} onClick={() => onAcceptInvitation(invitation)} variant="default" size="auto">{saving && <Skeleton className="edu-skeleton--button" />}Accept invitation<LuArrowRight aria-hidden="true" /></Button></div>)}</Card>}
    {hasActiveAnalysis && <section className="analysis-resume-banner"><span className="resume-banner-icon"><LuFlaskConical aria-hidden="true" /></span><div><strong>Current analysis</strong><p>Resume saved coding or review.</p></div><Button type="button" className="study-secondary" onClick={onResumeAnalysis} variant="outline" size="auto">Continue analysis<LuArrowRight aria-hidden="true" /></Button></section>}
    {children}
    <div className="dashboard-content"><section className="dashboard-studies" aria-label="Study library">
      <div className="study-library-controls"><div className="study-filter-tabs" aria-label="Filter studies">{filters.map(([value, label]) => <Button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={status === value} className={status === value ? 'is-active' : ''} variant="ghost" size="auto">{label}{value === 'all' && !loading && <span>{counts.all}</span>}</Button>)}</div>
        <div className="study-library-toolbar"><form className="study-search" role="search" aria-label="Study search" onSubmit={event => event.preventDefault()}><Label className="sr-only" htmlFor="study-library-search">Find a study</Label><Input id="study-library-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search studies…" />{query && <Button type="button" className="icon-button" aria-label="Clear search" onClick={() => setQuery('')} variant="ghost" size="icon"><LuX aria-hidden="true" /></Button>}<Button type="submit" className="icon-button" aria-label="Search studies" variant="ghost" size="icon"><LuSearch aria-hidden="true" /></Button></form><div className="study-sort"><LuArrowDownUp aria-hidden="true" /><NativeSelect aria-label="Sort studies" value={sort} onChange={event => setSort(event.target.value)}><NativeSelectOption value="newest">Newest first</NativeSelectOption><NativeSelectOption value="oldest">Oldest first</NativeSelectOption><NativeSelectOption value="name">Name A–Z</NativeSelectOption></NativeSelect></div><div className="layout-toggle" aria-label="Study layout"><Button type="button" aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => changeLayout('grid')} variant="ghost" size="auto"><LuLayoutGrid aria-hidden="true" /></Button><Button type="button" aria-label="List view" aria-pressed={layout === 'list'} onClick={() => changeLayout('list')} variant="ghost" size="auto"><LuList aria-hidden="true" /></Button></div></div>
      </div>
      {loading ? <StudyLibrarySkeleton layout={layout} /> : error ? <Card className="study-panel library-empty" as="div"><span className="empty-state-icon"><LuFolder aria-hidden="true" /></span><h3>We couldn't load your studies</h3><p>Your studies are still saved. Try loading them again.</p><Button type="button" className="study-secondary" onClick={onRetry} variant="outline" size="auto">Try again</Button></Card> : !studies.length ? !creating && <Card className="study-panel library-empty" as="div"><span className="empty-state-icon"><LuFlaskConical aria-hidden="true" /></span><h3>No studies yet</h3><p>Import a response file, or create a study to collect responses.</p><p className="study-help">Choose “Import file” above to analyze existing data, or “Create study” to collect new responses.</p></Card> : !visible.length ? <Card className="study-panel library-empty" as="div"><span className="empty-state-icon"><LuSearch aria-hidden="true" /></span><h3>No matching studies</h3><p>Try another search or show all your studies.</p><Button type="button" className="study-secondary" onClick={clearFilters} variant="outline" size="auto">Clear filters</Button></Card> : layout === 'grid' ? <div className="study-list">{visible.map(item => <Link to={`/studies/${item.id}`} className="study-list-card" key={item.id}><div className="study-card-top"><span className={`study-card-icon study-card-icon--${item.status}`}><LuFlaskConical aria-hidden="true" /></span><StudyStatus status={item.status} sourceType={item.source_type} /></div><h3>{item.title}</h3><p className="study-card-access"><LuUsers aria-hidden="true" />{item.owner_id === user.id ? 'Your study' : 'Shared with you'}</p><p>{studyProgress(item)}</p><div className="study-card-bottom"><span>Updated {formatDate(item.updated_at || item.created_at)}</span><span className="study-card-arrow" aria-label="Open study"><LuArrowUpRight aria-hidden="true" /></span></div></Link>)}</div> : <StudyLibraryTable>{visible.map(item => <TableRow key={item.id}><TableCell><Link to={`/studies/${item.id}`}><LuFlaskConical aria-hidden="true" />{item.title}<LuArrowUpRight aria-hidden="true" /></Link></TableCell><TableCell><StudyStatus status={item.status} sourceType={item.source_type} /></TableCell><TableCell>{item.owner_id === user.id ? 'Your study' : 'Shared with you'}</TableCell><TableCell>{studyProgress(item)}{item.resume && <Link className="study-resume-link" to={`/studies/${item.id}/questions/${item.resume.question_id}/${item.resume.stage === 'review' ? 'review' : 'code'}?version=${item.resume.study_version_id}`}>Continue {item.resume.stage === 'review' ? 'review' : 'coding'}</Link>}</TableCell><TableCell>{formatDate(item.updated_at || item.created_at)}</TableCell></TableRow>)}</StudyLibraryTable>}
      {!loading && !error && studies.length > 0 && <p className="library-result-count" role="status">Showing {visible.length} of {studies.length} studies{query && ` matching “${query}”`}</p>}

    </section></div>
  </>;
}
