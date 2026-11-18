import React, { useLayoutEffect, useRef, useState } from 'react';
import CodebookLibrary from './CodebookLibrary';
import LoadingSkeleton from './LoadingSkeleton';
import { codebookFields, cleanCodebook } from '../utils/researchQuality';
import { Button } from '@eduthemes/ui/components/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@eduthemes/ui/components/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@eduthemes/ui/components/tabs';
import { ContextHelp, Field } from '@eduthemes/ui/workbench';
import { Label } from '@eduthemes/ui/components/label';
import { Input } from '@eduthemes/ui/components/input';
import { Textarea } from '@eduthemes/ui/components/textarea';

const DEFAULT_THEME_COLOR = '#176b52';
const THEME_COLORS = ['#176b52', '#ff7856', '#d0a72d', '#7a5c99', '#3f7d9d', '#8a6a2f', '#556b5d', '#9a4f61'];
const emptyRules = () => ({include_when:'',exclude_when:'',example:''});

export default function LabelModal({labels=[],setLabels,onDeleteLabel,onUpdateLabel}) {
  const [show,setShow] = useState(false);
  const [tab,setTab] = useState('themes');
  const [newLabel,setNewLabel] = useState('');
  const [labelDescription,setLabelDescription] = useState('');
  const [rules,setRules] = useState(emptyRules);
  const [rulesOpen,setRulesOpen] = useState(false);
  const [selectedColor,setSelectedColor] = useState(DEFAULT_THEME_COLOR);
  const [editIndex,setEditIndex] = useState(null);
  const [formError,setFormError] = useState('');
  const [importError,setImportError] = useState('');
  const [readingThemes,setReadingThemes] = useState(false);
  const [editorFits, setEditorFits] = useState(false);
  const [themeEditor, setThemeEditor] = useState(null);
  const nameInput = useRef(null);
  const themesTab = useRef(null);
  const scrollBody = useRef(null);

  useLayoutEffect(() => {
    if (scrollBody.current) scrollBody.current.scrollTop = 0;
  }, [tab]);

  useLayoutEffect(() => {
    const body = scrollBody.current;
    if (!show || tab !== 'themes' || !body || !themeEditor) return;
    const measure = () => setEditorFits(themeEditor.offsetHeight + 24 <= body.clientHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    observer.observe(themeEditor);
    measure();
    return () => observer.disconnect();
  }, [show, tab, themeEditor]);

  const resetEditor = () => {
    setNewLabel('');setLabelDescription('');setRules(emptyRules());
    setSelectedColor(DEFAULT_THEME_COLOR);setEditIndex(null);setRulesOpen(false);setFormError('');
  };
  const focusName = () => requestAnimationFrame(() => nameInput.current?.focus());
  const startEditLabel = index => {
    const theme=labels[index];
    setNewLabel(theme.name);setLabelDescription(theme.description||'');
    setRules({include_when:theme.include_when||'',exclude_when:theme.exclude_when||'',example:theme.example||''});
    setRulesOpen(Boolean(theme.include_when||theme.exclude_when||theme.example));
    setSelectedColor(theme.color||DEFAULT_THEME_COLOR);setEditIndex(index);setFormError('');
    scrollBody.current.scrollTop = 0;
    setTab('themes');focusName();
  };
  const submitTheme = event => {
    event.preventDefault();
    const name=newLabel.trim();
    if (!name) return;
    if (name.toLowerCase()==='unclassified') {setFormError('Unclassified is reserved for responses without a theme.');return;}
    if (labels.some((theme,index)=>index!==editIndex&&theme.name.toLowerCase()===name.toLowerCase())) {setFormError('Theme names must be unique.');return;}
    if (editIndex===null&&labels.length>=10) {setFormError('You can create up to 10 themes.');return;}
    const theme={...(editIndex===null?{}:labels[editIndex]),name,description:labelDescription.trim(),...rules,color:selectedColor};
    try {cleanCodebook([theme]);} catch(error) {setFormError(error.message);return;}
    if (editIndex===null) setLabels([...labels,theme]);
    else {
      const updated=labels.map((entry,index)=>index===editIndex?theme:entry);
      setLabels(updated);onUpdateLabel?.(labels[editIndex].name,theme);
    }
    resetEditor();
  };
  const deleteLabel = index => {
    const theme=labels[index];
    if (!window.confirm(`Delete “${theme.name}”? This also removes it from coded responses.`)) return;
    setLabels(labels.filter((_,position)=>position!==index));onDeleteLabel?.(theme.name);
    if (editIndex===index) resetEditor();
    else if (editIndex!==null&&editIndex>index) setEditIndex(editIndex-1);
  };
  const importLabels = value => {setLabels(value);setImportError('');setTab('themes');requestAnimationFrame(()=>themesTab.current?.focus());};
  const fileLabel = async event => {
    const input=event.currentTarget;
    const file=input.files?.[0];if (!file) return;
    setReadingThemes(true);setImportError('');
    try {
      if (file.size>100000) throw new Error('Choose a theme file smaller than 100 KB.');
      const next=labels.filter(theme=>theme.name!=='Unclassified').map(theme=>({...theme}));
      for (const row of (await file.text()).split(/\r?\n/)) {
        const comma=row.indexOf(',');if(comma===-1)continue;
        const name=row.slice(0,comma).trim(),description=row.slice(comma+1).trim();
        if (!name) continue;
        const existing=next.findIndex(theme=>theme.name.toLowerCase()===name.toLowerCase());
        if (existing===-1)next.push({name,description,color:THEME_COLORS[next.length%THEME_COLORS.length]});
        else next[existing]={...next[existing],description};
      }
      if (JSON.stringify(next)===JSON.stringify(labels)) throw new Error('No new themes were found. Use “Theme name,definition” on each line.');
      importLabels(cleanCodebook(next));
    } catch(error) {setImportError(error.message);}
    finally {setReadingThemes(false);input.value='';}
  };

  return <>
    <Button variant="outline" onClick={()=>setShow(true)}>{labels.length?'Edit codebook':'Add themes'}</Button>
    <Dialog open={show} onOpenChange={setShow}><DialogContent className="codebook-manager-dialog">
      <DialogHeader><DialogTitle>Manage codebook</DialogTitle></DialogHeader>
      <Tabs value={tab} onValueChange={setTab} className="codebook-manager-tabs">
        <TabsList variant="line" className="codebook-manager-tabs-list" aria-label="Codebook views">
          <TabsTrigger ref={themesTab} value="themes">Themes ({labels.length}/10)</TabsTrigger>
          <TabsTrigger value="import">Import &amp; reuse</TabsTrigger>
        </TabsList>
        <div className="codebook-manager-body" ref={scrollBody}>
          <TabsContent value="themes" forceMount>
            <div className="codebook-manager-layout">
              <section className="codebook-current-themes" aria-label="Current themes">
                <h3>Current themes</h3>
                {labels.length ? <ul className="codebook-theme-list">{labels.map((theme,index)=><li key={index} className={editIndex===index?'is-editing':''}>
                  <div className="codebook-theme-name"><span style={{backgroundColor:theme.color||DEFAULT_THEME_COLOR}} aria-hidden="true"/><strong>{theme.name}</strong></div>
                  {theme.description&&<p>{theme.description}</p>}
                  <div className="codebook-theme-actions"><Button type="button" variant="ghost" size="auto" aria-label={`Edit ${theme.name}`} onClick={()=>startEditLabel(index)}>Edit</Button><Button type="button" variant="ghost" size="auto" aria-label={`Delete ${theme.name}`} onClick={()=>deleteLabel(index)}>Delete</Button></div>
                </li>)}</ul> : <div className="codebook-empty"><p>No themes yet. Add one or import a codebook.</p><Button type="button" variant="outline" size="auto" onClick={()=>setTab('import')}>Import themes</Button></div>}
              </section>
              <div className="codebook-editor-column">
              <form ref={setThemeEditor} className="codebook-theme-editor" data-fits={editorFits || undefined} onSubmit={submitTheme}>
                <h3>{editIndex===null?'Add a theme':'Edit theme'}</h3>
                {formError&&<p className="codebook-manager-error" role="alert">{formError}</p>}
                <Field className="codebook-field" controlId="codebook-name"><Label>Theme name</Label><Input ref={nameInput} value={newLabel} onChange={event=>{setNewLabel(event.target.value);setFormError('');}} maxLength={30} placeholder="e.g. Learning support"/></Field>
                <Field className="codebook-field" controlId="codebook-definition"><div className="codebook-field-label"><Label>Definition</Label><span title="Maximum 200 characters">{labelDescription.length}/200</span></div><Textarea value={labelDescription} onChange={event=>setLabelDescription(event.target.value)} maxLength={200} rows={3} placeholder="When does this theme apply?"/></Field>
                <details className="codebook-rules" open={rulesOpen} onToggle={event=>setRulesOpen(event.currentTarget.open)}><summary>Coding rules (optional)</summary><div className="codebook-rules-grid">
                  {codebookFields.filter(([key])=>key!=='description').map(([key,title,limit])=><Field className="codebook-field" controlId={`codebook-${key}`} key={key}><Label>{title}</Label><Textarea rows={2} maxLength={limit} value={rules[key]} onChange={event=>setRules(previous=>({...previous,[key]:event.target.value}))}/></Field>)}
                </div></details>
                <div className="codebook-editor-footer"><Field controlId="codebook-color" className="codebook-color-field"><Label>Theme color</Label><Input type="color" value={selectedColor} onChange={event=>setSelectedColor(event.target.value)}/></Field><div className="codebook-editor-actions">
                  {editIndex!==null&&<Button type="button" variant="outline" size="auto" onClick={resetEditor}>Cancel</Button>}
                  <Button type="submit" size="auto" disabled={!newLabel.trim()||(editIndex===null&&labels.length>=10)}>{editIndex===null?'Add theme':'Update'}</Button>
                </div></div>
                {labels.length>=10&&editIndex===null&&<p className="codebook-manager-help">Theme limit reached. Edit or delete a theme to add another.</p>}
              </form>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="import" forceMount>
            <CodebookLibrary labels={labels} onImport={importLabels}>
            <section className="codebook-list-import" aria-label="Import a theme list"><h3>Import a theme list</h3><p>CSV or TXT files contain theme names and definitions only.</p>
              <Field controlId="codebook-theme-file" className="codebook-field"><Label>Theme list (CSV or TXT)</Label><Input type="file" accept=".txt,.csv,text/plain,text/csv" aria-label="Import themes (CSV or TXT)" disabled={readingThemes} aria-busy={readingThemes} onChange={fileLabel}/></Field>
              {readingThemes&&<LoadingSkeleton variant="inline" label="Reading theme list…"/>}
              <ContextHelp title="CSV/TXT format"><p>Use one theme per line: Theme name,definition. No header row. Names can have up to 30 characters and definitions up to 200. Up to 10 themes are supported.</p></ContextHelp>
              {importError&&<p className="codebook-manager-error" role="alert">{importError}</p>}
            </section>
            </CodebookLibrary>
          </TabsContent>
        </div>
      </Tabs>
      <DialogFooter className="modal-footer codebook-manager-footer"><Button type="button" variant="outline" size="auto" onClick={()=>setShow(false)}>Close</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
