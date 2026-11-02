import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { LuArrowRight,LuDownload,LuFileText } from 'react-icons/lu';
import {researchBrief} from '../utils/researchQuality';
import {supabase} from '../supabase';
import LoadingSkeleton from './LoadingSkeleton';
import { findingsEntries,findingsUrl } from '../utils/studyWorkflow';

export default function StudyFindings({ study,snapshot,view,work,refreshing,onSelect }) {
  const [history,setHistory]=useState(false);
  const [reviews,setReviews]=useState({});
  const signature=work.flatMap(item=>item.runs.map(run=>`${item.question.id}:${run.results?._run_id || `legacy-${run.revision || 0}`}`)).join('|');
  useEffect(()=>{let active=true;setReviews({});(async()=>{const records=await Promise.all(work.flatMap(item=>item.runs.map(async run=>{const key=run.results?._run_id || `legacy-${run.revision || 0}`;const {data,error}=await supabase.rpc('get_study_run_review',{p_study_id:study.id,p_version_id:view,p_question_id:item.question.id,p_run_key:key});return [`${item.question.id}:${key}`,error?{error:true}:data];})));if(active)setReviews(Object.fromEntries(records));})();return()=>{active=false;};},[study.id,view,signature,refreshing]);
  const visibleWork=work.map(item=>({...item,runs:history?item.runs:item.runs.slice(0,1)}));
  const entries=findingsEntries(visibleWork), all=findingsEntries(work);
  const download=()=>{
    const url=URL.createObjectURL(new Blob([[`# ${snapshot.title} — research report`, entries.every(({question,key})=>reviews[`${question.id}:${key}`]?.current&&reviews[`${question.id}:${key}`]?.review?.status==='approved')?'All included runs reviewed.':'DRAFT — one or more included runs require review.',...entries.map(({question,run,key})=>researchBrief(snapshot,question,run,reviews[`${question.id}:${key}`]))].join('\n\n---\n\n')],{type:'text/markdown;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`${study.share_code}-v${snapshot.version_number || 'draft'}-findings.md`;anchor.click();URL.revokeObjectURL(url);
  };
  return <section className="study-findings-library" aria-labelledby="study-findings-heading">
    <div className="study-section-heading"><div><span className="study-eyebrow">Research outputs</span><h2 id="study-findings-heading">Findings and analysis history</h2><p>Completed runs stay attached to their original response snapshot and study version.</p></div><button type="button" className="study-secondary" disabled={!entries.length||refreshing||entries.some(({question,key})=>!reviews[`${question.id}:${key}`])} onClick={download}><LuDownload aria-hidden="true"/>Download findings report</button></div>
    {!all.length&&refreshing?<LoadingSkeleton variant="results" label="Checking saved findings for this study version…"/>:!all.length?<div className="study-panel study-flow-empty"><span className="study-stage-icon"><LuFileText aria-hidden="true"/></span><h3>Your findings will live here</h3><p>Collect responses, define and review themes, then finish an analysis to save findings. Earlier completed runs remain available when you start a new one.</p><button className="study-primary" onClick={()=>onSelect(work.some(item=>item.count)?'analysis':snapshot.isDraft?'design':'collect')}>{work.some(item=>item.count)?'Open analysis':snapshot.isDraft?'Continue study design':'Open collection'}<LuArrowRight aria-hidden="true"/></button></div>:<>
      <div className="findings-library-toolbar"><p>{work.filter(item=>item.runs.length).length} questions with findings · {all.length} completed {all.length===1?'run':'runs'}</p><label className="study-check-choice"><input type="checkbox" checked={history} onChange={event=>setHistory(event.target.checked)}/>Include earlier runs</label></div>
      <div className="study-findings-grid">{entries.map(({question,run,index,key})=><article className="study-panel study-finding-card" key={`${question.id}:${key}`}><div className="study-section-heading"><span className="study-eyebrow">{index===0?'Latest completed run':'Earlier completed run'}</span><span className="study-version-label">Version {snapshot.version_number}</span></div><h3>{question.prompt}</h3>{reviews[`${question.id}:${key}`]?<p className="study-help">{reviews[`${question.id}:${key}`].error?'Review unavailable':reviews[`${question.id}:${key}`].current&&reviews[`${question.id}:${key}`].review?.status==='approved'?'Reviewed':'Review required'}</p>:<LoadingSkeleton variant="inline" label="Checking findings review status…"/>}<p className="study-help">{run.response_count || 0} responses in this run{run.updated_at?` · Saved ${new Date(run.updated_at).toLocaleString()}`:''}</p>
        <div className="finding-theme-chips">{(Array.isArray(run.results)?run.results:run.results?.themes || []).map(theme=><span key={theme.name}>{theme.name}<strong>{theme.frequency || 0}</strong></span>)}</div>
        {run.results?.summary&&<details className="finding-summary"><summary>Read saved summary</summary><ReactMarkdown>{run.results.summary}</ReactMarkdown></details>}
        <Link className="study-primary" to={findingsUrl(study.id,view,question.id,key)}>Open findings and evidence<LuArrowRight aria-hidden="true"/></Link>
      </article>)}</div><p className="study-help findings-report-note">The report includes saved summaries, methods, limitations, AI disclosure, codebooks, and explicitly selected quotes for the runs shown here. Open a run to prepare its brief and sign off your review.</p>
    </>}
  </section>;
}
