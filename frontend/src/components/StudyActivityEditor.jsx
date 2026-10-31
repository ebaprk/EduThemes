import React from 'react';
import { activityKinds, newActivity } from '../utils/studyActivities';

export default function StudyActivityEditor({ activities, onChange, disabled, multipleAllowed = true }) {
  const change = (index, field, value) => onChange(activities.map((activity, position) => position === index ? { ...activity, [field]: value } : activity));
  const move = (index, direction) => {
    const next = [...activities];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next.map((activity, position) => position === 0 ? { ...activity, opens_after_days: 0 } : activity));
  };
  return <fieldset className="study-activities-editor" disabled={disabled}>
    <div className="study-section-heading"><div><h3>Study activities</h3><p className="study-help">Start with one activity, or add follow-ups and diary entries. Each published plan keeps its questions and consent together.</p></div><span>{activities.length} of 12</span></div>
    {activities.map((activity, index) => <fieldset className="study-activity-editor" key={index}>
      <legend>Activity {index + 1}</legend>
      <div className="study-actions study-activity-order">
        {index > 0 && <button type="button" className="study-text-button" onClick={() => move(index, -1)}>Move up</button>}
        {index < activities.length - 1 && <button type="button" className="study-text-button" onClick={() => move(index, 1)}>Move down</button>}
        {activities.length > 1 && <button type="button" className="study-text-button" onClick={() => onChange(activities.filter((_, position) => position !== index).map((item, position) => position ? item : { ...item, opens_after_days: 0 }))}>Remove activity {index + 1}</button>}
      </div>
      <div className="study-editor-grid">
        <div className="study-field"><label htmlFor={`activity-title-${index}`}>Activity {index + 1} title</label><input id={`activity-title-${index}`} value={activity.title} onChange={(event) => change(index, 'title', event.target.value)} maxLength={120} required /></div>
        <div className="study-field"><label htmlFor={`activity-kind-${index}`}>Activity {index + 1} type</label><select id={`activity-kind-${index}`} value={activity.kind} onChange={(event) => change(index, 'kind', event.target.value)}>{Object.entries(activityKinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      </div>
      <div className="study-field"><label htmlFor={`activity-instructions-${index}`}>Activity {index + 1} instructions <span>(optional)</span></label><textarea id={`activity-instructions-${index}`} value={activity.instructions} onChange={(event) => change(index, 'instructions', event.target.value)} rows={2} maxLength={5000} /></div>
      {activities.length > 1 && <>
        <div className="study-editor-grid">
          <div className="study-field"><label htmlFor={`activity-opens-${index}`}>Opens on day after joining</label><input id={`activity-opens-${index}`} type="number" min={0} max={3650} step={1} value={index ? activity.opens_after_days : 0} onChange={(event) => change(index, 'opens_after_days', event.target.value)} readOnly={index === 0} required /></div>
          <div className="study-field"><label htmlFor={`activity-due-${index}`}>Due on day after joining <span>(optional)</span></label><input id={`activity-due-${index}`} type="number" min={Number(activity.opens_after_days) || 0} max={3650} step={1} value={activity.due_after_days ?? ''} onChange={(event) => change(index, 'due_after_days', event.target.value)} /></div>
        </div>
        <label className="study-check-choice"><input type="checkbox" checked={activity.required} onChange={(event) => change(index, 'required', event.target.checked)} /> Required for study completion</label>
        <p className="study-help">Activities unlock after earlier required activities are submitted and their opening day arrives. Due dates guide participants; late responses are still accepted.</p>
      </>}
      <div className="study-question-heading"><h4>Open response questions</h4><span>{activity.questions.length} of 12</span></div>
      {activity.questions.map((question, questionIndex) => <div className="study-question-row" key={questionIndex}>
        <label htmlFor={`activity-${index}-question-${questionIndex}`}>{activities.length > 1 ? `Activity ${index + 1} · ` : ''}Question {questionIndex + 1}</label>
        <textarea id={`activity-${index}-question-${questionIndex}`} value={question} onChange={(event) => change(index, 'questions', activity.questions.map((value, position) => position === questionIndex ? event.target.value : value))} rows={2} maxLength={1000} required placeholder="Ask an open ended question" />
        {activity.questions.length > 1 && <button type="button" className="study-text-button" onClick={() => change(index, 'questions', activity.questions.filter((_, position) => position !== questionIndex))}>Remove question {questionIndex + 1}</button>}
      </div>)}
      {activity.questions.length < 12 && <button type="button" className="study-secondary" onClick={() => change(index, 'questions', [...activity.questions, ''])}>+ Add question</button>}
    </fieldset>)}
    {activities.length < 12 && <button type="button" className="study-secondary" disabled={!multipleAllowed} onClick={() => onChange([...activities, newActivity(activities.length)])}>+ Add activity</button>}
  </fieldset>;
}
