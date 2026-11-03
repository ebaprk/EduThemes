import assert from 'node:assert/strict';
import test from 'node:test';
import { studySearchUrl, workspaceNavigation } from './workspaceNavigation.js';
test('study search keeps entered text in the study library query',()=>{
  assert.equal(studySearchUrl('  advising & support  '),'/?q=advising+%26+support');
  assert.equal(studySearchUrl('  '),'/');
});
test('analysis back navigation preserves the viewed version and never borrows a different study context',()=>{
  assert.deepEqual(workspaceNavigation('/studies/a/questions/b/results','?version=old&run=earlier',{studyId:'other',versionId:'wrong'}),{back:'/studies/a?section=analysis&version=old',backLabel:'Back to study',title:'Saved findings'});
  assert.equal(workspaceNavigation('/studies/a/questions/b/code','',{studyId:'a',questionId:'b',versionId:'v1'}).back,'/studies/a?section=analysis&version=v1');
  assert.equal(workspaceNavigation('/studies/a/questions/b/code','',{studyId:'other',questionId:'b',versionId:'wrong'}).back,'/studies/a?section=analysis');
});
test('study destinations and imported analyses have explicit parent navigation',()=>{
  assert.deepEqual(workspaceNavigation('/studies/new'),{back:'/',backLabel:'All studies',title:'Create study'});
  assert.equal(workspaceNavigation('/studies/a','?section=team-coding').title,'Team coding');
  assert.equal(workspaceNavigation('/review').back,'/analysis');
  assert.equal(workspaceNavigation('/').back,undefined);
});
