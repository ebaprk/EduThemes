import test from 'node:test';
import assert from 'node:assert/strict';
import { completedRuns, retainedRuns, resultsSnapshot, findRun, runKey } from './analysisHistory.js';
const finished = {stage:'results', revision:4, coded_responses:[{original:'a',themes:[{name:'Support'}]}], results:{summary:'Original',themes:[{name:'Support',frequency:1}]}};
test('starting and saving a draft run preserves complete evidence from finished runs', () => {
 const retained=retainedRuns(finished);
 const draft={stage:'code',coded_responses:[{original:'b',themes:[]}],results:resultsSnapshot(null,retained)};
 assert.deepEqual(completedRuns(draft)[0].coded_responses,finished.coded_responses);
 assert.equal(completedRuns(draft)[0].results.summary,'Original');
 const second={...draft,stage:'results',results:resultsSnapshot({summary:'Replacement'},retained)};
 assert.deepEqual(completedRuns(second).map(r=>r.results.summary),['Replacement','Original']);
 assert.equal(retainedRuns(second)[0].results._completed,undefined);
 assert.equal(JSON.parse(JSON.stringify(second)).results._completed.length,1);
});
test('legacy findings remain readable and an unfinished run is never presented as finished', () => {
 assert.deepEqual(completedRuns(null),[]);
 assert.deepEqual(completedRuns({stage:'review',results:null}),[]);
 assert.equal(completedRuns(finished)[0],finished);
 assert.equal(resultsSnapshot(null,[]),null);
 assert.equal(finished.results._completed,undefined);
});
test('drafts carry a stable run identifier before findings exist', () => {
 const snapshot=resultsSnapshot(null,[],'run-one');
 assert.equal(snapshot._run_id,'run-one');
 assert.equal(snapshot._draft,true);
 assert.equal(completedRuns({stage:'code',results:snapshot}).length,0);
});

test('a completed run link stays attached to the same evidence when newer runs finish', () => {
 const original={...finished,results:{...finished.results,_run_id:'first'}};
 const replacement={...finished,results:resultsSnapshot({summary:'New'},retainedRuns(original),'second')};
 assert.equal(findRun(replacement,'first').results.summary,'Original');
 assert.equal(runKey(findRun(replacement,'latest')),'second');
 assert.equal(findRun(replacement,'missing'),undefined);
 assert.equal(completedRuns({...original,results:{...original.results,_completed:[original]}}).length,1);
});
