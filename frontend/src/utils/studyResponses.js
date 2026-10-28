export function responsesForQuestion(questionId, submissions, savedAnalysis = null) {
  if (savedAnalysis) return savedAnalysis.coded_responses.map((entry) => entry.original);
  return submissions
    .map((submission) => submission.answers?.[questionId])
    .filter((answer) => typeof answer === 'string' && answer.trim());
}

export function responseRecordsForQuestion(questionId, submissions) {
  return submissions.filter((submission) => typeof submission.answers?.[questionId] === 'string' && submission.answers[questionId].trim())
    .map((submission) => ({ original: submission.answers[questionId], submission_id: submission.id,
      study_version_id: submission.study_version_id, question_id: questionId,
      ...(submission.activity_id ? { activity_id: submission.activity_id } : {}),
      ...(submission.enrollment_id ? { enrollment_id: submission.enrollment_id } : {}) }));
}

export function attachResponseSources(dataset, sources) {
  if (dataset.length !== sources.length || dataset.some((entry, index) => entry.original !== sources[index].original)) {
    throw new Error('The imported responses did not match their source records. No coding session was saved.');
  }
  return dataset.map((entry, index) => ({ ...entry, ...sources[index] }));
}

export function responsesToCsv(responses) {
  return `Response\n${responses.map((answer) => `"${answer.replaceAll('"', '""')}"`).join('\n')}`;
}
