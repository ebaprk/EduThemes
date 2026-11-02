import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { LuArrowRight,LuDownload,LuFileText } from 'react-icons/lu';
import LoadingSkeleton from './LoadingSkeleton';
import { findingsEntries,studyReport,findingsUrl } from '../utils/studyWorkflow';

export default function StudyFindings({ study,snapshot,view,work,refreshing,onSelect }) {
  const [history,setHistory]=useState(false);
  const visibleWork=work.map(item=>({...item,runs:history?item.runs:item.runs.slice(0,1)}));
  const entries=findingsEntries(visibleWork), all=findingsEntries(work);
  const download=()=>{
    const url=URL.createObjectURL(new Blob([studyReport(snapshot,visibleWork)],{type:'text/markdown;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`${study.share_code}-v${snapshot.version_number || 'draft'}-findings.md`;anchor.click();URL.revokeObjectURL(url);
  };
  return <section className="study-findings-library" aria-labelledby="study-findings-heading">
    <div className="study-section-heading"><div><span className="study-eyebrow">Research outputs</span><h2 id="study-findings-heading">Findings and analysis history</h2><p>Completed runs stay attached to their original response snapshot and study version.</p></div><button type="button" className="study-secondary" disabled={!entries.length||refreshing} onClick={download}><LuDownload aria-hidden="true"/>Download findings report</button></div>
    {!all.length&&refreshing?<LoadingSkeleton variant="results" label="Checking saved findings for this study version…"/>:!all.length?<div className="study-panel study-flow-empty"><span className="study-stage-icon"><LuFileText aria-hidden="true"/></span><h3>Your findings will live here</h3><p>Collect responses, define and review themes, then finish an analysis to save findings. Earlier completed runs remain available when you start a new one.</p><button className="study-primary" onClick={()=>onSelect(work.some(item=>item.count)?'analysis':snapshot.isDraft?'design':'collect')}>{work.some(item=>item.count)?'Open analysis':snapshot.isDraft?'Continue study design':'Open collection'}<LuArrowRight aria-hidden="true"/></button></div>:<>
      <div className="findings-library-toolbar"><p>{work.filter(item=>item.runs.length).length} questions with findings · {all.length} completed {all.length===1?'run':'runs'}</p><label className="study-check-choice"><input type="checkbox" checked={history} onChange={event=>setHistory(event.target.checked)}/>Include earlier runs</label></div>
      <div className="study-findings-grid">{entries.map(({question,run,index,key})=><article className="study-panel study-finding-card" key={`${question.id}:${key}`}><div className="study-section-heading"><span className="study-eyebrow">{index===0?'Latest completed run':'Earlier completed run'}</span><span className="study-version-label">Version {snapshot.version_number}</span></div><h3>{question.prompt}</h3><p className="study-help">{run.response_count || 0} responses in this run{run.updated_at?` · Saved ${new Date(run.updated_at).toLocaleString()}`:''}</p>
        <div className="finding-theme-chips">{(Array.isArray(run.results)?run.results:run.results?.themes || []).map(theme=><span key={theme.name}>{theme.name}<strong>{theme.frequency || 0}</strong></span>)}</div>
        {run.results?.summary&&<details className="finding-summary"><summary>Read saved summary</summary><ReactMarkdown>{run.results.summary}</ReactMarkdown></details>}
        <Link className="study-primary" to={findingsUrl(study.id,view,question.id,key)}>Open findings and evidence<LuArrowRight aria-hidden="true"/></Link>
      </article>)}</div><p className="study-help findings-report-note">The report includes the summaries and theme counts shown here. Response-level evidence, coding, and exports are available inside each saved run.</p>
    </>}
  </section>;
}
