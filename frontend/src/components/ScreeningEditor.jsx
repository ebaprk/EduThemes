import React from 'react';
import { cleanScreeningBranches, newScreeningQuestion, recruitmentDraft } from '../utils/recruitment';

export default function ScreeningEditor({ value, onChange, disabled, mode }) {
  const config = recruitmentDraft(value);
  const set = (field, next) => onChange({ ...config, [field]: next });
  const setQuestions = questions => set('questions', cleanScreeningBranches(questions));
  const questionChange = (id, field, next) => setQuestions(config.questions.map(q => q.id === id ? { ...q, [field]: next } : q));
  return <section className="study-editor-section screening-editor" aria-labelledby="screening-heading">
    <div className="study-editor-section-title"><h3 id="screening-heading">Recruitment and screening</h3><p>Review volunteers before inviting them to join. Screening answers are kept separate from research responses.</p></div>
    <label className="study-check-choice"><input type="checkbox" checked={config.enabled} disabled={disabled || mode !== 'anonymous'} onChange={event => onChange({ ...config, enabled: event.target.checked, questions: config.questions.length ? config.questions : [newScreeningQuestion()] })} />Require screening and a researcher invitation</label>
    {mode !== 'anonymous' && <p className="study-help">Choose anonymous participation to use private recruitment and study return links.</p>}
    {config.enabled && <fieldset disabled={disabled} className="study-unframed-fieldset">
      <div className="study-form-grid">
        <div className="study-field"><label htmlFor="screening-eligibility">Who can take part?</label><textarea id="screening-eligibility" value={config.eligibility} onChange={event => set('eligibility',event.target.value)} maxLength={2000} rows={3} required placeholder="Describe the study’s eligibility criteria." /></div>
        <div className="study-field"><label htmlFor="screening-location">Location or format</label><input id="screening-location" value={config.location} onChange={event => set('location',event.target.value)} maxLength={300} required /><label htmlFor="screening-time">Estimated total participation time (minutes)</label><input id="screening-time" type="number" min={1} max={1440} step={1} value={config.estimated_minutes} onChange={event => set('estimated_minutes',event.target.value)} required /></div>
      </div>
      <div className="study-field"><label htmlFor="screening-notice">Screening information and permission</label><textarea id="screening-notice" value={config.notice} onChange={event => set('notice',event.target.value)} maxLength={10000} rows={4} required placeholder="Explain why you collect these answers, who reviews them, and the screening permissions appropriate to your study." /><p className="study-help">Participants accept this before submitting screening answers. Study participation consent is requested separately after an invitation.</p></div>
      <p className="study-note">Answer rules flag applications for review. A researcher makes every eligibility and invitation decision.</p>
      {config.questions.map((question,index) => <fieldset className="screening-question" key={question.id}>
        <legend>Screening question {index + 1}</legend>
        <div className="study-field"><label htmlFor={`screen-prompt-${question.id}`}>Question {index + 1} prompt</label><textarea id={`screen-prompt-${question.id}`} value={question.prompt} onChange={event => questionChange(question.id,'prompt',event.target.value)} rows={2} maxLength={1000} required /></div>
        {index > 0 && <div className="study-field"><label htmlFor={`screen-branch-${question.id}`}>Show this question</label><select id={`screen-branch-${question.id}`} value={question.show_if ? `${question.show_if.question_id}:${question.show_if.option_id}` : ''} onChange={event => { const [question_id,option_id] = event.target.value.split(':'); questionChange(question.id,'show_if',question_id ? { question_id, option_id } : null); }}><option value="">Always</option>{config.questions.slice(0,index).flatMap((prior,position) => prior.options.map(option => <option value={`${prior.id}:${option.id}`} key={`${prior.id}:${option.id}`}>When question {position + 1} is “{option.label || 'Untitled choice'}”</option>))}</select></div>}
        <p className="study-help">Each volunteer chooses one answer. Clear “Matches criteria” to flag an answer for closer review.</p>
        {question.options.map((option,position) => <div className="screening-option" key={option.id}>
          <div className="study-field"><label htmlFor={`screen-option-${question.id}-${option.id}`}>Question {index + 1}, choice {position + 1}</label><input id={`screen-option-${question.id}-${option.id}`} value={option.label} maxLength={300} required onChange={event => questionChange(question.id,'options',question.options.map(o => o.id === option.id ? { ...o, label:event.target.value } : o))} /></div>
          <label className="study-check-choice"><input type="checkbox" checked={option.qualifies} onChange={event => questionChange(question.id,'options',question.options.map(o => o.id === option.id ? { ...o, qualifies:event.target.checked } : o))} />Matches criteria</label>
          {question.options.length > 2 && <button type="button" className="study-text-button" aria-label={`Remove choice ${position + 1} from question ${index + 1}`} onClick={() => questionChange(question.id,'options',question.options.filter(o => o.id !== option.id))}>Remove</button>}
        </div>)}
        <div className="study-actions">{question.options.length < 8 && <button type="button" className="study-secondary" onClick={() => questionChange(question.id,'options',[...question.options,{ id:crypto.randomUUID(),label:'',qualifies:true }])}>Add answer choice</button>}{config.questions.length > 1 && <button type="button" className="study-text-button" onClick={() => setQuestions(config.questions.filter(q => q.id !== question.id))}>Remove screening question {index + 1}</button>}</div>
      </fieldset>)}
      {config.questions.length < 12 && <button type="button" className="study-secondary" onClick={() => setQuestions([...config.questions,newScreeningQuestion()])}>Add screening question</button>}
      <p className="study-help">Screening and the study preview are frozen when you publish. Changes require a new study version.</p>
    </fieldset>}
  </section>;
}
