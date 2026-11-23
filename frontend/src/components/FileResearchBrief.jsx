import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import ReportPreparation, { ReportFields } from './ReportPreparation';
import ResearchPaperDraft from './ResearchPaperDraft';
import { paperReview } from '../utils/researchPaper';
import { emptyReview, researchBrief, downloadText } from '../utils/researchQuality';
import LoadingSkeleton, { Skeleton } from './LoadingSkeleton';
import '../styles/ResearchQuality.css';
import { Card } from "@eduthemes/ui/components/card";
import { Badge } from "@eduthemes/ui/components/badge";
import { Label } from "@eduthemes/ui/components/label";
import { Checkbox } from "@eduthemes/ui/components/checkbox";
import { Button } from "@eduthemes/ui/components/button";
export default function FileResearchBrief({
  sessionId,
  metadata = {},
  dataset,
  labels,
  results,
  loading = false
}) {
  const fingerprint = JSON.stringify({
    dataset,
    labels,
    question: metadata.researchQuestion
  });
  const storageKey = `eduthemes.file-report:${sessionId}`;
  const [saved, setSaved] = useState(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey));
      return value?.fingerprint === fingerprint ? value : null;
    } catch {
      return null;
    }
  });
  const [preview, setPreview] = useState(false),
    [error, setError] = useState('');
  const form = saved?.fingerprint === fingerprint ? {
    ...emptyReview(),
    ...saved.form
  } : emptyReview();
  useEffect(() => {
    if (!saved || saved.fingerprint !== fingerprint) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(saved));
      setError('');
    } catch {
      setError('These notes could not be kept in this browser tab. Your edits remain here; download the research brief to keep them.');
    }
  }, [saved, fingerprint, storageKey]);
  const update = (key, value) => setSaved({
    fingerprint,
    form: {
      ...form,
      [key]: value,
      status: 'draft'
    }
  });
  const exportText = researchBrief({
    title: 'Qualitative research report',
    source_type: 'file',
    research_question: metadata.researchQuestion
  }, {
    prompt: metadata.researchQuestion
  }, {
    labels,
    coded_responses: dataset,
    response_count: dataset.length,
    results
  }, {
    review: form,
    current: false
  });
  return <Card className="quality-panel" aria-labelledby="file-report-heading" as="section">
    <div className="study-section-heading"><div><h2 id="file-report-heading">Prepare your research brief</h2><p>Record your methods and choose supporting quotes.</p></div><Badge className="review-status" variant="secondary">Draft report</Badge></div>
    <p className="study-help">Draft notes stay in this browser tab. Download the brief to keep a copy.</p>
    {error && <p role="alert" className="study-error">{error}</p>}
    {loading && <LoadingSkeleton variant="inline" label="Preparing the report with saved findings…" />}
    <ReportPreparation />
    <ReportFields value={form} onChange={update} prefix="file-report" />
    <details className="quality-response-review"><summary>Select supporting quotes · {dataset.length} {dataset.length === 1 ? 'response' : 'responses'}</summary><p>Check each original passage in context and for identifying details. Only selected passages enter the brief.</p>{dataset.map((entry, index) => <article className="quality-response" key={index}><h3>Response {index + 1}</h3><blockquote>{entry.original}</blockquote><p className="study-help">Themes: {entry.themes?.map(t => t.name).join(', ') || 'Unclassified'}</p><Label className="study-check-choice"><Checkbox type="checkbox" checked={form.quotes?.includes(index) || false} onChange={event => update('quotes', event.target.checked ? [...form.quotes, index] : form.quotes.filter(i => i !== index))} />Include response {index + 1} as a supporting quote</Label></article>)}</details>
    <div className="study-actions"><Button type="button" className="study-primary" disabled={loading} aria-busy={loading} onClick={() => downloadText(exportText, 'research-brief.md', 'text/markdown')} variant="default" size="auto">{loading && <Skeleton className="edu-skeleton--button" />}Download research brief</Button><Button type="button" className="study-secondary" disabled={loading} aria-busy={loading} onClick={() => setPreview(!preview)} variant="outline" size="auto">{loading && <Skeleton className="edu-skeleton--button" />}{preview ? 'Hide report preview' : 'Preview / print report'}</Button></div>
    {preview && <div className="research-brief-preview"><div className="study-actions"><Button type="button" className="study-secondary" onClick={() => window.print()} variant="outline" size="auto">Print / save as PDF</Button></div><article className="research-brief-document"><ReactMarkdown>{exportText}</ReactMarkdown></article></div>}
    <ResearchPaperDraft scope={`file:${sessionId}`} sessionId={sessionId} title={metadata.title || 'Qualitative research study'} loading={loading}
      evidence={{ metadata: { title: metadata.title || 'Qualitative research study', researchQuestion: metadata.researchQuestion || '', projectDescription: metadata.projectDescription || '', additionalContext: metadata.additionalContext || '' }, run: { labels, coded_responses: dataset.map(row => ({ original: row.original, themes: (row.themes || []).map(theme => ({ name: theme.name })) })), results: { summary: results?.summary || '' } }, review: paperReview(form) }} />
  </Card>;
}
