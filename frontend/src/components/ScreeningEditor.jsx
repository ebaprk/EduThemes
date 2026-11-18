import React from 'react';
import { cleanScreeningBranches, newScreeningQuestion, recruitmentDraft } from '../utils/recruitment';
import { Label } from "@eduthemes/ui/components/label";
import { Checkbox } from "@eduthemes/ui/components/checkbox";
import { Textarea } from "@eduthemes/ui/components/textarea";
import { Input } from "@eduthemes/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Button } from "@eduthemes/ui/components/button";
export default function ScreeningEditor({
  value,
  onChange,
  disabled,
  mode,
  sectionId,
  hidden,
  heading: Heading = 'h3'
}) {
  const config = recruitmentDraft(value);
  const set = (field, next) => onChange({
    ...config,
    [field]: next
  });
  const setQuestions = questions => set('questions', cleanScreeningBranches(questions));
  const questionChange = (id, field, next) => setQuestions(config.questions.map(q => q.id === id ? {
    ...q,
    [field]: next
  } : q));
  return <section id={sectionId} hidden={hidden} data-setup-section="screening" className="study-setup-section screening-editor" aria-labelledby="screening-heading">
    <Heading className="study-setup-section-title" id="screening-heading">Recruitment and screening</Heading>
    <Label className="study-check-choice"><Checkbox type="checkbox" checked={config.enabled} disabled={disabled || mode !== 'anonymous'} onChange={event => onChange({
        ...config,
        enabled: event.target.checked,
        questions: config.questions.length ? config.questions : [newScreeningQuestion()]
      })} />Require screening and a researcher invitation</Label>
    {mode !== 'anonymous' && <p className="study-help">Choose anonymous participation to use private recruitment and study return links.</p>}
    {config.enabled && <fieldset disabled={disabled} className="study-unframed-fieldset">
      <div className="study-form-grid">
        <div className="study-field"><Label htmlFor="screening-eligibility">Who can take part?</Label><Textarea id="screening-eligibility" value={config.eligibility} onChange={event => set('eligibility', event.target.value)} maxLength={2000} rows={3} required placeholder="Describe the study’s eligibility criteria." /></div>
        <div className="study-field"><Label htmlFor="screening-location">Location or format</Label><Input id="screening-location" value={config.location} onChange={event => set('location', event.target.value)} maxLength={300} required /><Label htmlFor="screening-time">Estimated total participation time (minutes)</Label><Input id="screening-time" type="number" min={1} max={1440} step={1} value={config.estimated_minutes} onChange={event => set('estimated_minutes', event.target.value)} required /></div>
      </div>
      <div className="study-field"><Label htmlFor="screening-notice">Screening information and permission</Label><Textarea id="screening-notice" value={config.notice} onChange={event => set('notice', event.target.value)} maxLength={10000} rows={4} required placeholder="Explain why you collect these answers, who reviews them, and the screening permissions appropriate to your study." /><p className="study-help">Participants accept this before submitting screening answers. Study participation consent is requested separately after an invitation.</p></div>
      <p className="study-note">Answer rules flag applications for review. A researcher makes every eligibility and invitation decision.</p>
      {config.questions.map((question, index) => <fieldset className="screening-question" key={question.id}>
        <legend>Screening question {index + 1}</legend>
        <div className="study-field"><Label htmlFor={`screen-prompt-${question.id}`}>Question {index + 1} prompt</Label><Textarea id={`screen-prompt-${question.id}`} value={question.prompt} onChange={event => questionChange(question.id, 'prompt', event.target.value)} rows={2} maxLength={1000} required /></div>
        {index > 0 && <div className="study-field"><Label htmlFor={`screen-branch-${question.id}`}>Show this question</Label><NativeSelect id={`screen-branch-${question.id}`} value={question.show_if ? `${question.show_if.question_id}:${question.show_if.option_id}` : ''} onChange={event => {
            const [question_id, option_id] = event.target.value.split(':');
            questionChange(question.id, 'show_if', question_id ? {
              question_id,
              option_id
            } : null);
          }}><NativeSelectOption value="">Always</NativeSelectOption>{config.questions.slice(0, index).flatMap((prior, position) => prior.options.map(option => <NativeSelectOption value={`${prior.id}:${option.id}`} key={`${prior.id}:${option.id}`}>When question {position + 1} is “{option.label || 'Untitled choice'}”</NativeSelectOption>))}</NativeSelect></div>}
        <p className="study-help">Each volunteer chooses one answer. Clear “Matches criteria” to flag an answer for closer review.</p>
        {question.options.map((option, position) => <div className="screening-option" key={option.id}>
          <div className="study-field"><Label htmlFor={`screen-option-${question.id}-${option.id}`}>Question {index + 1}, choice {position + 1}</Label><Input id={`screen-option-${question.id}-${option.id}`} value={option.label} maxLength={300} required onChange={event => questionChange(question.id, 'options', question.options.map(o => o.id === option.id ? {
              ...o,
              label: event.target.value
            } : o))} /></div>
          <Label className="study-check-choice"><Checkbox type="checkbox" checked={option.qualifies} onChange={event => questionChange(question.id, 'options', question.options.map(o => o.id === option.id ? {
              ...o,
              qualifies: event.target.checked
            } : o))} />Matches criteria</Label>
          {question.options.length > 2 && <Button type="button" className="study-text-button" aria-label={`Remove choice ${position + 1} from question ${index + 1}`} onClick={() => questionChange(question.id, 'options', question.options.filter(o => o.id !== option.id))} variant="link" size="auto">Remove</Button>}
        </div>)}
        <div className="study-actions">{question.options.length < 8 && <Button type="button" className="study-secondary" onClick={() => questionChange(question.id, 'options', [...question.options, {
            id: crypto.randomUUID(),
            label: '',
            qualifies: true
          }])} variant="outline" size="auto">Add answer choice</Button>}{config.questions.length > 1 && <Button type="button" className="study-text-button" onClick={() => setQuestions(config.questions.filter(q => q.id !== question.id))} variant="link" size="auto">Remove screening question {index + 1}</Button>}</div>
      </fieldset>)}
      {config.questions.length < 12 && <Button type="button" className="study-secondary" onClick={() => setQuestions([...config.questions, newScreeningQuestion()])} variant="outline" size="auto">Add screening question</Button>}
      <p className="study-help">Screening and the study preview are frozen when you publish. Changes require a new study version.</p>
    </fieldset>}
  </section>;
}
