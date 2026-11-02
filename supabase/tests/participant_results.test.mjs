import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite(), owner = randomUUID(), researcher = randomUUID(), reviewer = randomUUID(), stranger = randomUUID();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`);
for (const name of ['202610090001_studies.sql','202610240001_canvas_lti.sql','202610280001_teams_versions_consent.sql','202610280002_study_operations_activities.sql','202611020001_analysis_jobs.sql','202611020002_recruitment_screeners.sql','202611020003_research_quality.sql','202611020004_collaborative_coding.sql','202611020005_participant_results.sql']) await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
for (const [id,email] of [[owner,'owner@ufl.edu'],[researcher,'coder@ufl.edu'],[reviewer,'review@ufl.edu'],[stranger,'other@ufl.edu']]) await db.query('insert into auth.users values($1,$2,now())',[id,email]);
async function as(user,fn,role='authenticated') { await db.exec(`set role ${role}`);try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user || '']);return await fn(); } finally { await db.exec('reset role'); } }
async function rpc(name,args=[]) { return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value; }
const anon=fn=>as(null,fn,'anon');
const content={title:'What the demonstration found',overview:'A fictional advising study.',findings:'A checklist supported planning.',limitations:'One fabricated response, no real participants.',next_steps:'No recommendations from this demonstration.',contact:'Demo coordinator',secret:'DO NOT COPY',raw_answers:'DO NOT COPY'};
const review={methods:'Manual review in a synthetic test.',limitations:'One fabricated response.',ai_disclosure:'No AI used.',status:'approved',attested:true};
let study,version,question,code,submission,requestId=randomUUID(),workspace,source,analysis;
const get=()=>rpc('get_study_results_workspace',[study,version]);
const save=(value=content,sources=[source],rev=workspace?.draft?.revision || 0)=>rpc('save_study_results_draft',[study,version,value,sources,rev]);
const release=(rev=workspace.draft.revision,attested=true)=>rpc('release_study_results',[study,version,rev,attested]);
const participant=()=>rpc('get_participant_results',[null,submission,requestId]);
async function approve() {
 const context=await rpc('get_study_run_review',[study,version,question,'run-1']);
 const next=await rpc('save_study_run_review',[study,version,question,'run-1',context.snapshot_hash,context.review?.revision || 0,review]);
 source={question_id:question,run_key:'run-1',snapshot_hash:next.snapshot_hash,review_revision:next.review.revision};
}
test('versioned draft and release tables begin private and preserve a saved source',async()=>{
 study=await as(owner,()=>rpc('save_study_draft',[null,{title:'Synthetic study',research_question:'What helped?',participant_mode:'anonymous',consent_text:'Synthetic consent',contact_info:'Demo contact',activities:[{title:'Baseline',kind:'survey',required:true,opens_after_days:0,questions:['What helped?']},{title:'Follow-up',kind:'survey',required:true,opens_after_days:0,questions:['What changed?']}]},0]));
 await as(owner,()=>db.query("update public.studies set status='open' where id=$1",[study]));
 const s=(await db.query('select * from public.studies where id=$1',[study])).rows[0];version=s.current_version_id;code=s.share_code;
 question=(await db.query('select questions from public.study_versions where id=$1',[version])).rows[0].questions[0].id;
 await anon(()=>rpc('enroll_study',[code,version,'b'.repeat(64),true,true]));
 const activity=(await db.query('select activities from public.study_versions where id=$1',[version])).rows[0].activities[0].id;
 submission=await anon(()=>rpc('submit_study_activity',['b'.repeat(64),activity,{[question]:'PRIVATE ORIGINAL'},true,requestId]));
 analysis={study_id:study,study_version_id:version,question_id:question,labels:[{name:'Planning'}],coded_responses:[{original:'PRIVATE ORIGINAL',themes:[{name:'Planning'}]}],classifications:{Planning:[0]},stage:'results',response_count:1,results:{_run_id:'run-1',summary:'Synthetic finding.',themes:[]}};
 await as(owner,()=>rpc('save_study_analysis',[analysis,0]));await as(owner,approve);
 assert.equal((await anon(participant)).release,null);
 workspace=await as(owner,()=>save());assert.equal(workspace.draft.revision,1);assert.equal(workspace.draft.content.secret,undefined);assert.equal(workspace.draft.content.raw_answers,undefined);
 assert.equal((await anon(participant)).release,null);
 for(const table of ['study_results_drafts','study_results_releases'])for(const [user,role] of [[owner,'authenticated'],[null,'anon']])await as(user,()=>assert.rejects(db.query(`select * from public.${table}`),/permission denied/),role);
});
test('team roles and anonymous callers cannot bypass ownership or study membership',async()=>{
 for(const [email,id,role] of [['coder@ufl.edu',researcher,'researcher'],['review@ufl.edu',reviewer,'reviewer']]) {const invite=await as(owner,()=>rpc('invite_study_member',[study,email,role]));await as(id,()=>rpc('accept_study_invitation',[invite]));}
 assert.equal((await as(reviewer,get)).draft.revision,1);
 await as(reviewer,()=>assert.rejects(save(),/Editing access/));await as(stranger,()=>assert.rejects(get(),/access denied/));await anon(()=>assert.rejects(get(),/permission denied/));
 for(const user of [researcher,reviewer,stranger])await as(user,()=>assert.rejects(release(),/Only the study owner/));
 await anon(()=>assert.rejects(release(),/permission denied/));
 workspace=await as(researcher,()=>save());assert.equal(workspace.draft.updated_by,researcher);
});
test('draft validation, source identity and optimistic revisions reject malformed and stale requests',async()=>{
 await as(owner,()=>assert.rejects(save(content,[source],0),/Another researcher/));
 for(const value of [{title:[]},{title:'x'.repeat(201)},null])await as(owner,()=>assert.rejects(save(value),/Invalid|text|200/));
 await as(owner,()=>assert.rejects(save(content,[source,source]),/only once/));
 await as(owner,()=>assert.rejects(save(content,[{...source,snapshot_hash:'forged'}]),/source findings or review changed/));
 await as(owner,()=>assert.rejects(save(content,[{...source,question_id:randomUUID()}]),/Save this analysis/));
 await as(owner,()=>assert.rejects(release(workspace.draft.revision,false),/Confirm/));
 workspace=await as(owner,()=>save({...content,limitations:''}));await as(owner,()=>assert.rejects(release(),/Complete/));
 workspace=await as(owner,()=>save(content,[]));await as(owner,()=>assert.rejects(release(),/at least one/));
 workspace=await as(owner,()=>save());
});
test('release requires matching current sign-off and records actual actor and time',async()=>{
 const context=await as(owner,()=>rpc('get_study_run_review',[study,version,question,'run-1']));
 await as(researcher,()=>rpc('save_study_run_review',[study,version,question,'run-1',context.snapshot_hash,context.review.revision,{...review,status:'draft'}]));
 await as(owner,()=>assert.rejects(release(),/current sign-off/));
 await as(owner,approve);await as(owner,()=>assert.rejects(release(),/current sign-off/));
 workspace=await as(owner,()=>save());const revision=workspace.draft.revision;
 workspace=await as(owner,()=>release());assert.equal(workspace.releases[0].released_by,owner);assert.ok(workspace.releases[0].released_at);assert.equal(workspace.releases[0].release_number,1);
 await as(owner,()=>assert.rejects(release(revision),/summary changed/));await as(owner,()=>assert.rejects(release(),/already released/));
 const visible=await anon(participant);assert.equal(visible.release.content.title,content.title);
 const text=JSON.stringify(visible);for(const privateValue of ['PRIVATE ORIGINAL','snapshot_hash','released_by','raw_answers',owner,submission,'DO NOT COPY'])assert.equal(text.includes(privateValue),false);
});
test('credentials are required and enrollment access stays bound to its own published version',async()=>{
 for(const args of [[null,submission,randomUUID()],[null,randomUUID(),requestId],['a'.repeat(64),null,null],[null,null,null],['a'.repeat(64),submission,requestId]])await anon(()=>assert.rejects(rpc('get_participant_results',args),/private results link is invalid/));
 const key='b'.repeat(64);
 assert.equal((await anon(()=>rpc('get_participant_results',[key]))).release.release_number,1);
 await as(owner,()=>db.query("update public.studies set status='closed' where id=$1",[study]));
 assert.equal((await anon(participant)).release.release_number,1);
 await as(owner,()=>db.query("update public.studies set status='draft' where id=$1",[study]));
 const revision=(await db.query('select draft_revision from public.studies where id=$1',[study])).rows[0].draft_revision;
 await as(owner,()=>rpc('save_study_draft',[study,{title:'Next version',research_question:'New question?',participant_mode:'anonymous',consent_text:'Next consent',contact_info:'New contact',activities:[{title:'New baseline',kind:'survey',required:true,opens_after_days:0,questions:['What changed?']},{title:'New follow-up',kind:'survey',required:true,opens_after_days:0,questions:['What else?']}]},revision]));
 await as(owner,()=>db.query("update public.studies set status='open' where id=$1",[study]));
 const next=(await db.query('select current_version_id from public.studies where id=$1',[study])).rows[0].current_version_id;
 const nextKey='c'.repeat(64);await anon(()=>rpc('enroll_study',[code,next,nextKey,true,true]));
 assert.equal((await anon(()=>rpc('get_participant_results',[nextKey]))).release,null);
 const old=await anon(()=>rpc('get_participant_results',[key]));assert.equal(old.study_title,'Synthetic study');assert.equal(old.release.release_number,1);
});
test('editing and source changes cannot alter an existing release; withdrawal never restores an older release',async()=>{
 const first=workspace.releases[0];workspace=await as(researcher,()=>save({...content,findings:'Updated plain-language findings.'}));
 assert.equal((await anon(participant)).release.content.findings,content.findings);
 workspace=await as(owner,()=>release());assert.equal(workspace.releases[0].release_number,2);assert.deepEqual(workspace.releases[1],first);
 await as(researcher,()=>assert.rejects(rpc('withdraw_study_results',[study,version,workspace.draft.revision]),/Only the study owner/));
 await as(owner,()=>assert.rejects(rpc('withdraw_study_results',[study,version,0]),/summary changed/));
 workspace=await as(owner,()=>rpc('withdraw_study_results',[study,version,workspace.draft.revision]));assert.equal((await anon(participant)).release,null);assert.equal(workspace.releases.length,2);assert.equal(workspace.releases[0].withdrawn_by,owner);
 const changed={...analysis,coded_responses:[{original:'PRIVATE ORIGINAL',themes:[]}]};await as(owner,()=>rpc('save_study_analysis',[changed,1]));
 await as(owner,()=>assert.rejects(release(),/current sign-off/));
 assert.equal(workspace.releases[1].content.findings,content.findings);
});
test('single-activity participants can use their existing receipt proof without an enrollment',async()=>{
 const id=await as(owner,()=>rpc('save_study_draft',[null,{title:'Single activity',research_question:'Why?',participant_mode:'anonymous',consent_text:'Single consent',questions:['Why?']},0]));
 await as(owner,()=>db.query("update public.studies set status='open' where id=$1",[id]));
 const s=(await db.query('select * from public.studies where id=$1',[id])).rows[0],v=(await db.query('select * from public.study_versions where id=$1',[s.current_version_id])).rows[0],request=randomUUID();
 const submissionId=await anon(()=>rpc('submit_study_version',[s.share_code,{[v.questions[0].id]:'SINGLE PRIVATE'},v.id,true,request]));
 const result=await anon(()=>rpc('get_participant_results',[null,submissionId,request]));assert.equal(result.study_title,'Single activity');assert.equal(result.release,null);assert.equal(JSON.stringify(result).includes('SINGLE PRIVATE'),false);
 await anon(()=>assert.rejects(rpc('get_participant_results',[null,submissionId,requestId]),/invalid/));
 await as(owner,()=>db.query('delete from public.studies where id=$1',[id]));
});
test('removed team members lose draft and release history access immediately',async()=>{
 const membership=(await db.query('select id from public.study_members where study_id=$1 and user_id=$2',[study,researcher])).rows[0];
 await as(owner,()=>rpc('remove_study_member',[membership.id]));await as(researcher,()=>assert.rejects(get(),/access denied/));await as(researcher,()=>assert.rejects(save(),/Editing access/));
});
test('owner deletion cascades through the disposable results records',async()=>{
 await as(owner,()=>db.query('delete from public.studies where id=$1',[study]));
 for(const table of ['study_results_drafts','study_results_releases'])assert.equal((await db.query(`select count(*)::integer as n from public.${table}`)).rows[0].n,0);
});
test.after(()=>db.close());
