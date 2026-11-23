import { FeatureHelp } from '@eduthemes/ui/components/feature-help';
import React, { useId, useLayoutEffect, useRef, useState, useEffect } from 'react';
import { LuArrowLeft, LuArrowRight, LuSave, LuEye } from 'react-icons/lu';
import { Skeleton } from './LoadingSkeleton';
import StudyActivityEditor from './StudyActivityEditor';
import ScreeningEditor from './ScreeningEditor';
import StudyPreview from './StudyPreview';
import StudyTemplates from './StudyTemplates';
import { draftPreview } from '../utils/studyWorkflow';
import { recruitmentDraft } from '../utils/recruitment';
import { activityDrafts, studyDraftPayload } from '../utils/studyActivities';
import './StudyForm.css';
import { Label } from "@eduthemes/ui/components/label";
import { Input } from "@eduthemes/ui/components/input";
import { Textarea } from "@eduthemes/ui/components/textarea";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Button } from "@eduthemes/ui/components/button";
const emptyForm = {
  title: '',
  description: '',
  research_question: '',
  additional_context: '',
  consent_text: '',
  participant_mode: 'anonymous',
  compensation_details: '',
  contact_info: ''
};
const setupSections = [
  ['design', 'Study design'],
  ['activities', 'Questions'],
  ['participation', 'Participation'],
  ['screening', 'Recruitment']
];
const setupHelp = {
  design: ['design', 'Help with study design and templates'],
  activities: ['questions', 'Help with questions and activities'],
  participation: ['participation', 'Help with consent and participation'],
  screening: ['recruitment', 'Help with recruitment setup']
};

export default function StudyForm({
  initial = emptyForm,
  onSave,
  onCancel,
  saving,
  initialSection = 'design',
  draftKey
}) {
  const id = useId();
  const editor = useRef(null);
  const [preview, setPreview] = useState(false);
  const invalidControl = useRef(null);
  const focusSection = useRef(false);
  const [activeSection, setActiveSection] = useState(() => setupSections.some(([key]) => key === initialSection) ? initialSection : 'design');
  const Heading = initial.id ? 'h2' : 'h1';
  const SectionHeading = initial.id ? 'h3' : 'h2';
  const storageKey = draftKey ? `eduthemes.draft.${draftKey}` : null;
  const [form, setForm] = useState(() => {
    try {
      const saved = storageKey && localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.revision === (initial.draft_revision || 0)) return parsed.form;
      }
    } catch {}
    return {
      ...emptyForm,
      ...initial,
      participant_mode: initial.participant_mode === 'optional_canvas' ? '' : initial.participant_mode || 'anonymous',
      activities: activityDrafts(initial),
      recruitment: recruitmentDraft(initial.recruitment_draft)
    };
  });
  useEffect(() => {
    if (!storageKey || saving) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        revision: initial.draft_revision || 0,
        form
      }));
    } catch {}
  }, [form, storageKey, saving, initial.draft_revision]);
  const baseline = useRef(JSON.stringify({
    ...emptyForm,
    ...initial,
    activities: activityDrafts(initial),
    recruitment: recruitmentDraft(initial.recruitment_draft)
  }));
  const dirty = JSON.stringify(form) !== baseline.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = event => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [validation, setValidation] = useState('');
  const unsupportedCanvasPlan = form.activities.length > 1 && form.participant_mode === 'canvas';
  const setField = (field, value) => {
    setValidation('');
    setForm(previous => ({
      ...previous,
      [field]: value
    }));
  };
  const setActivities = activities => setField('activities', activities.map((activity, position) => ({
    ...activity,
    opens_after_days: position ? activity.opens_after_days : 0,
    ...(activities.length === 1 ? {
      required: true,
      due_after_days: null
    } : {})
  })));
  const sectionIndex = setupSections.findIndex(([key]) => key === activeSection);
  const previousSection = setupSections[sectionIndex - 1];
  const nextSection = setupSections[sectionIndex + 1];
  const goTo = section => {
    if (section === activeSection) return;
    focusSection.current = true;
    setActiveSection(section);
  };
  useEffect(() => {
    if (!setupSections.some(([key]) => key === initialSection)) return;
    setActiveSection(initialSection);
  }, [initialSection]);
  const focusInvalid = control => {
    for (let details = control.closest('details'); details; details = details.parentElement.closest('details')) {
      details.open = true;
    }
    control.focus();
  };
  useLayoutEffect(() => {
    if (!focusSection.current) return;
    focusSection.current = false;
    editor.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (invalidControl.current) {
      const control = invalidControl.current;
      invalidControl.current = null;
      focusInvalid(control);
    } else {
      const heading = editor.current?.querySelector(`[data-setup-section="${activeSection}"] .study-setup-section-title`);
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
    }
  }, [activeSection]);
  const showInvalid = (control, message) => {
    setValidation(message);
    if (!control) return;
    const section = control.closest('[data-setup-section]')?.dataset.setupSection;
    if (section && section !== activeSection) {
      invalidControl.current = control;
      goTo(section);
    } else focusInvalid(control);
  };
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    setValidation('');
    if (unsupportedCanvasPlan) {
      showInvalid(editor.current.querySelector(`#${CSS.escape(id)}-participant-mode`),
        'Choose anonymous participation for multiple activities, or keep a single Canvas activity.');
      return;
    }
    for (const control of editor.current.elements) {
      if (!control.willValidate) continue;
      if (control.required && typeof control.value === 'string' && !control.value.trim()) {
        const label = control.labels?.[0]?.textContent?.trim() || 'the required information';
        showInvalid(control, `Add ${label.toLowerCase()} before saving.`);
        return;
      }
      if (!control.validity.valid) {
        const label = control.labels?.[0]?.textContent?.trim();
        showInvalid(control, label ? `${label}. ${control.validationMessage}` : control.validationMessage);
        return;
      }
    }
    const saved = await onSave(studyDraftPayload(form));
    if (saved && storageKey) localStorage.removeItem(storageKey);
  };
  return <><form ref={editor} className="study-form study-setup-form" onSubmit={submit} noValidate aria-busy={saving}>
    <header className="study-setup-header">
      <Button type="button" disabled={saving} onClick={onCancel} variant="link" size="auto">
        <LuArrowLeft aria-hidden="true" />{initial.id ? 'Back to study' : 'Back to studies'}
      </Button>
      <Heading>{initial.id ? 'Edit study' : 'Create study'}</Heading>
    </header>
    <nav className="study-setup-nav" aria-label="Study setup sections">
      {setupSections.map(([key, title]) => <Button type="button" key={key} disabled={saving} variant="ghost"
        aria-current={activeSection === key ? 'step' : undefined} onClick={() => goTo(key)}>{title}</Button>)}
    </nav>
    <FeatureHelp guide={`create-study#${setupHelp[activeSection][0]}`} label={setupHelp[activeSection][1]} />
    {validation && <p className="study-error study-form-validation" role="alert">{validation}</p>}
    <fieldset className="study-form-fields" disabled={saving}>
      <legend className="sr-only">Study setup</legend>
      <section data-setup-section="design" hidden={activeSection !== 'design'} className="study-setup-section" aria-labelledby={`${id}-design-heading`}>
        <SectionHeading className="study-setup-section-title" id={`${id}-design-heading`}>Study design</SectionHeading>
        <StudyTemplates form={form} onApply={value => { setForm(value); setValidation(''); }} disabled={saving} isNew={!initial.id} />
        <div className="study-form-grid">
          <div className="study-field"><Label htmlFor={`${id}-title`}>Study title</Label><Input id={`${id}-title`} value={form.title} onChange={event => setField('title', event.target.value)} maxLength={160} required placeholder="e.g. How students learn with AI" /></div>
          <div className="study-field"><Label htmlFor={`${id}-question`}>Research question</Label><Input id={`${id}-question`} value={form.research_question} onChange={event => setField('research_question', event.target.value)} maxLength={500} required placeholder="What are you trying to understand?" /></div>
          <div className="study-field"><Label htmlFor={`${id}-description`}>Participant introduction <span aria-hidden="true">(optional)</span></Label><Textarea id={`${id}-description`} aria-label="Participant introduction" value={form.description} onChange={event => setField('description', event.target.value)} rows={3} placeholder="Explain the study and what participants will do." /></div>
          <div className="study-field"><Label htmlFor={`${id}-context`}>Analysis context <span aria-hidden="true">(optional)</span></Label><Textarea id={`${id}-context`} aria-label="Analysis context" value={form.additional_context} onChange={event => setField('additional_context', event.target.value)} rows={3} placeholder="Context or terminology for theme suggestions" /></div>
        </div>
      </section>
      <section data-setup-section="activities" hidden={activeSection !== 'activities'} className="study-setup-section" aria-labelledby={`${id}-activities-heading`}>
        <SectionHeading className="study-setup-section-title" id={`${id}-activities-heading`}>Questions for participants</SectionHeading>
        {form.participant_mode === 'canvas' && <p className="study-help">Canvas studies support one activity. Choose anonymous participation above to add follow-ups.</p>}
        <StudyActivityEditor activities={form.activities} onChange={setActivities} disabled={saving} multipleAllowed={form.participant_mode !== 'canvas'} />
      </section>
      <section data-setup-section="participation" hidden={activeSection !== 'participation'} className="study-setup-section" aria-labelledby={`${id}-participation-heading`}>
        <SectionHeading className="study-setup-section-title" id={`${id}-participation-heading`}>Participation and consent</SectionHeading>
        <div className="study-field study-form-identity"><Label htmlFor={`${id}-participant-mode`}>Participant identity</Label><NativeSelect id={`${id}-participant-mode`} value={form.participant_mode} onChange={event => setField('participant_mode', event.target.value)} required aria-describedby={`${id}-identity-help`}>
          <NativeSelectOption value="" disabled>Choose how people participate</NativeSelectOption><NativeSelectOption value="anonymous">Anonymous responses</NativeSelectOption><NativeSelectOption value="canvas" disabled={form.activities.length > 1 || form.recruitment?.enabled}>Identified through Canvas</NativeSelectOption>
        </NativeSelect><p id={`${id}-identity-help`} className="study-help">Anonymous studies do not attach Canvas details. Multiple activities are linked with a private study code after the participant agrees. Canvas participation supports one activity.</p></div>
        <FeatureHelp guide="canvas-participation" label="Set up Canvas participation" />
        {unsupportedCanvasPlan && <p className="study-error" role="alert">Choose anonymous participation for multiple activities, or keep a single Canvas activity.</p>}
        <div className="study-field"><Label htmlFor={`${id}-consent`}>Participant consent text</Label><Textarea id={`${id}-consent`} value={form.consent_text} onChange={event => setField('consent_text', event.target.value)} maxLength={20000} rows={5} placeholder="Paste the consent language appropriate to your approved study." aria-describedby={`${id}-consent-help`} /><p id={`${id}-consent-help`} className="study-help">You can save an unfinished draft. Add consent text before publishing. Each published version keeps its own consent record.</p></div>
        <div className="study-form-grid">
          <div className="study-field"><Label htmlFor={`${id}-contact`}>Participant contact information <span aria-hidden="true">(optional)</span></Label><Textarea id={`${id}-contact`} aria-label="Participant contact information" value={form.contact_info} onChange={event => setField('contact_info', event.target.value)} rows={2} maxLength={1000} placeholder="How participants can reach the study team" /></div>
          <div className="study-field"><Label htmlFor={`${id}-compensation`}>Compensation or course credit <span aria-hidden="true">(optional)</span></Label><Textarea id={`${id}-compensation`} aria-label="Compensation or course credit" value={form.compensation_details} onChange={event => setField('compensation_details', event.target.value)} rows={2} maxLength={2000} placeholder="What is offered and how it is arranged" /></div>
        </div>
      </section>
      <ScreeningEditor heading={SectionHeading} sectionId={`${id}-screening`} hidden={activeSection !== 'screening'}
        value={form.recruitment} onChange={value => setField('recruitment', value)} disabled={saving} mode={form.participant_mode} />
    </fieldset>
    <footer className="study-setup-footer">
      {previousSection && <Button type="button" disabled={saving} onClick={() => goTo(previousSection[0])} variant="ghost">
        <LuArrowLeft aria-hidden="true" />Back
      </Button>}
      <div className="study-setup-actions">
        <Button type="button" disabled={saving} onClick={() => setPreview(true)} variant="ghost"><LuEye aria-hidden="true" />Participant preview</Button>
        <Button type="submit" disabled={saving} aria-busy={saving} variant={nextSection ? 'outline' : 'default'}>
          {saving ? <><Skeleton className="edu-skeleton--button" />Saving…</> : <><LuSave aria-hidden="true" />Save draft &amp; review</>}
        </Button>
        {nextSection && <Button type="button" disabled={saving} onClick={() => goTo(nextSection[0])}>
          Continue to {nextSection[1].toLowerCase()}<LuArrowRight aria-hidden="true" />
        </Button>}
      </div>
    </footer>
  </form><StudyPreview show={preview} onHide={() => setPreview(false)} study={draftPreview(form)} /></>;
}
