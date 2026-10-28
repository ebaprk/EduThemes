export function recordReviewDecision(dataset, indices, theme, action, recordedAt = new Date().toISOString()) {
  return dataset.map((entry, index) => {
    if (!indices.includes(index)) return entry;
    const decisions = { ...entry.review_decisions };
    if (action) decisions[theme] = { action, recorded_at: recordedAt };
    else delete decisions[theme];
    return { ...entry, review_decisions: decisions };
  });
}
