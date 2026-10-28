import React, { useState } from 'react';
import { Skeleton } from './LoadingSkeleton';

const emptyForm = { title: '', description: '', research_question: '', additional_context: '', consent_text: '', participant_mode: 'anonymous', questions: [''] };

export default function StudyForm({ initial = emptyForm, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initial,
    participant_mode: initial.participant_mode === 'optional_canvas' ? '' : (initial.participant_mode || 'anonymous'),
    questions: initial.questions?.length ? initial.questions : [''] }));
  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    onSave(Object.fromEntries(Object.entries(form).map(([key, value]) => [key,
      key === 'questions' ? value.map((question) => question.trim()) : typeof value === 'string' ? value.trim() : value])));
  };
  return <form className="study-panel study-editor" onSubmit={submit}>
    <div className="study-field"><label htmlFor="study-title">Study title</label><input id="study-title" value={form.title} onChange={(e) => setField('title', e.target.value)} maxLength={160} required placeholder="e.g. How students learn with AI" /></div>
    <div className="study-field"><label htmlFor="study-description">Participant introduction</label><textarea id="study-description" value={form.description} onChange={(e) => setField('description', e.target.value)} rows={3} placeholder="Explain the study and what participants will do." /></div>
    <div className="study-field"><label htmlFor="research-question">Research question</label><input id="research-question" value={form.research_question} onChange={(e) => setField('research_question', e.target.value)} maxLength={500} required placeholder="What are you trying to understand?" /></div>
    <div className="study-field"><label htmlFor="additional-context">Analysis context <span>(optional)</span></label><textarea id="additional-context" value={form.additional_context} onChange={(e) => setField('additional_context', e.target.value)} rows={3} placeholder="Context for theme suggestions" /></div>
    <fieldset className="study-consent-editor">
      <legend>Participation and consent</legend>
      <div className="study-field"><label htmlFor="participant-mode">Participant identity</label><select id="participant-mode" value={form.participant_mode} onChange={(e) => setField('participant_mode', e.target.value)} required>
        <option value="" disabled>Choose how people participate</option><option value="anonymous">Anonymous responses</option><option value="canvas">Identified through Canvas</option>
      </select><p className="study-help">Anonymous studies do not attach Canvas details. Identified studies require participants to connect through Canvas and confirm sharing their details.</p></div>
      <div className="study-field"><label htmlFor="consent-text">Participant consent text</label><textarea id="consent-text" value={form.consent_text} onChange={(e) => setField('consent_text', e.target.value)} maxLength={20000} rows={8} placeholder="Paste the consent language appropriate to your approved study, including study contacts and any limits on withdrawing anonymous responses." aria-describedby="consent-help" /><p id="consent-help" className="study-help">You can save an unfinished draft. Consent text is required before publication. Publishing records this text and the questions as a new study version.</p></div>
    </fieldset>
    <div className="study-question-heading"><h3>Open response questions</h3><span>{form.questions.length} of 12</span></div>
    {form.questions.map((question, index) => <div className="study-question-row" key={index}>
      <label htmlFor={`question-${index}`}>Question {index + 1}</label><textarea id={`question-${index}`} value={question} onChange={(e) => setField('questions', form.questions.map((q, i) => i === index ? e.target.value : q))} rows={2} maxLength={1000} required placeholder="Ask an open ended question" />
      {form.questions.length > 1 && <button type="button" className="study-text-button" onClick={() => setField('questions', form.questions.filter((_, i) => i !== index))}>Remove</button>}
    </div>)}
    {form.questions.length < 12 && <button type="button" className="study-secondary" onClick={() => setField('questions', [...form.questions, ''])}>+ Add question</button>}
    <div className="study-actions"><button type="submit" className="study-primary" disabled={saving} aria-busy={saving}>{saving ? <><Skeleton className="edu-skeleton--button" />Saving…</> : 'Save draft'}</button><button type="button" className="study-text-button" onClick={onCancel}>Cancel</button></div>
  </form>;
}
