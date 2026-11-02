import React,{useEffect,useState} from 'react';
import {supabase} from '../supabase';
import LoadingSkeleton,{Skeleton} from './LoadingSkeleton';
import {cleanCodebook,codebookFile,downloadText} from '../utils/researchQuality';

export default function CodebookLibrary({labels,onImport}) {
  const [sources,setSources]=useState([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reading,setReading]=useState(false);
  useEffect(()=>{let active=true;(async()=>{try{
    const {data,error}=await supabase.rpc('list_study_codebooks');if(error)throw error;
    if(active)setSources((data || []).filter(row=>row.labels?.some(t=>t.name!=='Unclassified')).map(row=>({...row,version:row.version_number})));
  }catch(e){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[]);
  const importLabels=value=>{try{const imported=cleanCodebook(value);const merged=cleanCodebook([...labels.filter(t=>t.name!=='Unclassified'),...imported]);onImport(merged);setError('');}catch(e){setError(e.message);}};
  const upload=async event=>{const file=event.target.files[0];if(!file)return;setReading(true);setError('');try{if(file.size>100000)throw new Error('Choose a codebook smaller than 100 KB.');const data=JSON.parse(await file.text());if(data.format!=='eduthemes-codebook'||data.version!==1)throw new Error('Choose an EduThemes codebook JSON file.');importLabels(data);}catch(e){setError(e.message);}finally{setReading(false);event.target.value='';}};
  return <section className="quality-panel" aria-label="Reusable codebooks"><h3>Reuse a codebook</h3><p>Import definitions and rules. Existing themes stay intact; duplicate names must be resolved first. Responses and review decisions are never copied.</p><div className="study-actions"><button type="button" className="study-secondary" disabled={!labels.length} onClick={()=>{try{downloadText(codebookFile(labels),'eduthemes-codebook.json','application/json');setError('');}catch(e){setError(e.message);}}}>Download codebook</button><label className="study-secondary quality-file-label">{reading&&<Skeleton className="edu-skeleton--button"/>}{reading?'Reading codebook…':'Import codebook'}<input type="file" accept=".json" aria-label="Import codebook" disabled={reading} aria-busy={reading} onChange={upload}/></label></div>
    {loading?<LoadingSkeleton variant="inline" label="Loading your accessible codebooks…"/>:sources.length?<><div className="study-field"><label htmlFor="reuse-codebook-source">Saved question codebook</label><select id="reuse-codebook-source" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a saved question</option>{sources.map((row,index)=><option key={`${row.study_id}:${row.study_version_id}:${row.question_id}`} value={index}>{row.title} · v{row.version || '?'} · {row.prompt || `question ${row.question_id.slice(0,8)}`} </option>)}</select></div><button type="button" className="study-secondary" disabled={selected===''} onClick={()=>importLabels(sources[Number(selected)].labels.filter(t=>t.name!=='Unclassified'))}>Copy definitions into this codebook</button></>:!error?<p className="study-help">Saved study codebooks will appear here after you define and save themes.</p>:null}
    {error&&<p className="study-error" role="alert">{error}</p>}
  </section>;
}
