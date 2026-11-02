import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { visiblePreviewQuestions } from '../utils/studyWorkflow';

export default function StudyPreview({ show, onHide, study }) {
  const [step,setStep]=useState(0), [screening,setScreening]=useState({}), [activityIndex,setActivityIndex]=useState(0), [questionIndex,setQuestionIndex]=useState(0);
  const steps=useMemo(()=>['Study information',...(study?.recruitment?.enabled?['Screening']:[]),'Consent','Activities'],[study?.recruitment?.enabled]);
  useEffect(()=>{if(show){setStep(0);setScreening({});setActivityIndex(0);setQuestionIndex(0);}},[show]);
  if(!study)return null;
  const current=steps[step], activities=study.activities || [], activity=activities[activityIndex], question=activity?.questions?.[questionIndex];
  const screeningQuestions=visiblePreviewQuestions(study.recruitment?.questions,screening);
  return <Modal show={show} onHide={onHide} size="lg" centered scrollable className="study-preview-modal">
    <Modal.Header closeButton><div><span className="study-eyebrow">Participant experience</span><Modal.Title>{study.title || 'Untitled study'}</Modal.Title></div></Modal.Header>
    <Modal.Body>
      <div className="preview-notice" role="note">Preview only · No responses or consent decisions are saved.{study.isDraft?' You are viewing the draft.':` Published version ${study.version_number || ''}.`}</div>
      <nav className="preview-steps" aria-label="Participant preview steps">{steps.map((label,index)=><button type="button" key={label} aria-current={step===index?'step':undefined} onClick={()=>setStep(index)}><span aria-hidden="true">{index+1}</span>{label}</button>)}</nav>
      <div className="participant-preview-canvas" key={current}>
        {current==='Study information'?<>
          <span className="study-eyebrow">Welcome to the study</span><h2>{study.title || 'Your study title'}</h2><p className="preview-introduction">{study.description || 'Add a participant introduction to explain the study.'}</p>
          <dl className="preview-facts">
            {study.recruitment?.enabled&&<><div><dt>Who can take part</dt><dd>{study.recruitment.eligibility || 'Eligibility has not been added.'}</dd></div><div><dt>Time and location</dt><dd>{study.recruitment.estimated_minutes || '—'} minutes · {study.recruitment.location || 'Not specified'}</dd></div></>}
            <div><dt>Activities</dt><dd>{activities.length} {activities.length===1?'activity':'activities'} · {study.questions?.length || 0} questions</dd></div>
            <div><dt>Participation</dt><dd>{study.participant_mode==='canvas'?'Verified through Canvas':study.recruitment?.enabled||activities.length>1?'A private return link connects progress':'Anonymous responses'}</dd></div>
            <div><dt>Compensation or credit</dt><dd>{study.compensation_details || 'Not specified'}</dd></div><div><dt>Study contact</dt><dd>{study.contact_info || 'No contact information added yet.'}</dd></div>
          </dl>
        </>:current==='Screening'?<>
          <span className="study-eyebrow">Before joining</span><h2>Screening and eligibility</h2><p className="study-consent-copy">{study.recruitment.notice || 'Add screening information and permission.'}</p><p className="study-help">Participants accept this screening information, answer the questions below, and wait for researcher review. Study consent is requested separately after an invitation.</p>
          {screeningQuestions.map((q,index)=><fieldset className="preview-screening-question" key={q.id}><legend>{index+1}. {q.prompt || 'Untitled screening question'}</legend>{q.options?.map(option=><label className="preview-choice" key={option.id}><input type="radio" name={`preview-${q.id}`} checked={screening[q.id]===option.id} onChange={()=>setScreening(previous=>({...previous,[q.id]:option.id}))}/>{option.label || 'Untitled choice'}</label>)}</fieldset>)}
          <p className="study-help">Try different answers to preview conditional questions. Nothing is submitted.</p>
        </>:current==='Consent'?<>
          <span className="study-eyebrow">An explicit choice</span><h2>Before you take part</h2><div className="study-consent-copy">{study.consent_text || (study.consent_required===false&&!study.isDraft?'This historical version has no recorded consent text.':'Add participant consent text before publishing.')}</div>
          <p>Participants review this version’s information and choose whether to agree before taking part.</p>
          {(activities.length>1||study.recruitment?.enabled)&&<div className="preview-explanation"><h3>A private return link</h3><p>The participant separately agrees to connect progress with a study-specific code. They can copy or download their private return link.</p></div>}
          {study.participant_mode==='canvas'&&<div className="preview-explanation"><h3>Canvas sharing</h3><p>Participants review their verified Canvas details and separately confirm sharing them with the research team.</p></div>}
        </>:<>
          <span className="study-eyebrow">Activity plan</span><h2>{activity?.title || 'Activities and questions'}</h2>
          {activities.length>0?<><div className="preview-activity-picker"><label htmlFor="preview-activity">Activity</label><select id="preview-activity" value={activityIndex} onChange={event=>{setActivityIndex(Number(event.target.value));setQuestionIndex(0);}}>{activities.map((item,index)=><option key={item.id || index} value={index}>{index+1}. {item.title}</option>)}</select></div>
            <p className="study-help">{activity.required===false?'Optional':'Required'} · Opens on day {activity.opens_after_days || 0} after joining{activity.due_after_days!=null?` · Due on day ${activity.due_after_days}`:''}</p>{activity.instructions&&<p className="study-preserve-copy">{activity.instructions}</p>}
            <div className="preview-question-canvas"><span className="study-eyebrow">Question {questionIndex+1} of {activity.questions?.length || 0}</span><h3>{question?.prompt || 'Add a question to this activity.'}</h3><label className="visually-hidden" htmlFor="preview-response">Preview response</label><textarea id="preview-response" key={`${activityIndex}-${questionIndex}`} placeholder="A participant’s answer appears here…" rows={4} maxLength={10000}/></div>
            <div className="study-actions preview-question-actions"><button type="button" className="study-secondary" disabled={questionIndex===0} onClick={()=>setQuestionIndex(index=>index-1)}>Previous question</button><button type="button" className="study-secondary" disabled={questionIndex>=(activity.questions?.length || 0)-1} onClick={()=>setQuestionIndex(index=>index+1)}>Next question</button></div><p className="study-help">The participant reviews answers before submitting and receives a consent receipt afterward. Multiple activities remain available in their private study hub.</p>
          </>:<p>Add an activity and questions in the study editor.</p>}
        </>}
      </div>
    </Modal.Body>
    <Modal.Footer><span className="study-help">{step+1} of {steps.length} · {current}</span><div className="study-actions"><button type="button" className="study-secondary" disabled={step===0} onClick={()=>setStep(index=>index-1)}>Previous step</button>{step<steps.length-1?<button type="button" className="study-primary" onClick={()=>setStep(index=>index+1)}>Next step</button>:<button type="button" className="study-primary" onClick={onHide}>Finish preview</button>}</div></Modal.Footer>
  </Modal>;
}
