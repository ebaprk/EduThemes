export const recruitmentStatuses = { awaiting_review: 'Awaiting review', eligible: 'Eligible', waitlisted: 'Waitlisted', not_eligible: 'Not eligible', invited: 'Invited', enrolled: 'Enrolled', completed: 'Completed' };
export function newScreeningQuestion() {
  return { id: crypto.randomUUID(), prompt: '', show_if: null, options: [
    { id: crypto.randomUUID(), label: 'Yes', qualifies: true }, { id: crypto.randomUUID(), label: 'No', qualifies: false },
  ] };
}
export function recruitmentDraft(config) {
  return { enabled: false, eligibility: '', estimated_minutes: 10, location: 'Online', notice: '', questions: [], ...config };
}
export function cleanScreeningBranches(questions) {
  return questions.map((question, index) => ({ ...question, show_if: question.show_if && questions.slice(0,index).some(previous =>
    previous.id === question.show_if.question_id && previous.options.some(option => option.id === question.show_if.option_id)) ? question.show_if : null }));
}
export function recruitmentCounts(applicants) {
  return Object.fromEntries(Object.keys(recruitmentStatuses).map(status => [status, applicants.filter(applicant => applicant.status === status).length]));
}
export function applicationIsStale(selected, latest) {
  return Boolean(selected && latest && (latest.revision > selected.revision
    || (latest.revision === selected.revision && latest.status !== selected.status)));
}
