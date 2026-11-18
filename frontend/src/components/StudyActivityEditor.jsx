import React from 'react';
import { activityKinds, newActivity } from '../utils/studyActivities';
import { Button } from "@eduthemes/ui/components/button";
import { Label } from "@eduthemes/ui/components/label";
import { Input } from "@eduthemes/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@eduthemes/ui/components/native-select";
import { Textarea } from "@eduthemes/ui/components/textarea";
import { Checkbox } from "@eduthemes/ui/components/checkbox";
export default function StudyActivityEditor({
  activities,
  onChange,
  disabled,
  multipleAllowed = true
}) {
  const change = (index, field, value) => onChange(activities.map((activity, position) => position === index ? {
    ...activity,
    [field]: value
  } : activity));
  const move = (index, direction) => {
    const next = [...activities];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next.map((activity, position) => position === 0 ? {
      ...activity,
      opens_after_days: 0
    } : activity));
  };
  return <fieldset className="study-activities-editor" disabled={disabled}>
    <legend className="sr-only">Study activities</legend>
    {activities.map((activity, index) => <fieldset className="study-activity-editor" key={index}>
      <legend className="sr-only">Activity {index + 1}</legend>
      {activities.length > 1 && <div className="study-activity-heading">
        <h4>{activity.title.trim() || `Activity ${index + 1}`}</h4>
        <div className="study-actions study-activity-order">
          {index > 0 && <Button type="button" onClick={() => move(index, -1)} variant="ghost" aria-label={`Move activity ${index + 1} up`}>Move up</Button>}
          {index < activities.length - 1 && <Button type="button" onClick={() => move(index, 1)} variant="ghost" aria-label={`Move activity ${index + 1} down`}>Move down</Button>}
          <Button type="button" onClick={() => onChange(activities.filter((_, position) => position !== index))}
            variant="ghost" aria-label={`Remove activity ${index + 1}`}>Remove</Button>
        </div>
      </div>}
      {activity.questions.map((question, questionIndex) => <div className="study-question-row" key={questionIndex}>
        <Label htmlFor={`activity-${index}-question-${questionIndex}`}>Question {questionIndex + 1}</Label>
        <Textarea id={`activity-${index}-question-${questionIndex}`} value={question} onChange={event => change(index, 'questions', activity.questions.map((value, position) => position === questionIndex ? event.target.value : value))} rows={2} maxLength={1000} required placeholder="Ask an open ended question" />
        {activity.questions.length > 1 && <Button type="button" className="study-text-button" onClick={() => change(index, 'questions', activity.questions.filter((_, position) => position !== questionIndex))} variant="link" size="auto">Remove question {questionIndex + 1}</Button>}
      </div>)}
      <div className="study-question-actions">{activity.questions.length < 12 && <Button type="button" className="study-secondary" onClick={() => change(index, 'questions', [...activity.questions, ''])} variant="outline">+ Add question</Button>}</div>
      <details className="study-activity-settings">
        <summary>Activity settings</summary>
        <div className="study-editor-grid">
          <div className="study-field"><Label htmlFor={`activity-title-${index}`}>Activity {index + 1} title</Label><Input id={`activity-title-${index}`} value={activity.title} onChange={event => change(index, 'title', event.target.value)} maxLength={120} required /></div>
          <div className="study-field"><Label htmlFor={`activity-kind-${index}`}>Activity {index + 1} type</Label><NativeSelect id={`activity-kind-${index}`} value={activity.kind} onChange={event => change(index, 'kind', event.target.value)}>{Object.entries(activityKinds).map(([value, label]) => <NativeSelectOption value={value} key={value}>{label}</NativeSelectOption>)}</NativeSelect></div>
        </div>
        <div className="study-field"><Label htmlFor={`activity-instructions-${index}`}>Activity {index + 1} instructions <span>(optional)</span></Label><Textarea id={`activity-instructions-${index}`} value={activity.instructions} onChange={event => change(index, 'instructions', event.target.value)} rows={2} maxLength={5000} /></div>
        {activities.length > 1 && <>
          <div className="study-editor-grid">
            <div className="study-field"><Label htmlFor={`activity-opens-${index}`}>Opens on day after joining</Label><Input id={`activity-opens-${index}`} type="number" min={0} max={3650} step={1} value={index ? activity.opens_after_days : 0} onChange={event => change(index, 'opens_after_days', event.target.value)} readOnly={index === 0} required /></div>
            <div className="study-field"><Label htmlFor={`activity-due-${index}`}>Due on day after joining <span>(optional)</span></Label><Input id={`activity-due-${index}`} type="number" min={Number(activity.opens_after_days) || 0} max={3650} step={1} value={activity.due_after_days ?? ''} onChange={event => change(index, 'due_after_days', event.target.value)} /></div>
          </div>
          <Label className="study-check-choice"><Checkbox type="checkbox" checked={activity.required} onChange={event => change(index, 'required', event.target.checked)} /> Required for study completion</Label>
          <p className="study-help">Activities unlock after earlier required activities are submitted and their opening day arrives. Due dates guide participants; late responses are still accepted.</p>
        </>}
      </details>
    </fieldset>)}
    {activities.length < 12 && <Button type="button" className="study-secondary" disabled={!multipleAllowed} onClick={() => onChange([...activities, newActivity(activities.length)])} variant="outline" size="auto">+ Add activity</Button>}
  </fieldset>;
}
