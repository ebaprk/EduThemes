import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { LuX } from 'react-icons/lu';
import { visiblePreviewQuestions } from '../utils/studyWorkflow';
import { Dialog, DialogContent, DialogTitle } from "@eduthemes/ui/components/dialog";
import { Button } from "@eduthemes/ui/components/button";
import { Label } from "@eduthemes/ui/components/label";
import { Input } from "@eduthemes/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Textarea } from "@eduthemes/ui/components/textarea";
export default function StudyPreview({
  show,
  onHide,
  study
}) {
  const titleId = useId(),
    body = useRef(null);
  const [step, setStep] = useState(0),
    [screening, setScreening] = useState({}),
    [activityIndex, setActivityIndex] = useState(0),
    [questionIndex, setQuestionIndex] = useState(0);
  const steps = useMemo(() => ['Study information', ...(study?.recruitment?.enabled ? ['Screening'] : []), 'Consent', 'Activities'], [study?.recruitment?.enabled]);
  useEffect(() => {
    if (show) {
      setStep(0);
      setScreening({});
      setActivityIndex(0);
      setQuestionIndex(0);
    }
  }, [show]);
  useEffect(() => {
    if (show && body.current) body.current.scrollTop = 0;
  }, [show, step]);
  if (!study) return null;
  const current = steps[step],
    activities = study.activities || [],
    activity = activities[activityIndex],
    question = activity?.questions?.[questionIndex];
  const screeningQuestions = visiblePreviewQuestions(study.recruitment?.questions, screening);
  return <Dialog open={show} onOpenChange={open => {
    if (!open) onHide();
  }}><DialogContent className={"modal-content ui-workbench-dialog ui-dialog-lg " + "study-preview-modal"} showCloseButton={false}>
    <Button type="button" className="study-preview-close" aria-label="Close participant preview" onClick={onHide} variant="ghost" size="icon"><LuX aria-hidden="true" /></Button>
    <div ref={body} className="modal-body">
      <DialogTitle className="study-preview-title">Participant preview</DialogTitle>
      <p className="preview-notice" role="note">Preview only · No responses or consent decisions are saved.{study.isDraft ? ' You are viewing the draft.' : ` Published version ${study.version_number || ''}.`}</p>
      <nav className="preview-steps" aria-label="Participant preview steps" style={{
          '--preview-step-count': steps.length
        }}>{steps.map((label, index) => <Button type="button" key={label} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)} variant="ghost" size="auto">{label}</Button>)}</nav>
      <section className="participant-preview-canvas" key={current} aria-label={`${current} preview`}>
        {current === 'Study information' ? <>
          <h3>{study.title || 'Your study title'}</h3><p className="preview-introduction">{study.description || 'Add a participant introduction to explain the study.'}</p>
          <dl className="preview-facts">
            {study.recruitment?.enabled && <><div><dt>Who can take part</dt><dd>{study.recruitment.eligibility || 'Eligibility has not been added.'}</dd></div><div><dt>Time and location</dt><dd>{study.recruitment.estimated_minutes || '—'} minutes · {study.recruitment.location || 'Not specified'}</dd></div></>}
            <div><dt>Activities</dt><dd>{activities.length} {activities.length === 1 ? 'activity' : 'activities'} · {study.questions?.length || 0} {study.questions?.length === 1 ? 'question' : 'questions'}</dd></div>
            <div><dt>Participation</dt><dd>{study.participant_mode === 'canvas' ? 'Verified through Canvas' : study.recruitment?.enabled || activities.length > 1 ? 'A private return link connects progress' : 'Anonymous responses'}</dd></div>
            <div><dt>Compensation or credit</dt><dd>{study.compensation_details || 'Not specified'}</dd></div><div><dt>Study contact</dt><dd>{study.contact_info || 'No contact information added yet.'}</dd></div>
          </dl>
        </> : current === 'Screening' ? <>
          <h3>Screening and eligibility</h3><p className="study-consent-copy">{study.recruitment.notice || 'Add screening information and permission.'}</p><p className="study-help">Participants accept this screening information, answer the questions below, and wait for researcher review. Study consent is requested separately after an invitation.</p>
          {screeningQuestions.map((q, index) => <fieldset className="preview-screening-question" key={q.id}><legend>{index + 1}. {q.prompt || 'Untitled screening question'}</legend>{q.options?.map(option => <Label className="preview-choice" key={option.id}><Input type="radio" name={`preview-${q.id}`} checked={screening[q.id] === option.id} onChange={() => setScreening(previous => ({
                  ...previous,
                  [q.id]: option.id
                }))} />{option.label || 'Untitled choice'}</Label>)}</fieldset>)}
          <p className="study-help">Try different answers to preview conditional questions. Nothing is submitted.</p>
        </> : current === 'Consent' ? <>
          <h3>Before you take part</h3><div className="study-consent-copy">{study.consent_text || (study.consent_required === false && !study.isDraft ? 'This historical version has no recorded consent text.' : 'Add participant consent text before publishing.')}</div>
          <p>Participants review this version’s information and choose whether to agree before taking part.</p>
          {(activities.length > 1 || study.recruitment?.enabled) && <div className="preview-explanation"><h4>A private return link</h4><p>The participant separately agrees to connect progress with a study-specific code. They can copy or download their private return link.</p></div>}
          {study.participant_mode === 'canvas' && <div className="preview-explanation"><h4>Canvas sharing</h4><p>Participants review their verified Canvas details and separately confirm sharing them with the research team.</p></div>}
        </> : <>
          <h3>{activity?.title || 'Activities and questions'}</h3>
          {activities.length > 0 ? <><div className="preview-activity-picker"><Label htmlFor="preview-activity">Activity</Label><NativeSelect id="preview-activity" value={activityIndex} onChange={event => {
                  setActivityIndex(Number(event.target.value));
                  setQuestionIndex(0);
                }}>{activities.map((item, index) => <NativeSelectOption key={item.id || index} value={index}>{index + 1}. {item.title}</NativeSelectOption>)}</NativeSelect></div>
            <p className="study-help">{activity.required === false ? 'Optional' : 'Required'} · Opens on day {activity.opens_after_days || 0} after joining{activity.due_after_days != null ? ` · Due on day ${activity.due_after_days}` : ''}</p>{activity.instructions && <p className="study-preserve-copy">{activity.instructions}</p>}
            <div className="preview-question-canvas"><span className="study-eyebrow">Question {questionIndex + 1} of {activity.questions?.length || 0}</span><h4>{question?.prompt || 'Add a question to this activity.'}</h4><Label className="sr-only" htmlFor="preview-response">Preview response</Label><Textarea id="preview-response" key={`${activityIndex}-${questionIndex}`} placeholder="A participant’s answer appears here…" rows={4} maxLength={10000} /></div>
            <div className="study-actions preview-question-actions"><Button type="button" className="study-secondary" disabled={questionIndex === 0} onClick={() => setQuestionIndex(index => index - 1)} variant="outline" size="auto">Previous question</Button><Button type="button" className="study-secondary" disabled={questionIndex >= (activity.questions?.length || 0) - 1} onClick={() => setQuestionIndex(index => index + 1)} variant="outline" size="auto">Next question</Button></div><p className="study-help">The participant reviews answers before submitting and receives a consent receipt afterward. Multiple activities remain available in their private study hub.</p>
          </> : <p>Add an activity and questions in the study editor.</p>}
        </>}
      </section>
      <div className="preview-navigation"><span className="study-help">{step + 1} of {steps.length} · {current}</span><div className="study-actions">{step > 0 && <Button type="button" className="study-secondary" onClick={() => setStep(index => index - 1)} variant="outline" size="auto">Previous step</Button>}{step < steps.length - 1 ? <Button type="button" className="study-primary" onClick={() => setStep(index => index + 1)} variant="default" size="auto">Next step</Button> : <Button type="button" className="study-primary" onClick={onHide} variant="default" size="auto">Finish preview</Button>}</div></div>
    </div>
  </DialogContent></Dialog>;
}
