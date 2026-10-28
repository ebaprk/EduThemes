import React, { useState } from 'react';
import { Skeleton } from './LoadingSkeleton';
import StudyActivityEditor from './StudyActivityEditor';
import { activityDrafts, studyDraftPayload } from '../utils/studyActivities';

const emptyForm = { title: '', description: '', research_question: '', additional_context: '', consent_text: '', participant_mode: 'anonymous', compensation_details: '', contact_info: '' };

export default function StudyForm({ initial = emptyForm, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initial,
    participant_mode: initial.participant_mode === 'optional_canvas' ? '' : (initial.participant_mode || 'anonymous'),
    activities: activityDrafts(initial) }));
  const unsupportedCanvasPlan = form.activities.length > 1 && form.participant_mode === 'canvas';
  const setField = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!unsupportedCanvasPlan) onSave(studyDraftPayload(form));
  };
  return <form className="study-panel study-editor" onSubmit={submit}>
    <div className="study-field"><label htmlFor="study-title">Study title</label><input id="study-title" value={form.title} onChange={(e) => setField('title', e.target.value)} maxLength={160} required placeholder="e.g. How students learn with AI" /></div>
    <div className="study-field"><label htmlFor="study-description">Participant introduction</label><textarea id="study-description" value={form.description} onChange={(e) => setField('description', e.target.value)} rows={3} placeholder="Explain the study and what participants will do." /></div>
    <div className="study-field"><label htmlFor="research-question">Research question</label><input id="research-question" value={form.research_question} onChange={(e) => setField('research_question', e.target.value)} maxLength={500} required placeholder="What are you trying to understand?" /></div>
    <div className="study-field"><label htmlFor="additional-context">Analysis context <span>(optional)</span></label><textarea id="additional-context" value={form.additional_context} onChange={(e) => setField('additional_context', e.target.value)} rows={3} placeholder="Context for theme suggestions" /></div>
    <div className="study-field"><label htmlFor="study-contact">Participant contact information <span>(optional)</span></label><textarea id="study-contact" value={form.contact_info} onChange={(e) => setField('contact_info', e.target.value)} rows={2} maxLength={1000} placeholder="Study team contact and how participants can ask for help" /></div>
    <div className="study-field"><label htmlFor="study-compensation">Compensation or course credit <span>(optional)</span></label><textarea id="study-compensation" value={form.compensation_details} onChange={(e) => setField('compensation_details', e.target.value)} rows={2} maxLength={2000} placeholder="Describe what is offered, completion requirements, and how it is arranged" /><p className="study-help">Participant contact and compensation details are frozen with each published version.</p></div>
    <fieldset className="study-consent-editor">
      <legend>Participation and consent</legend>
      <div className="study-field"><label htmlFor="participant-mode">Participant identity</label><select id="participant-mode" value={form.participant_mode} onChange={(e) => setField('participant_mode', e.target.value)} required>
        <option value="" disabled>Choose how people participate</option><option value="anonymous">Anonymous responses</option><option value="canvas">Identified through Canvas</option>
      </select><p className="study-help">Anonymous studies do not attach Canvas details. Multi-activity studies connect responses with a private study code, after the participant agrees to that linking. Canvas participation currently supports one activity.</p></div>
      {unsupportedCanvasPlan && <p className="study-error" role="alert">Choose anonymous participation for this multi-activity pilot, or keep a single Canvas activity.</p>}
      <div className="study-field"><label htmlFor="consent-text">Participant consent text</label><textarea id="consent-text" value={form.consent_text} onChange={(e) => setField('consent_text', e.target.value)} maxLength={20000} rows={8} placeholder="Paste the consent language appropriate to your approved study, including study contacts and any limits on withdrawing anonymous responses." aria-describedby="consent-help" /><p id="consent-help" className="study-help">You can save an unfinished draft. Consent text is required before publication. Publishing records this text and the questions as a new study version.</p></div>
    </fieldset>
    <StudyActivityEditor activities={form.activities} onChange={(activities) => setField('activities', activities.length === 1 ? [{ ...activities[0], required: true, opens_after_days: 0, due_after_days: null }] : activities)} disabled={saving} />
    <div className="study-actions"><button type="submit" className="study-primary" disabled={saving || unsupportedCanvasPlan} aria-busy={saving}>{saving ? <><Skeleton className="edu-skeleton--button" />Saving…</> : 'Save draft'}</button><button type="button" className="study-text-button" onClick={onCancel}>Cancel</button></div>
  </form>;
}
