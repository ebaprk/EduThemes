export const runKey = analysis => analysis?.results?._run_id || `legacy-${analysis?.revision || 0}`;
export function completedRuns(analysis) {
  if (!analysis) return [];
  const history = analysis.results?._completed || [];
  const candidates = analysis.stage === 'results' && analysis.results && !analysis.results._draft ? [analysis, ...history] : history;
  const seen = new Set();
  return candidates.filter(run => { const key=runKey(run); if(seen.has(key)) return false; seen.add(key); return true; });
}
export function retainedRuns(analysis) {
  return completedRuns(analysis).map(run => ({ ...run, results: { ...run.results, _run_id: runKey(run), _completed: undefined, _draft: undefined } }));
}
export function findRun(analysis, key) {
  const runs = completedRuns(analysis);
  if (!key || key === 'latest') return runs[0];
  if (/^\d+$/.test(String(key))) return runs[Number(key)];
  return runs.find(run => runKey(run) === key);
}
export function resultsSnapshot(results, retained = [], runId) {
  if (!results && !retained.length && !runId) return null;
  return { ...(results || {_draft:true}), ...(runId ? {_run_id:runId} : {}), _completed:retained };
}
