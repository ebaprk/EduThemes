export function responsesForQuestion(questionId, submissions, savedAnalysis = null) {
  if (savedAnalysis) return savedAnalysis.coded_responses.map((entry) => entry.original);
  return submissions
    .map((submission) => submission.answers?.[questionId])
    .filter((answer) => typeof answer === 'string' && answer.trim());
}

export function responsesToCsv(responses) {
  return `Response\n${responses.map((answer) => `"${answer.replaceAll('"', '""')}"`).join('\n')}`;
}
