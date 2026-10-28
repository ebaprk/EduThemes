import { csvCell } from './participantData.js';

export const activityKinds = { survey: 'Open response', baseline: 'Baseline', followup: 'Follow-up', diary: 'Diary entry' };
export const rewardStatuses = { not_recorded: 'Not recorded', not_applicable: 'Not applicable',
  awaiting_completion: 'Awaiting completion', ready: 'Ready for handoff', handed_off: 'Handed off', confirmed: 'Confirmed externally' };

export function newActivity(index = 0) {
  return { title: index ? `Follow-up ${index}` : 'Study response', kind: index ? 'followup' : 'survey',
    instructions: '', required: true, opens_after_days: index ? 7 : 0, due_after_days: null, questions: [''] };
}

export function activityDrafts(initial = {}) {
  const plan = initial.activity_plan?.length ? initial.activity_plan : initial.activities;
  return plan?.length ? plan.map((activity, index) => ({ ...newActivity(index), ...activity,
    questions: activity.questions?.length ? activity.questions.map((question) => typeof question === 'string' ? question : question.prompt) : [''] }))
    : [{ ...newActivity(), questions: initial.questions?.length ? initial.questions : [''] }];
}

export function studyDraftPayload(form) {
  const activities = form.activities.map((activity, index) => ({
    title: activity.title.trim(), kind: activity.kind, instructions: activity.instructions.trim(), required: activity.required,
    opens_after_days: index ? Number(activity.opens_after_days) : 0,
    due_after_days: form.activities.length === 1 || activity.due_after_days === '' || activity.due_after_days == null ? null : Number(activity.due_after_days),
    questions: activity.questions.map((question) => question.trim()),
  }));
  const fields = ['title', 'description', 'research_question', 'additional_context', 'consent_text', 'participant_mode', 'compensation_details', 'contact_info'];
  return { ...Object.fromEntries(fields.map((key) => [key, (form[key] || '').trim()])),
    activities, questions: activities.flatMap((activity) => activity.questions) };
}

export function enrollmentComplete(participant) {
  return Number(participant.required_count) > 0 && Number(participant.completed_required) >= Number(participant.required_count);
}

export function operationsMetrics(participants) {
  return { enrolled: participants.length, started: participants.filter((participant) => participant.started).length,
    completed: participants.filter(enrollmentComplete).length,
    overdue: participants.filter((participant) => Number(participant.overdue_count) > 0).length };
}

export function completionHandoffCsv(title, participants) {
  const rows = [['Study', 'Study reference', 'Version', 'Joined at', 'Required activities completed', 'Required activities',
    'All activities completed', 'Completion status', 'Compensation or credit status', 'Status updated at'],
    ...participants.map((participant) => [title, participant.participant_reference, participant.version_number, participant.joined_at,
      participant.completed_required, participant.required_count, participant.completed_activities,
      enrollmentComplete(participant) ? 'Completed' : 'In progress', rewardStatuses[participant.reward_status], participant.reward_updated_at])];
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
