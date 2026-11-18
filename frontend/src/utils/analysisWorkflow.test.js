import assert from 'node:assert/strict';
import test from 'node:test';
import {analysisNavigation,analysisTask} from './analysisWorkflow.js';

test('study coding returns to its question list and skips the import step',()=>{
 const source={studyId:'study',questionId:'question',versionId:'v1'};
 const start=analysisNavigation(source,2);
 assert.deepEqual(start.steps.map(s=>s.label),['Code examples','Review coding','Findings']);
 assert.equal(start.index,0);assert.equal(start.back,'/studies/study?section=analysis&version=v1');
 assert.equal(analysisNavigation(source,3).back,'/studies/study/questions/question/code?version=v1');
 assert.equal(analysisNavigation(source,4).index,2);
});
test('file imports retain the full import, code, review, findings journey',()=>{
 const flow=analysisNavigation(null,2);assert.equal(flow.steps.length,4);assert.equal(flow.index,1);assert.equal(flow.back,'/upload');
});
test('finished questions open saved findings rather than starting another run',()=>{
 assert.equal(analysisTask({count:4,analysis:{stage:'results'},runs:[{}],needsWork:false,newCount:0}).kind,'findings');
 assert.equal(analysisTask({count:5,analysis:{stage:'results'},runs:[{}],needsWork:true,newCount:1}).label,'Analyze new responses');
});
test('unfinished coding resumes even when historical findings exist',()=>{
 assert.equal(analysisTask({count:4,analysis:{stage:'review'},runs:[{}],needsWork:true}).label,'Continue review');
 assert.equal(analysisTask({count:4,analysis:{stage:'code'},runs:[],needsWork:true}).kind,'resume');
 assert.equal(analysisTask({count:4,runs:[],needsWork:true}).label,'Start coding');
 assert.equal(analysisTask({count:0,runs:[]}).kind,'collect');
});

test('findings tabs keep the real study address, historical run, and version',async()=>{
 const {findingsTabUrl}=await import('./analysisWorkflow.js');
 const source={studyId:'a',questionId:'b',versionId:'v1'};
 assert.equal(findingsTabUrl(source,'?version=old&run=original','report'),'/studies/a/questions/b/results?version=old&run=original&tab=report');
 assert.equal(findingsTabUrl(source,'?run=original&tab=report','summary'),'/studies/a/questions/b/results?run=original&version=v1');
 assert.equal(findingsTabUrl(null,'?tab=report','summary'),'/results');
 assert.equal(findingsTabUrl(source,'?version=old&run=original','themes','Access & privacy'),'/studies/a/questions/b/results?version=old&run=original&tab=themes&theme=Access+%26+privacy');
 assert.equal(findingsTabUrl(null,'?tab=themes&theme=Planning','report'),'/results?tab=report');
});
