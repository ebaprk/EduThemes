import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuArrowDownUp, LuArrowRight, LuArrowUpRight, LuArchive, LuCheck, LuFileText, LuFlaskConical, LuFolder, LuLayoutGrid, LuList, LuPlus, LuSearch, LuUpload, LuUsers, LuX } from 'react-icons/lu';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';

const filters = [['all', 'All studies'], ['open', 'Collecting'], ['draft', 'Drafts'], ['closed', 'Closed']];
const statusLabels = { open: 'Collecting', draft: 'Draft', closed: 'Closed' };
const formatDate = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date));

export function StudyStatus({ status }) {
  return <span className={`study-status study-status--${status}`}><span aria-hidden="true" />{statusLabels[status] || status}</span>;
}

export default function ResearchDashboard({ studies, user, loading, error, onCreate, onRetry, creating, children, invitations, saving, onAcceptInvitation, hasActiveAnalysis, onResumeAnalysis }) {
  const [params, setParams] = useSearchParams();
  const requestedStatus = params.get('status') || 'all';
  const status = filters.some(([value]) => value === requestedStatus) ? requestedStatus : 'all';
  const [query, setQuery] = useState(params.get('q') || '');
  const [layout, setLayout] = useState(localStorage.getItem('eduthemes.studyLayout') || 'list');
  const [sort, setSort] = useState(params.get('sort') || 'newest');
  useEffect(() => { setParams(previous => { const next=new URLSearchParams(previous); if(query) next.set('q',query); else next.delete('q'); if(sort!=='newest') next.set('sort',sort); else next.delete('sort'); return next; }, {replace:true}); }, [query,sort]);
  const counts = Object.fromEntries(filters.map(([value]) => [value, value === 'all' ? studies.length : studies.filter((study) => study.status === value).length]));
  const setFilter = (value) => setParams((previous) => { const next = new URLSearchParams(previous); if (value === 'all') next.delete('status'); else next.set('status', value); return next; });
  const visible = studies.filter((study) => (status === 'all' || study.status === status) && study.title.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : sort === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at));
  const summaries = [
    { status: 'all', label: 'Total studies', note: 'Across your workspace', icon: LuFolder },
    { status: 'open', label: 'Collecting responses', note: 'Open to participants', icon: LuFlaskConical },
    { status: 'draft', label: 'In preparation', note: 'Ready for your next idea', icon: LuFileText },
    { status: 'closed', label: 'Closed studies', note: 'Responses preserved', icon: LuArchive },
  ];

  if (creating) return <div className="study-creation-workspace">{children}</div>;

  return <>
    <header className="study-hero dashboard-heading"><div><h1>Studies</h1></div><button type="button" className="study-primary" onClick={onCreate} disabled={creating}><LuPlus aria-hidden="true" />Create study</button></header>
    {invitations.length > 0 && <section className="study-panel study-invitations"><div className="section-title-with-icon"><LuUsers aria-hidden="true" /><div><h2>You're invited to collaborate</h2><p>Study invitations for {user.email}.</p></div></div>{invitations.map((invitation) => <div className="study-inline" key={invitation.id}><div><strong>{invitation.title}</strong><p>Invited as {invitation.role}</p></div><button type="button" className="study-primary" disabled={saving} aria-busy={saving} onClick={() => onAcceptInvitation(invitation)}>{saving && <Skeleton className="edu-skeleton--button" />}Accept invitation<LuArrowRight aria-hidden="true" /></button></div>)}</section>}
    {hasActiveAnalysis && <section className="analysis-resume-banner"><span className="resume-banner-icon"><LuFlaskConical aria-hidden="true" /></span><div><strong>Current analysis</strong><p>Resume saved coding or review.</p></div><button type="button" className="study-secondary" onClick={onResumeAnalysis}>Continue analysis<LuArrowRight aria-hidden="true" /></button></section>}
    {children}
    <div className="dashboard-content"><section className="dashboard-studies" aria-label="Study library">
      <div className="study-library-controls"><div className="study-filter-tabs" aria-label="Filter studies">{filters.map(([value, label]) => <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={status === value} className={status === value ? 'is-active' : ''}>{label}{value === 'all' && !loading && <span>{counts.all}</span>}</button>)}</div>
        <div className="study-library-toolbar"><div className="study-search"><LuSearch aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search studies" placeholder="Search studies…" />{query && <button type="button" className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><LuX /></button>}</div><div className="study-sort"><LuArrowDownUp aria-hidden="true" /><select aria-label="Sort studies" value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></div><div className="layout-toggle" aria-label="Study layout"><button type="button" aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => { setLayout('grid'); localStorage.setItem('eduthemes.studyLayout','grid'); }}><LuLayoutGrid aria-hidden="true" /></button><button type="button" aria-label="List view" aria-pressed={layout === 'list'} onClick={() => { setLayout('list'); localStorage.setItem('eduthemes.studyLayout','list'); }}><LuList aria-hidden="true" /></button></div></div>
      </div>
      {loading ? <LoadingSkeleton variant="cards" label="Loading studies…" /> : error ? <div className="study-panel library-empty"><span className="empty-state-icon"><LuFolder aria-hidden="true" /></span><h3>We couldn't load your studies</h3><p>Your studies are still saved. Try loading them again.</p><button type="button" className="study-secondary" onClick={onRetry}>Try again</button></div> : !studies.length ? !creating && <div className="study-panel library-empty"><span className="empty-state-icon"><LuFlaskConical aria-hidden="true" /></span><h3>No studies yet</h3><p>Create a study or import responses.</p><button type="button" className="study-primary" onClick={onCreate}><LuPlus aria-hidden="true" />Create your first study</button></div> : !visible.length ? <div className="study-panel library-empty"><span className="empty-state-icon"><LuSearch aria-hidden="true" /></span><h3>No matching studies</h3><p>Try another search or show all your studies.</p><button type="button" className="study-secondary" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button></div> : layout === 'grid' ? <div className="study-list">{visible.map((item) => <Link to={`/studies/${item.id}`} className="study-list-card" key={item.id}><div className="study-card-top"><span className={`study-card-icon study-card-icon--${item.status}`}><LuFlaskConical aria-hidden="true" /></span><StudyStatus status={item.status} /></div><h3>{item.title}</h3><p className="study-card-access"><LuUsers aria-hidden="true" />{item.owner_id === user.id ? 'Your study' : 'Shared with you'}</p><p>{item.progress_available ? `${item.response_count} submissions · ${item.pending_count} analyses in progress · ${item.findings_count} findings` : 'Progress unavailable'}</p><div className="study-card-bottom"><span>Updated {formatDate(item.updated_at || item.created_at)}</span><span className="study-card-arrow" aria-label="Open study"><LuArrowUpRight aria-hidden="true" /></span></div></Link>)}</div> : <div className="study-library-table-wrap"><table className="study-library-table"><caption className="visually-hidden">Your research studies</caption><thead><tr><th scope="col">Study name</th><th scope="col">Status</th><th scope="col">Access</th><th scope="col">Progress</th><th scope="col">Updated</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><Link to={`/studies/${item.id}`}><LuFlaskConical aria-hidden="true" />{item.title}<LuArrowUpRight aria-hidden="true" /></Link></td><td><StudyStatus status={item.status} /></td><td>{item.owner_id === user.id ? 'Your study' : 'Shared with you'}</td><td>{item.progress_available ? `${item.response_count} submissions · ${item.pending_count} analyses in progress · ${item.findings_count} findings` : 'Progress unavailable'}{item.resume && <Link className="study-resume-link" to={`/studies/${item.id}/questions/${item.resume.question_id}/${item.resume.stage === 'review' ? 'review' : 'code'}?version=${item.resume.study_version_id}`}>Continue {item.resume.stage === 'review' ? 'review' : 'coding'}</Link>}</td><td>{formatDate(item.updated_at || item.created_at)}</td></tr>)}</tbody></table></div>}
      {!loading && !error && studies.length > 0 && <p className="library-result-count" role="status">Showing {visible.length} of {studies.length} studies{query && ` matching “${query}”`}</p>}
      <Link to="/analysis" className="import-file-card"><span className="import-file-icon"><LuUpload aria-hidden="true" /></span><div><strong>Import responses</strong><p>CSV or Excel</p></div><LuArrowRight aria-hidden="true" /></Link>
    </section></div>
  </>;
}
