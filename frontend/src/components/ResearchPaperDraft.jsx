import { FeatureHelp } from '@eduthemes/ui/components/feature-help';
import React, { useEffect, useId, useRef, useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { API_URL, getApiErrorMessage } from '../api';
import { downloadText } from '../utils/researchQuality';
import { paperFingerprint, paperSettings, readPaperDraft } from '../utils/researchPaper';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import { Button } from '@eduthemes/ui/components/button';
import { Input } from '@eduthemes/ui/components/input';
import { Label } from '@eduthemes/ui/components/label';
import { Textarea } from '@eduthemes/ui/components/textarea';
import { NativeSelect, NativeSelectOption } from '@eduthemes/ui/components/native-select';
import './ResearchPaperDraft.css';

export default function ResearchPaperDraft({ scope, studyId, sessionId, evidence, title, disabled = false, loading = false, canGenerate = true }) {
  const id = useId();
  const storageKey = `eduthemes.paper-draft.v1:${scope}`;
  const [restored] = useState(() => { try { return readPaperDraft(window.sessionStorage, storageKey); } catch { return null; } });
  const [settings, setSettings] = useState(() => ({ title: title || '', authors: '', affiliation: '', references: '', target_words: '1800', ...restored?.settings }));
  const [draft, setDraft] = useState(restored?.draft || null);
  const [previous, setPrevious] = useState(restored?.previous || null);
  const [mode, setMode] = useState('read');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const request = useRef(null);
  const article = useRef(null);
  const inflight = useRef(false);
  const fingerprint = paperFingerprint(evidence, settings);
  const stale = Boolean(draft && draft.fingerprint !== fingerprint);
  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, settings, draft, previous }));
      setStorageError('');
    } catch {
      setStorageError('Your draft is still on this page. Download it to keep a copy; this browser could not save it in the tab.');
    }
  }, [draft, previous, settings, storageKey]);
  const update = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  const generate = async () => {
    if (inflight.current || disabled || loading || !canGenerate) return;
    setError('');
    let paper;
    try { paper = paperSettings(settings); } catch (failure) { setError(failure.message); return; }
    const controller = new AbortController();
    request.current = controller;
    inflight.current = true;
    setGenerating(true);
    try {
      const path = studyId ? `/studies/${studyId}/research-paper` : `/session/${encodeURIComponent(sessionId)}/research-paper`;
      const { data } = await axios.post(`${API_URL}${path}`, { ...evidence, paper }, { signal: controller.signal });
      if (typeof data?.markdown !== 'string' || !data.markdown.trim()) throw new Error('No paper returned');
      if (controller.signal.aborted) return;
      setPrevious(draft);
      setDraft({ ...data, fingerprint, edited: false });
      setMode('read');
    } catch (failure) {
      if (!controller.signal.aborted) setError(getApiErrorMessage(failure, 'The paper could not be generated. Your existing draft and report notes are retained.'));
    } finally {
      inflight.current = false;
      if (!controller.signal.aborted) setGenerating(false);
    }
  };
  const print = () => {
    const target = article.current;
    if (!target) return;
    target.classList.add('paper-print-target');
    const cleanup = () => target.classList.remove('paper-print-target');
    window.addEventListener('afterprint', cleanup, { once: true });
    try { window.print(); } catch { cleanup(); setError('Printing could not open. Download the Markdown draft instead.'); }
  };
  return <section className="paper-draft" aria-labelledby={`${id}-heading`}>
    <div className="paper-draft-heading"><h3 id={`${id}-heading`}>Write a research paper with NaviGator</h3><span className="paper-draft-badge">AI manuscript draft</span></div>
    <p>Generate an abstract, introduction, methods, findings, discussion, limitations, and conclusion from the included analysis runs and report notes. Review and edit the draft before sharing.</p>
    <p className="study-help">NaviGator receives selected supporting quotes, the summary, counts, codebook, and report notes. Missing methods are described as gaps. References come from the sources you supply below.</p>
    <FeatureHelp guide="research-reports#generate" label="How to prepare a paper draft" />
    <details className="paper-draft-settings">
      <summary>Paper title, authors, length, and references</summary>
      <fieldset disabled={generating} className="study-unframed-fieldset paper-draft-fields">
        <div className="study-field"><Label htmlFor={`${id}-title`}>Paper title</Label><Input id={`${id}-title`} value={settings.title} maxLength={200} onChange={event => update('title', event.target.value)} /></div>
        <div className="study-field"><Label htmlFor={`${id}-authors`}>Author names (optional)</Label><Input id={`${id}-authors`} value={settings.authors} maxLength={1000} onChange={event => update('authors', event.target.value)} /></div>
        <div className="study-field"><Label htmlFor={`${id}-affiliation`}>Affiliation (optional)</Label><Input id={`${id}-affiliation`} value={settings.affiliation} maxLength={1000} onChange={event => update('affiliation', event.target.value)} /></div>
        <div className="study-field"><Label htmlFor={`${id}-length`}>Target manuscript length</Label><NativeSelect id={`${id}-length`} value={settings.target_words} onChange={event => update('target_words', event.target.value)}><NativeSelectOption value="1200">About 1,200 words</NativeSelectOption><NativeSelectOption value="1800">About 1,800 words</NativeSelectOption><NativeSelectOption value="2500">About 2,500 words</NativeSelectOption></NativeSelect></div>
        <div className="study-field paper-draft-references"><Label htmlFor={`${id}-references`}>References and source notes (optional)</Label><Textarea id={`${id}-references`} value={settings.references} rows={5} maxLength={60000} aria-describedby={`${id}-reference-help`} onChange={event => update('references', event.target.value)} /><p className="study-help" id={`${id}-reference-help`}>Separate sources with a blank line. Include the full citation and the findings you want it to support. NaviGator will cite only these sources. Without references, the introduction uses the study’s own context.</p></div>
      </fieldset>
    </details>
    {error && <p className="study-error" role="alert">{error}</p>}
    {storageError && <p className="study-help" role="status">{storageError}</p>}
    {!canGenerate && <p className="study-help">A study owner or researcher can generate a paper from these findings.</p>}
    <div className="study-actions paper-draft-actions"><Button type="button" disabled={disabled || loading || generating || !canGenerate} aria-busy={generating || loading} onClick={generate} size="auto">{generating ? <><Skeleton className="edu-skeleton--button" />Writing paper with NaviGator…</> : loading ? <><Skeleton className="edu-skeleton--button" />Loading paper inputs…</> : draft ? 'Generate a new paper draft' : 'Generate paper draft with NaviGator'}</Button>{draft && <><Button type="button" variant="outline" size="auto" disabled={!draft.markdown.trim()} onClick={() => downloadText(draft.markdown, 'research-paper-draft.md', 'text/markdown;charset=utf-8')}>Download paper draft</Button><Button type="button" variant="outline" size="auto" disabled={!draft.markdown.trim()} onClick={print}>Print / save paper as PDF</Button></>}</div>
    {generating && <LoadingSkeleton variant={draft ? 'inline' : 'text'} rows={7} label={draft ? 'Writing a new manuscript. Your current draft stays available below…' : 'NaviGator is writing the complete manuscript. This may take a few minutes…'} />}
    {draft && <>
      <div className="paper-draft-status"><p className="study-help">{draft.edited ? 'Edited manuscript draft' : 'Generated manuscript draft'} · {draft.model} · {new Date(draft.generated_at).toLocaleString()}. Saved in this browser tab; download a copy to keep it.</p>{stale && <p className="study-note" role="status">The included findings, report notes, or paper settings changed after this draft was generated. Your draft is retained; generate a new one to include those changes.</p>}</div>
      <div className="paper-draft-view" role="group" aria-label="Paper draft view"><Button type="button" variant="outline" size="auto" aria-pressed={mode === 'read'} onClick={() => setMode('read')}>Read paper draft</Button><Button type="button" variant="outline" size="auto" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Edit paper draft</Button>{previous && <Button type="button" variant="ghost" size="auto" disabled={generating} onClick={() => { setDraft(previous); setPrevious(draft); }}>Restore previous draft</Button>}</div>
      <div hidden={mode !== 'edit'} className="paper-draft-editor"><Label htmlFor={`${id}-editor`}>Paper draft (Markdown)</Label><Textarea id={`${id}-editor`} value={draft.markdown} rows={22} maxLength={500000} readOnly={generating} onChange={event => setDraft(current => ({ ...current, markdown: event.target.value, edited: true }))} /></div>
      <div hidden={mode !== 'read'} className="paper-draft-preview"><article ref={article} className="paper-document"><ReactMarkdown skipHtml components={{ img: () => null }}>{draft.markdown}</ReactMarkdown></article></div>
    </>}
  </section>;
}
