import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanCodebook,codebookFile,researchBrief,reviewReady,emptyReview} from './researchQuality.js';
import {studyTemplates,templateFile,templateForm} from './studyTemplates.js';
test('codebook reuse preserves rules and rejects ambiguous or reserved names',()=>{
 const book=[{name:'Planning',description:'Clear next steps',include_when:'A plan is explicit',exclude_when:'Only general praise',example:'A fictional checklist',color:'#176b52',responses:['Do not copy']}];
 const exported=JSON.parse(codebookFile(book));assert.deepEqual(cleanCodebook(exported),cleanCodebook(book));assert.equal(JSON.stringify(exported).includes('Do not copy'),false);
 for(const bad of [[...book,...book],[{name:'Unclassified'}],[{name:'x',description:'a'.repeat(201)}]])assert.throws(()=>cleanCodebook(bad));
});
test('templates copy only design, require fresh consent, and retain activity timing',()=>{
 const template=templateForm(studyTemplates.find(t=>t.id==='followup').form);assert.equal(template.activities[1].opens_after_days,7);assert.equal(template.consent_text,'');
 const text=templateFile({...template,consent_text:'Prior consent',screening_answers:'Private',submissions:['Secret'],owner_id:'Private owner'});assert.equal(text.includes('Prior consent'),false);assert.equal(text.includes('Private'),false);assert.equal(text.includes('Secret'),false);assert.equal(JSON.parse(text).study.activities.length,2);
 assert.throws(()=>templateForm({activities:[{questions:[]}]}));
});
test('review readiness requires report details and every flag resolved',()=>{
 const review={...emptyReview(),methods:'Reflection',limitations:'Small sample',ai_disclosure:'No AI',flags:{0:{note:'Check',resolved:false}}};assert.equal(reviewReady(review),false);review.flags[0].resolved=true;assert.equal(reviewReady(review),true);assert.equal(reviewReady({...review,limitations:''}),false);
});
test('brief includes only selected quotes, frozen consent, codebook and honest review status',()=>{
 const snapshot={title:'Published study',version_number:1,consent_text:'Original consent',research_question:'What helps?'};
 const run={response_count:2,labels:[{name:'Planning',include_when:'Explicit plan'}],coded_responses:[{original:'Selected quote',participant_data:{email:'private@example.invalid'}},{original:'Do not include'}],results:{_run_id:'r1',summary:'A finding.',themes:[{name:'Planning',frequency:1}]}};
 const state={current:true,review:{...emptyReview(),methods:'Reflection',limitations:'Small sample',ai_disclosure:'Manually checked',quotes:[0],status:'approved',signed_by:'Researcher',signed_at:'2026-11-02',flags:{1:{note:'Private flag',resolved:true}}}};
 const brief=researchBrief(snapshot,{prompt:'Why?'},run,state);for(const value of ['Original consent','Selected quote','Explicit plan','Reviewed by Researcher'])assert.ok(brief.includes(value));for(const value of ['private@example.invalid','Do not include','Private flag'])assert.equal(brief.includes(value),false);
 assert.ok(researchBrief(snapshot,{prompt:'Why?'},run,{...state,current:false}).includes('DRAFT'));
});
