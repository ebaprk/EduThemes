import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanScreeningBranches,recruitmentCounts } from './recruitment.js';
test('removing a question or answer clears dependent branching rather than leaving invalid references',()=>{
 const questions=[{id:'a',options:[{id:'yes'}]},{id:'b',options:[{id:'text'}],show_if:{question_id:'a',option_id:'yes'}}];
 assert.deepEqual(cleanScreeningBranches(questions)[1].show_if,questions[1].show_if);
 assert.equal(cleanScreeningBranches(questions.slice(1))[0].show_if,null);
 assert.equal(cleanScreeningBranches([{...questions[0],options:[{id:'no'}]},questions[1]])[1].show_if,null);
});
test('recruitment stages are distinct current statuses and never count enrollment as an extra applicant',()=>{
 const counts=recruitmentCounts([{status:'awaiting_review'},{status:'eligible'},{status:'enrolled'},{status:'completed'}]);
 assert.equal(counts.invited,0); assert.equal(counts.enrolled,1); assert.equal(counts.completed,1);
 assert.equal(Object.values(counts).reduce((sum,count)=>sum+count,0),4);
});

test('a completed local review is not marked stale while the previous list refreshes', async () => {
  const { applicationIsStale } = await import('./recruitment.js');
  const selected={revision:4,status:'invited'};
  assert.equal(applicationIsStale(selected,{revision:3,status:'eligible'}),false);
  assert.equal(applicationIsStale(selected,{revision:4,status:'invited'}),false);
  assert.equal(applicationIsStale(selected,{revision:4,status:'enrolled'}),true);
  assert.equal(applicationIsStale(selected,{revision:5,status:'enrolled'}),true);
});
