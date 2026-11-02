export const resultsFields = [
  ['title', 'Summary title', 200, true],
  ['overview', 'What the study explored', 5000, true],
  ['findings', 'What we learned', 5000, true],
  ['limitations', 'What these findings cannot tell us', 5000, true],
  ['next_steps', 'What happens next', 5000, false],
  ['contact', 'Questions and study contact', 5000, true],
];
export const blankResults = () => Object.fromEntries(resultsFields.map(([key]) => [key, '']));
export const resultSourceKey = (source) => `${source.question_id}:${source.run_key}`;
export function resultsFingerprint(content, sources) {
  return JSON.stringify({ content: Object.fromEntries(resultsFields.map(([key]) => [key, String(content?.[key] || '').trim()])),
    sources: [...sources].map(({ question_id, run_key, snapshot_hash, review_revision }) => ({ question_id, run_key, snapshot_hash, review_revision })).sort((a, b) => resultSourceKey(a).localeCompare(resultSourceKey(b))) });
}
export function participantResultsText(studyTitle, version, release) {
  return [`${studyTitle} — participant results`, `Study version ${version} · Results release ${release.release_number}`,
    `Released ${release.released_at}`, ...resultsFields.flatMap(([key, label]) => release.content?.[key] ? [key === 'title' ? release.content[key] : `${label}\n${release.content[key]}`] : [])].join('\n\n');
}
