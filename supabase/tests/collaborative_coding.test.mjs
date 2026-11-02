import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {PGlite} from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite(),owner=randomUUID(),coder=randomUUID(),reviewer=randomUUID(),other=randomUUID();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`);
for(const name of ['202610090001_studies.sql','202610240001_canvas_lti.sql','202610280001_teams_versions_consent.sql','202610280002_study_operations_activities.sql','202611020001_analysis_jobs.sql','202611020002_recruitment_screeners.sql','202611020003_research_quality.sql','202611020004_collaborative_coding.sql'])await db.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
for(const [id,email] of [[owner,'owner@ufl.edu'],[coder,'coder@ufl.edu'],[reviewer,'review@ufl.edu'],[other,'other@ufl.edu']])await db.query('insert into auth.users values($1,$2,now())',[id,email]);
async function as(user,fn,role='authenticated'){await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user || '']);return await fn();}finally{await db.exec('reset role');}}
async function rpc(name,args=[]){return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;}
let study,version,question,ids=[],round,snapshot,member;
const create=(assignments=[{coder_id:owner,response_ids:ids},{coder_id:coder,response_ids:ids.slice(0,2)}],revision=1)=>rpc('create_coding_round',[study,version,question,'Independent test',assignments,revision]);
const get=()=>rpc('get_coding_round',[round]);
const ballot=themes=>Object.fromEntries(ids.map((id,i)=>[id,{themes:themes[i] || [],note:'Discussion note'}]));
test('seed a frozen round from actual submissions and validate assignment boundaries',async()=>{
 study=await as(owner,()=>rpc('save_study_draft',[null,{title:'Collaboration',research_question:'Why?',participant_mode:'anonymous',consent_text:'Test consent',questions:['What helped?']},0]));await as(owner,()=>db.query("update public.studies set status='open' where id=$1",[study]));
 const s=(await db.query('select * from public.studies where id=$1',[study])).rows[0],v=(await db.query('select * from public.study_versions where study_id=$1',[study])).rows[0];version=v.id;question=v.questions[0].id;
 for(let i=0;i<3;i++)ids.push(await as(null,()=>rpc('submit_study_version',[s.share_code,{[question]:`Private response ${i}`},version,true,randomUUID()]),'anon'));
 for(const [email,id,role] of [['coder@ufl.edu',coder,'researcher'],['review@ufl.edu',reviewer,'reviewer']]){const invite=await as(owner,()=>rpc('invite_study_member',[study,email,role]));await as(id,()=>rpc('accept_study_invitation',[invite]));if(id===coder)member=invite;}
 snapshot={study_id:study,study_version_id:version,question_id:question,labels:[{name:'A',description:'A definition'},{name:'B',description:'B definition'}],coded_responses:ids.map((id,i)=>({original:`Private response ${i}`,themes:[{name:'A'}]})),classifications:{A:[0,1,2]},stage:'results',response_count:3,results:{_run_id:'original',summary:'Original saved result.',themes:[{name:'A',frequency:3}]}};
 await as(owner,()=>rpc('save_study_analysis',[snapshot,0]));
 await as(coder,()=>assert.rejects(create(),/Only the study owner/));await as(owner,()=>assert.rejects(create(undefined,0),/latest saved codebook/));
 for(const assignments of [[{coder_id:reviewer,response_ids:ids}],[{coder_id:coder,response_ids:[randomUUID()]}],[{coder_id:coder,response_ids:[ids[0],ids[0]]}],[{coder_id:coder,response_ids:ids},{coder_id:coder,response_ids:ids}]])await as(owner,()=>assert.rejects(create(assignments),/Assign|Choose/));
 round=await as(owner,()=>create());const context=await as(owner,get);assert.equal(context.round.responses.length,3);assert.equal(JSON.stringify(context.round.responses).includes('participant_data'),false);assert.equal(context.round.codebook[0].name,'A');
});
test('anonymous and nonmembers cannot inspect rounds; direct tables and helpers stay private',async()=>{
 await as(other,()=>assert.rejects(get(),/access denied/));await as(null,()=>assert.rejects(get(),/permission denied/),'anon');
 for(const table of ['study_coding_rounds','study_coding_assignments','study_coding_decisions','study_coding_events'])await as(owner,()=>assert.rejects(db.query(`select * from public.${table}`),/permission denied/));
 await as(owner,()=>assert.rejects(rpc('coding_theme_set',[['A'],snapshot.labels]),/permission denied/));
});
test('ballots are private even to the owner until every coder submits and comparison opens',async()=>{
 await as(owner,()=>rpc('save_coding_ballot',[round,ballot([['A','B'],[],['A']]),0,false]));
 for(const user of [coder,reviewer]){const c=await as(user,get);assert.equal(c.assignments.find(a=>a.coder_id===owner).ballot,null);assert.equal(JSON.stringify(c.events).includes('Discussion note'),false);}
 const c=await as(coder,get);assert.equal(c.round.responses.length,2);assert.equal(c.assignments.find(a=>a.coder_id===coder).ballot instanceof Object,true);
 await as(owner,()=>assert.rejects(rpc('set_coding_round_state',[round,'comparison',1]),/Every assigned/));
});
test('draft saves reject stale editors, unassigned responses, unknown themes and incomplete submissions',async()=>{
 await as(owner,()=>assert.rejects(rpc('save_coding_ballot',[round,{},0,false]),/another tab/));
 await as(coder,()=>assert.rejects(rpc('save_coding_ballot',[round,ballot([['A'],[],[]]),0,false]),/assigned responses/));
 await as(coder,()=>assert.rejects(rpc('save_coding_ballot',[round,{[ids[0]]:{themes:['Fake'],note:''}},0,false]),/codebook/));
 await as(coder,()=>assert.rejects(rpc('save_coding_ballot',[round,{},0,true]),/every assigned response/));
 await as(owner,()=>rpc('save_coding_ballot',[round,ballot([['B','A'],[],['A']]),1,true]));
 await as(owner,()=>assert.rejects(rpc('save_coding_ballot',[round,{},2,false]),/not open/));
 await as(coder,()=>rpc('save_coding_ballot',[round,{[ids[0]]:{themes:['A','B'],note:''},[ids[1]]:{themes:['A'],note:''}},0,true]));
 assert.equal((await as(owner,get)).assignments.find(a=>a.coder_id===coder).ballot,null);
 await as(coder,()=>assert.rejects(rpc('set_coding_round_state',[round,'comparison',1]),/Only the study owner/));
 const context=await as(owner,()=>rpc('set_coding_round_state',[round,'comparison',1]));assert.ok(context.assignments.every(a=>a.ballot));assert.equal(context.round.state,'comparison');
});
test('adjudication requires rationale, optimistic revisions and explicit resolution before finalizing',async()=>{
 await as(owner,()=>assert.rejects(rpc('set_coding_round_state',[round,'finalized',2]),/every disagreement/));
 await as(coder,()=>assert.rejects(rpc('save_coding_decision',[round,ids[1],['B'],'Why',0]),/Only the study owner/));
 await as(owner,()=>assert.rejects(rpc('save_coding_decision',[round,ids[1],['B'],' ',0]),/rationale/));
 const c=await as(owner,()=>rpc('save_coding_decision',[round,ids[1],['B'],'Resolved after discussion of the codebook.',0]));assert.equal(c.decisions[0].decided_by,owner);
 await as(owner,()=>assert.rejects(rpc('save_coding_decision',[round,ids[1],[],'Overwrite',0]),/Another decision/));
 await as(owner,()=>assert.rejects(rpc('set_coding_round_state',[round,'finalized',2]),/round changed/));
 await as(owner,()=>rpc('set_coding_round_state',[round,'finalized',c.round.revision]));
 await as(owner,()=>assert.rejects(rpc('save_coding_decision',[round,ids[1],[],'Change',1]),/Open comparison/));
});
test('applying consensus preserves old findings, uses adjudicated choices, and cannot overwrite unfinished work',async()=>{
 await as(owner,()=>assert.rejects(rpc('apply_coding_consensus',[round,0]),/analysis changed/));
 await db.query("update public.study_analyses set stage='code' where study_id=$1",[study]);await as(owner,()=>assert.rejects(rpc('apply_coding_consensus',[round,1]),/Finish the current analysis/));assert.equal((await db.query('select coded_responses from public.study_analyses where study_id=$1',[study])).rows[0].coded_responses[0].original,'Private response 0');await db.query("update public.study_analyses set stage='results' where study_id=$1",[study]);
 const key=await as(owner,()=>rpc('apply_coding_consensus',[round,1]));assert.equal(key,`consensus:${round}`);
 const a=(await db.query('select * from public.study_analyses where study_id=$1',[study])).rows[0];assert.equal(a.stage,'review');assert.equal(a.results._completed[0].results.summary,'Original saved result.');assert.equal(a.coded_responses[1].themes[0].name,'B');assert.deepEqual(a.classifications,{A:[0,2],B:[0,1],Unclassified:[]});assert.equal(a.coded_responses[0].coding_round_id,round);
 const oldReview=await as(owner,()=>rpc('get_study_run_review',[study,version,question,'original']));assert.equal(oldReview.collaboration,null);
 await as(owner,()=>assert.rejects(rpc('apply_coding_consensus',[round,2]),/only once/));
 const second=await as(owner,()=>create(undefined,2));await as(owner,()=>assert.rejects(rpc('apply_coding_consensus',[second,2]),/Finalize/));
});
test('note-only drafts remain incomplete and published consensus carries actual reconciliation provenance',async()=>{
 const id=await as(owner,()=>create(undefined,2));const draft=await as(owner,()=>rpc('save_coding_ballot',[id,{[ids[0]]:{themes:null,note:'Keep this unfinished note.'}},0,false]));assert.equal(draft.assignments.find(a=>a.coder_id===owner).ballot[ids[0]].themes,null);
 await as(owner,()=>assert.rejects(rpc('save_coding_ballot',[id,{[ids[0]]:{themes:null,note:'Keep'}},1,true]),/codebook|every assigned/));
 const a=(await db.query('select * from public.study_analyses where study_id=$1',[study])).rows[0];await as(owner,()=>rpc('save_study_analysis',[{...a,stage:'results',results:{...a.results,_draft:false,summary:'Consensus-based summary.',themes:[]}},2]));
 const reviewed=await as(owner,()=>rpc('get_study_run_review',[study,version,question,`consensus:${round}`]));assert.equal(reviewed.collaboration.round.state,'finalized');assert.equal(reviewed.collaboration.assignments.length,2);assert.equal(reviewed.collaboration.decisions.length,1);
});
test('removed and downgraded coders lose editing access immediately, and abandoned rounds can be cancelled',async()=>{
 const id=await as(owner,()=>create(undefined,3));await as(owner,()=>rpc('invite_study_member',[study,'coder@ufl.edu','reviewer']));await as(coder,()=>assert.rejects(rpc('save_coding_ballot',[id,{},0,false]),/Active researcher/));await as(owner,()=>rpc('remove_study_member',[member]));await as(coder,()=>assert.rejects(rpc('get_coding_round',[id]),/access denied/));await as(coder,()=>assert.rejects(rpc('save_coding_ballot',[id,{},0,false]),/Active researcher/));
 const c=await as(owner,()=>rpc('set_coding_round_state',[id,'cancelled',1]));assert.equal(c.round.state,'cancelled');await as(owner,()=>assert.rejects(rpc('save_coding_ballot',[id,{},0,false]),/not open/));
});
test('the existing owner deletion path cascades through all disposable coding records',async()=>{
 await as(owner,()=>db.query('delete from public.studies where id=$1',[study]));
 for(const table of ['study_coding_rounds','study_coding_assignments','study_coding_decisions','study_coding_events'])assert.equal((await db.query(`select count(*)::integer as n from public.${table}`)).rows[0].n,0);
});
test.after(()=>db.close());
