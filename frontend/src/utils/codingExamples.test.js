import test from 'node:test';
import assert from 'node:assert/strict';
import {codingExamples,addExampleTheme,removeExampleTheme,setNoMatchExample} from './codingExamples.js';
test('untouched responses stay separate from intentional no-match examples and all themes survive',()=>{
  const a={name:'A'}, b={name:'B'};
  const rows=[{original:'Untouched',themes:[]},setNoMatchExample({original:'No match'},true),addExampleTheme(addExampleTheme({original:'Both'},a),b)];
  assert.deepEqual(codingExamples(rows),[{index:1,themes:[]},{index:2,themes:[a,b]}]);
  assert.deepEqual(codingExamples([removeExampleTheme({themes:[a],coding_complete:true},'A')]),[]);
  assert.deepEqual(codingExamples([setNoMatchExample(rows[1],false)]),[]);
  assert.deepEqual(codingExamples([{themes:[{name:'Unclassified'}]}]),[{index:0,themes:[]}]);
  assert.deepEqual(addExampleTheme({themes:[{name:'Unclassified'}]},a).themes,[a]);
});
