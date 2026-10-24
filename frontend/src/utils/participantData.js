export const participantFields = [
  ['name', 'Name'], ['given_name', 'First name'], ['family_name', 'Last name'],
  ['email', 'Email'], ['academic_year', 'Academic year'], ['major', 'Major'],
  ['locale', 'Language'], ['course_name', 'Course'], ['course_code', 'Course code'],
  ['canvas_user_id', 'Canvas user ID'], ['canvas_course_id', 'Canvas course ID'],
  ['course_context_id', 'Course context ID'], ['roles', 'Canvas roles'],
  ['issuer', 'Canvas issuer'], ['client_id', 'Canvas client ID'],
  ['deployment_id', 'Canvas deployment ID'], ['subject', 'Canvas subject'],
  ['verified_at', 'Canvas verified at'], ['shared_at', 'Details shared at'],
];

export function participantDetails(profile = {}) {
  return participantFields.flatMap(([field, label]) => {
    const value = profile[field];
    const display = Array.isArray(value) ? value.join('; ') : value;
    return typeof display === 'string' && display ? [[label, display]] : [];
  });
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  // Spreadsheet exports must not execute user text as a formula.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function submissionsToCsv(submissions, questions) {
  const headers = ['Submission ID', 'Submitted at', 'Participant source',
    ...participantFields.map(([, label]) => label),
    ...questions.map((q) => `Question ${q.position + 1}: ${q.prompt}`)];
  const rows = submissions.map((submission) => {
    const profile = submission.participant_data || {};
    return [submission.id, submission.created_at, profile.source || 'anonymous',
      ...participantFields.map(([field]) => Array.isArray(profile[field]) ? profile[field].join('; ') : profile[field]),
      ...questions.map((question) => submission.answers?.[question.id] || '')];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
