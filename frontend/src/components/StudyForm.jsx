import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { LuCheck, LuFileText, LuMessageSquare, LuSave, LuUsers } from 'react-icons/lu';
import { Skeleton } from './LoadingSkeleton';
import StudyActivityEditor from './StudyActivityEditor';
import { activityDrafts, studyDraftPayload } from '../utils/studyActivities';
import './StudyForm.css';

const emptyForm = { title: '', description: '', research_question: '', additional_context: '', consent_text: '', participant_mode: 'anonymous', compensation_details: '', contact_info: '' };

export default function StudyForm({ initial = emptyForm, onSave, onCancel, saving, initialSection = 'design' }) {
  const id = useId();
  const editor = useRef(null);
  const sectionRefs = useRef({});
  const Heading = initial.id ? 'h2' : 'h1';
  const [form, setForm] = useState(() => ({ ...emptyForm, ...initial,
    participant_mode: initial.participant_mode === 'optional_canvas' ? '' : (initial.participant_mode || 'anonymous'),
    activities: activityDrafts(initial),
  }));
  const [validation, setValidation] = useState('');
  const unsupportedCanvasPlan = form.activities.length > 1 && form.participant_mode === 'canvas';
  const setField = (field, value) => { setValidation(''); setForm((previous) => ({ ...previous, [field]: value })); };
  const setActivities = (activities) => setField('activities', activities.map((activity, position) => ({ ...activity,
    opens_after_days: position ? activity.opens_after_days : 0,
    ...(activities.length === 1 ? { required: true, due_after_days: null } : {}),
  })));

  useLayoutEffect(() => {
    const section = sectionRefs.current[initialSection] || sectionRefs.current.design;
    (initialSection === 'design' ? editor.current : section)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    section?.querySelector('input, select, textarea')?.focus({ preventScroll: true });
  }, [initialSection]);

  const submit = (event) => {
    event.preventDefault();
    if (saving) return;
    setValidation('');
    if (unsupportedCanvasPlan) {
      setValidation('Choose anonymous participation for multiple activities, or keep a single Canvas activity.');
      editor.current.querySelector(`#${CSS.escape(id)}-participant-mode`)?.focus();
      return;
    }
    for (const control of editor.current.elements) {
      if (control.required && !control.disabled && typeof control.value === 'string' && !control.value.trim()) {
        const label = control.labels?.[0]?.textContent?.trim() || 'the required information';
        setValidation(`Add ${label.toLowerCase()} before saving.`);
        control.focus();
        return;
      }
    }
    if (!editor.current.reportValidity()) return;
    onSave(studyDraftPayload(form));
  };

  return <form ref={editor} className="study-panel study-editor study-form" onSubmit={submit} noValidate aria-busy={saving}>
    <header className="study-editor-heading"><div><Heading>{initial.id ? 'Edit study' : 'Create study'}</Heading><p>Manage your study details, participation, and questions in one place.</p></div><span>Private draft</span></header>
    <nav className="study-editor-nav" aria-label="Study setup sections">
      <a href={`#${id}-design`}><LuFileText aria-hidden="true" />Study design</a>
      <a href={`#${id}-participation`}><LuUsers aria-hidden="true" />Participation</a>
      <a href={`#${id}-activities`}><LuMessageSquare aria-hidden="true" />Activities & questions</a>
    </nav>
    {validation && <p className="study-error study-form-validation" role="alert">{validation}</p>}
    <fieldset className="study-form-fields" disabled={saving}>
      <legend className="visually-hidden">Study settings</legend>
      <section id={`${id}-design`} ref={(element) => { sectionRefs.current.design = element; }} className="study-editor-section" aria-labelledby={`${id}-design-heading`}>
        <div className="study-editor-section-title"><h3 id={`${id}-design-heading`}>Study design</h3><p>Define your research question and the context for your study.</p></div>
        <div className="study-form-grid">
          <div className="study-field"><label htmlFor={`${id}-title`}>Study title</label><input id={`${id}-title`} value={form.title} onChange={(event) => setField('title', event.target.value)} maxLength={160} required placeholder="e.g. How students learn with AI" /></div>
          <div className="study-field"><label htmlFor={`${id}-question`}>Research question</label><input id={`${id}-question`} value={form.research_question} onChange={(event) => setField('research_question', event.target.value)} maxLength={500} required placeholder="What are you trying to understand?" /></div>
          <div className="study-field"><label htmlFor={`${id}-description`}>Participant introduction <span aria-hidden="true">(optional)</span></label><textarea id={`${id}-description`} aria-label="Participant introduction" value={form.description} onChange={(event) => setField('description', event.target.value)} rows={3} placeholder="Explain the study and what participants will do." /></div>
          <div className="study-field"><label htmlFor={`${id}-context`}>Analysis context <span aria-hidden="true">(optional)</span></label><textarea id={`${id}-context`} aria-label="Analysis context" value={form.additional_context} onChange={(event) => setField('additional_context', event.target.value)} rows={3} placeholder="Context or terminology for theme suggestions" /></div>
        </div>
      </section>
      <section id={`${id}-participation`} ref={(element) => { sectionRefs.current.participation = element; }} className="study-editor-section" aria-labelledby={`${id}-participation-heading`}>
        <div className="study-editor-section-title"><h3 id={`${id}-participation-heading`}>Participation and consent</h3><p>Set participant identity and the information people review before taking part.</p></div>
        <div className="study-field study-form-identity"><label htmlFor={`${id}-participant-mode`}>Participant identity</label><select id={`${id}-participant-mode`} value={form.participant_mode} onChange={(event) => setField('participant_mode', event.target.value)} required aria-describedby={`${id}-identity-help`}>
          <option value="" disabled>Choose how people participate</option><option value="anonymous">Anonymous responses</option><option value="canvas" disabled={form.activities.length > 1}>Identified through Canvas</option>
        </select><p id={`${id}-identity-help`} className="study-help">Anonymous studies do not attach Canvas details. Multiple activities are linked with a private study code after the participant agrees. Canvas participation supports one activity.</p></div>
        {unsupportedCanvasPlan && <p className="study-error" role="alert">Choose anonymous participation for multiple activities, or keep a single Canvas activity.</p>}
        <div className="study-field"><label htmlFor={`${id}-consent`}>Participant consent text</label><textarea id={`${id}-consent`} value={form.consent_text} onChange={(event) => setField('consent_text', event.target.value)} maxLength={20000} rows={5} placeholder="Paste the consent language appropriate to your approved study." aria-describedby={`${id}-consent-help`} /><p id={`${id}-consent-help`} className="study-help">You can save an unfinished draft. Add consent text before publishing. Each published version keeps its own consent record.</p></div>
        <div className="study-form-grid">
          <div className="study-field"><label htmlFor={`${id}-contact`}>Participant contact information <span aria-hidden="true">(optional)</span></label><textarea id={`${id}-contact`} aria-label="Participant contact information" value={form.contact_info} onChange={(event) => setField('contact_info', event.target.value)} rows={2} maxLength={1000} placeholder="How participants can reach the study team" /></div>
          <div className="study-field"><label htmlFor={`${id}-compensation`}>Compensation or course credit <span aria-hidden="true">(optional)</span></label><textarea id={`${id}-compensation`} aria-label="Compensation or course credit" value={form.compensation_details} onChange={(event) => setField('compensation_details', event.target.value)} rows={2} maxLength={2000} placeholder="What is offered and how it is arranged" /></div>
        </div>
      </section>
      <section id={`${id}-activities`} ref={(element) => { sectionRefs.current.activities = element; }} className="study-editor-section" aria-labelledby={`${id}-activities-heading`}>
        <div className="study-editor-section-title"><h3 id={`${id}-activities-heading`}>Activities and questions</h3><p>Add and edit your questions together. Participants answer them one at a time.</p></div>
        {form.participant_mode === 'canvas' && <p className="study-help">Canvas studies support one activity. Choose anonymous participation above to add follow-ups.</p>}
        <StudyActivityEditor activities={form.activities} onChange={setActivities} disabled={saving} multipleAllowed={form.participant_mode !== 'canvas'} />
      </section>
    </fieldset>
    <footer className="study-actions study-form-footer"><span className="study-editor-save-hint"><LuCheck aria-hidden="true" />Your study stays private until you publish.</span><button type="button" className="study-secondary" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" className="study-primary" disabled={saving || unsupportedCanvasPlan} aria-busy={saving}>{saving ? <><Skeleton className="edu-skeleton--button" />Saving…</> : <><LuSave aria-hidden="true" />Save draft</>}</button></footer>
  </form>;
}
