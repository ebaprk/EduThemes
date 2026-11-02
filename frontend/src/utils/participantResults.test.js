import assert from 'node:assert/strict';
import test from 'node:test';
import { resultsFingerprint, participantResultsText } from './participantResults.js';
test('results drafts compare normalized text and source provenance independent of selection order',()=>{
 const a={question_id:'a',run_key:'one',snapshot_hash:'h',review_revision:2},b={...a,question_id:'b'};
 assert.equal(resultsFingerprint({title:' Test '},[a,b]),resultsFingerprint({title:'Test'},[b,a]));
 assert.notEqual(resultsFingerprint({title:'Test'},[a]),resultsFingerprint({title:'Test'},[{...a,review_revision:3}]));
});
test('participant summary downloads include only the release text allowlist',()=>{
 const text=participantResultsText('Study',1,{release_number:2,released_at:'2026-11-02',content:{title:'Summary',findings:'Reviewed findings.',raw_answers:'PRIVATE'},sources:[{private:'SECRET'}],released_by:'ACTOR'});
 assert.match(text,/Results release 2/);assert.match(text,/Reviewed findings/);assert.doesNotMatch(text,/PRIVATE|SECRET|ACTOR/);
});
