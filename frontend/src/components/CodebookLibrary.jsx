import { FeatureHelp } from '@eduthemes/ui/components/feature-help';
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { cleanCodebook, codebookFile, downloadText } from '../utils/researchQuality';
import { Button } from "@eduthemes/ui/components/button";
import { Label } from "@eduthemes/ui/components/label";
import { Input } from "@eduthemes/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
export default function CodebookLibrary({
  labels,
  onImport,
  children
}) {
  const [sources, setSources] = useState([]),
    [selected, setSelected] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [loadError,setLoadError] = useState(''),
    [reading, setReading] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const {
          data,
          error
        } = await supabase.rpc('list_study_codebooks');
        if (error) throw error;
        if (active) setSources((data || []).filter(row => row.labels?.some(t => t.name !== 'Unclassified')).map(row => ({
          ...row,
          version: row.version_number
        })));
      } catch (e) {
        if (active) setLoadError('Saved codebooks could not be loaded. You can still import a file.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const importLabels = value => {
    try {
      const imported = cleanCodebook(value);
      const merged = cleanCodebook([...labels.filter(t => t.name !== 'Unclassified'), ...imported]);
      onImport(merged);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };
  const upload = async event => {
    const file = event.target.files[0];
    if (!file) return;
    setReading(true);
    setError('');
    try {
      if (file.size > 100000) throw new Error('Choose a codebook smaller than 100 KB.');
      const data = JSON.parse(await file.text());
      if (data.format !== 'eduthemes-codebook' || data.version !== 1) throw new Error('Choose an EduThemes codebook JSON file.');
      importLabels(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setReading(false);
      event.target.value = '';
    }
  };
  return <section className="codebook-library" aria-label="Reusable codebooks">
    <div className="codebook-file-section"><h3>Codebook file</h3><FeatureHelp guide="code-responses#codebook" label="Help with codebooks" /><p>JSON preserves theme definitions, coding rules, and examples.</p>
      <div className="codebook-file-actions"><Label className="quality-file-label codebook-upload-button">{reading && <Skeleton className="edu-skeleton--button" />}{reading ? 'Reading codebook…' : 'Import JSON codebook'}<Input type="file" accept=".json,application/json" aria-label="Import codebook JSON" disabled={reading} aria-busy={reading} onChange={upload}/></Label>
        <Button type="button" variant="outline" size="auto" disabled={!labels.length} onClick={()=>{try{downloadText(codebookFile(labels),'eduthemes-codebook.json','application/json');setError('');}catch(e){setError(e.message);}}}>Download JSON</Button>
      </div>
      <p className="codebook-manager-help">Imported names must be unique. Existing response coding is preserved.</p>
      {error&&<p className="codebook-manager-error" role="alert">{error}</p>}
    </div>
    {children}
    <div className="codebook-saved-section"><h3>Reuse a saved codebook</h3>
      {loading ? <LoadingSkeleton variant="inline" label="Loading saved codebooks…"/> : loadError ? <p className="codebook-manager-error" role="alert">{loadError}</p> : sources.length ? <div className="codebook-saved-controls"><div className="codebook-field"><Label htmlFor="reuse-codebook-source">Saved question codebook</Label><NativeSelect id="reuse-codebook-source" value={selected} onChange={event=>setSelected(event.target.value)}><NativeSelectOption value="">Choose a saved question</NativeSelectOption>{sources.map((row,index)=><NativeSelectOption key={`${row.study_id}:${row.study_version_id}:${row.question_id}`} value={index}>{row.title} · v{row.version||'?'} · {row.prompt||`question ${row.question_id.slice(0,8)}`}</NativeSelectOption>)}</NativeSelect></div><Button type="button" variant="outline" size="auto" disabled={selected===''} onClick={()=>importLabels(sources[Number(selected)].labels.filter(theme=>theme.name!=='Unclassified'))}>Use saved codebook</Button></div> : <p>No saved study codebooks yet.</p>}
    </div>
  </section>;
}
