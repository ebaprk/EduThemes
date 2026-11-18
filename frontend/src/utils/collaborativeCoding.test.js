import test from 'node:test';
import assert from 'node:assert/strict';
import {codingAgreement,responseComparison,codingRoundReport,codingDecisionDrafts,codingReliability,codingReliabilityPairs,codingReliabilityReport} from './collaborativeCoding.js';
const fixture=()=>({round:{state:'comparison',title:'Round',responses:[{id:'r1',original:'Private text'},{id:'r2'},{id:'r3'}],codebook:[{name:'A'},{name:'B'}]},assignments:[{coder_id:'1',response_ids:['r1','r2','r3'],submitted_at:'now',ballot:{r1:{themes:['B','A'],note:'Private note'},r2:{themes:[]},r3:{themes:['A']}}},{coder_id:'2',response_ids:['r1','r2'],submitted_at:'now',ballot:{r1:{themes:['A','B']},r2:{themes:['A']}}}],decisions:[]});
test('exact set agreement is order independent and uses only completed overlap',()=>{const a=codingAgreement(fixture());assert.equal(a.shared,2);assert.equal(a.pairs,2);assert.equal(a.matches,1);assert.equal(a.percent,50);assert.equal(a.singleCoded,1);assert.deepEqual(a.themes.map(t=>t.matches),[1,2]);});
test('three coders contribute three pairs per shared response; empty coding is explicit',()=>{const f=fixture();f.assignments.push({coder_id:'3',response_ids:['r2'],submitted_at:'now',ballot:{r2:{themes:[]}}});const a=codingAgreement(f);assert.equal(a.pairs,4);assert.equal(a.matches,2);assert.equal(a.unanimous,1);});
test('adjudication does not inflate original agreement and reports exclude private text and notes',()=>{const f=fixture();f.decisions=[{response_id:'r2',themes:['B'],rationale:'Private rationale'}];const rows=responseComparison(f);assert.deepEqual(rows[1].finalThemes,['B']);assert.equal(codingAgreement(f).percent,50);assert.equal(codingAgreement(f).resolved,1);const report=codingRoundReport(f);for(const text of ['Private text','Private note','Private rationale'])assert.equal(report.includes(text),false);assert.ok(report.includes('1/2 coder-pair comparisons (50.0%)'));});
test('coding state never computes hidden comparisons; disjoint samples have no agreement percentage',()=>{const f=fixture();f.round.state='coding';assert.deepEqual(responseComparison(f),[]);assert.equal(codingAgreement(f).percent,null);f.round.state='comparison';f.assignments[1].response_ids=[];assert.equal(codingAgreement(f).percent,null);});
test('unresolved disagreement has no preselected final choice, while an explicit no-match consensus stays empty',()=>{const f=fixture();assert.equal(codingDecisionDrafts(f).r2.themes,null);f.assignments[1].ballot.r2.themes=[];assert.deepEqual(codingDecisionDrafts(f).r2.themes,[]);});
test('per-theme kappa uses each fixed coder’s marginal frequencies on shared responses',()=>{
 const r=codingReliability(fixture());assert.equal(r.shared,2);assert.deepEqual(r.themes.map(t=>t.kappa),[0,1]);
 assert.deepEqual(r.themes.map(t=>[t.firstIncluded,t.secondIncluded]),[[1,2],[1,1]]);
 assert.equal(r.themes[0].expected,.5);
});
test('perfect constant coding has undefined kappa and missing coding is excluded',()=>{
 const f=fixture();for(const a of f.assignments)for(const row of Object.values(a.ballot))row.themes=[];
 const r=codingReliability(f);assert.equal(r.shared,2);assert.equal(r.themes[0].observed,1);assert.equal(r.themes[0].kappa,null);assert.match(r.themes[0].unavailable,/No variation/);
 delete f.assignments[1].ballot.r2;assert.equal(codingReliability(f).shared,1);
 f.assignments[1].response_ids=[];assert.equal(codingReliability(f).themes[0].kappa,null);assert.equal(codingReliability(f).shared,0);
});
test('opposite choices produce negative kappa and adjudication does not change it',()=>{
 const f=fixture();f.assignments[0].ballot.r1.themes=['A'];f.assignments[0].ballot.r2.themes=[];f.assignments[1].ballot.r1.themes=[];f.assignments[1].ballot.r2.themes=['A'];
 assert.equal(codingReliability(f).themes[0].kappa,-1);f.decisions=[{response_id:'r1',themes:['A']}];assert.equal(codingReliability(f).themes[0].kappa,-1);
});
test('hidden ballots cannot be measured and multiple coders stay in separate pairs',()=>{
 const f=fixture();f.round.state='coding';assert.equal(codingReliability(f),null);assert.deepEqual(codingReliabilityPairs(f),[]);
 f.round.state='comparison';f.assignments.push({...structuredClone(f.assignments[0]),coder_id:'3'});
 assert.equal(codingReliabilityPairs(f).length,3);assert.equal(codingReliability(f,['1','3']).themes[0].kappa,1);
 const report=codingReliabilityReport(f);assert.match(report,/Coder 1 and Coder 3/);assert.match(report,/\|\n\| ---/);assert.equal(report.includes('Private note'),false);
});
