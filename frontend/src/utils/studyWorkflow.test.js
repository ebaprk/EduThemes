import assert from 'node:assert/strict';
import test from 'node:test';
import { draftPreview,studyReadiness,studySnapshot,studyWork,findingsEntries,nextStudyAction,visiblePreviewQuestions,studyReport,resolveStudyView } from './studyWorkflow.js';
const draft={title:'Advising',research_question:'What helps?',consent_text:'Study consent',participant_mode:'anonymous',activities:[{title:'Baseline',required:true,questions:['What helped?']}],recruitment:{enabled:false}};
const ready=()=>studyReadiness(draftPreview(draft));
test('readiness distinguishes publication requirements from recommended context',()=>{
 const checks=ready();assert.ok(checks.filter(c=>c.required).every(c=>c.done));assert.equal(checks.find(c=>c.id==='contact').done,false);
 const incomplete=studyReadiness(draftPreview({...draft,consent_text:'',activities:[{title:'Baseline',questions:[' ']}]}));
 assert.deepEqual(incomplete.filter(c=>c.required&&!c.done).map(c=>c.id),['activities','consent']);
});
test('published previews use frozen consent, activity, and screening content instead of a newer draft',()=>{
 const study={...draft,title:'Unpublished title',consent_text:'Unpublished consent',recruitment_draft:{enabled:true}};
 const version={title:'Published title',consent_text:'Original consent',recruitment:{enabled:false},questions:[{id:'q',prompt:'Original question'}]};
 const snapshot=studySnapshot(study,version,[], 'v1');assert.equal(snapshot.consent_text,'Original consent');assert.equal(snapshot.title,'Published title');assert.equal(snapshot.recruitment.enabled,false);
 assert.equal(studySnapshot(study,null,[],'missing'),null);
});
test('a screened Canvas draft is not marked ready and malformed screeners remain incomplete',()=>{
 const config={enabled:true,notice:'Notice',eligibility:'Criteria',location:'Online',estimated_minutes:5,questions:[]};
 const checks=studyReadiness(draftPreview({...draft,participant_mode:'canvas',recruitment:config}));
 assert.equal(checks.find(c=>c.id==='identity').done,false);assert.equal(checks.find(c=>c.id==='screening').done,false);
});
test('draft previews preserve activity boundaries and create local-only question references',()=>{
 const snapshot=draftPreview({...draft,activities:[...draft.activities,{title:'Follow-up',questions:['What changed?']}]});
 assert.equal(snapshot.activities.length,2);assert.equal(snapshot.questions[1].prompt,'What changed?');assert.notEqual(snapshot.questions[0].id,snapshot.questions[1].id);
});
test('a hidden branch cannot be reopened by a stale answer to its hidden parent',()=>{
 const qs=[{id:'a',options:[{id:'yes'},{id:'no'}]},{id:'b',options:[{id:'yes'}],show_if:{question_id:'a',option_id:'yes'}},{id:'c',show_if:{question_id:'b',option_id:'yes'}}];
 assert.deepEqual(visiblePreviewQuestions(qs,{a:'no',b:'yes'}).map(q=>q.id),['a']);
});
test('current coding work keeps completed historical findings available and counts newly collected answers',()=>{
 const completed={stage:'results',results:{_run_id:'old',summary:'Saved finding.',themes:[]},response_count:1};
 const analysis={stage:'code',response_count:1,results:{_draft:true,_completed:[completed]}};
 const work=studyWork([{id:'q',prompt:'What helped?'}],[{answers:{q:'First'}},{answers:{q:'Second'}}],[{...analysis,question_id:'q'}]);
 assert.equal(work[0].newCount,1);assert.equal(work[0].needsWork,true);assert.equal(findingsEntries(work)[0].key,'old');
});
test('next actions respect role, actual draft readiness, collection closure, and unfinished coding',()=>{
 const study={status:'draft'};
 assert.equal(nextStudyAction({study,view:'draft',role:'owner',readiness:ready(),work:[]}).kind,'publish');
 assert.notEqual(nextStudyAction({study,view:'draft',role:'researcher',readiness:ready(),work:[]}).kind,'publish');
 assert.equal(nextStudyAction({study,view:'old-version',role:'owner',readiness:ready(),work:[]}).kind,undefined);
 assert.equal(nextStudyAction({study,view:'draft',role:'reviewer',readiness:ready(),work:[]}).label,'View study design');
 assert.equal(nextStudyAction({study:{status:'closed'},view:'v1',role:'owner',readiness:[],work:[]}).label,'Review study closeout');
 assert.equal(nextStudyAction({study:{status:'open'},view:'v1',role:'owner',readiness:[],work:[{runs:[],needsWork:true}]}).section,'analysis');
});
test('report exports contain saved findings and counts without participant or screening records',()=>{
 const work=studyWork([{id:'q',prompt:'What helped?'}],[],[{question_id:'q',stage:'results',response_count:1,results:{_run_id:'r',summary:'A complete finding.',themes:[{name:'Planning',frequency:1}]},coded_responses:[{original:'Private answer',participant_data:{email:'private@example.invalid'}}]}]);
 const text=studyReport({...draftPreview(draft),screening_answers:{q:'Private screening'},coordinator_notes:'Private note'},work);
 assert.ok(text.includes('A complete finding.'));assert.ok(text.includes('Planning: 1'));for(const hidden of ['Private answer','private@example.invalid','Private screening','Private note'])assert.equal(text.includes(hidden),false);
});

test('publication invalidates a draft URL while deliberate historical views survive refresh',()=>{
 const versions=[{id:'v2'},{id:'v1'}],open={status:'open',current_version_id:'v2'};
 assert.equal(resolveStudyView(open,versions,'draft','draft'),'v2');
 assert.equal(resolveStudyView(open,versions,'v1','v2'),'v1');
 assert.equal(resolveStudyView(open,versions,null,'v1'),'v1');
 assert.equal(resolveStudyView({...open,status:'draft'},versions,'draft','v1'),'draft');
 assert.equal(resolveStudyView(open,versions,'invalid','v1'),'v2');
});
