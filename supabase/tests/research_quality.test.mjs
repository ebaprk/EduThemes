import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {PGlite} from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite(),owner=randomUUID(),researcher=randomUUID(),reviewer=randomUUID(),stranger=randomUUID();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to authenticated;`);
for(const name of ['202610090001_studies.sql','202610240001_canvas_lti.sql','202610280001_teams_versions_consent.sql','202610280002_study_operations_activities.sql','202611020001_analysis_jobs.sql','202611020002_recruitment_screeners.sql','202611020003_research_quality.sql'])await db.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
for(const [id,email] of [[owner,'owner@ufl.edu'],[researcher,'coder@ufl.edu'],[reviewer,'review@ufl.edu'],[stranger,'other@ufl.edu']])await db.query('insert into auth.users values($1,$2,now())',[id,email]);
async function as(user,fn,role='authenticated'){await db.exec(`set role ${role}`);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user || '']);return await fn();}finally{await db.exec('reset role');}}
async function rpc(name,args=[]){return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;}
let study,version,question,snapshot,context;
const review={methods:'Written reflection, manually reviewed coding.',limitations:'One synthetic response.',ai_disclosure:'No model used in this disposable test.',flags:{},quotes:[0],status:'draft'};
const get=()=>rpc('get_study_run_review',[study,version,question,'run-1']);
const save=(value,hash=context.snapshot_hash,revision=context.review?.revision || 0)=>rpc('save_study_run_review',[study,version,question,'run-1',hash,revision,value]);
test('quality migration and initial analysis preserve provenance without raw answer audit copies',async()=>{
 study=await as(owner,()=>rpc('save_study_draft',[null,{title:'Test',research_question:'Why?',participant_mode:'anonymous',consent_text:'Test consent',questions:['What helped?']},0]));
 await as(owner,()=>db.query("update public.studies set status='open' where id=$1",[study]));
 const v=(await db.query('select * from public.study_versions where study_id=$1',[study])).rows[0];version=v.id;question=v.questions[0].id;
 snapshot={study_id:study,study_version_id:version,question_id:question,labels:[{name:'Planning',description:'Clear next steps',include_when:'An explicit plan'}],coded_responses:[{original:'PRIVATE ANSWER',themes:[{name:'Planning'}]}],classifications:{Planning:[0]},stage:'results',response_count:1,results:{_run_id:'run-1',summary:'A synthetic finding.',themes:[{name:'Planning',frequency:1}]}};
 await as(owner,()=>rpc('save_study_analysis',[snapshot,0]));context=await as(owner,get);assert.equal(context.review,null);assert.equal(context.can_edit,true);assert.ok(context.snapshot_hash);assert.equal(context.events.length,1);assert.equal(JSON.stringify(context.events).includes('PRIVATE ANSWER'),false);
});
test('reviewers can read but cannot sign; strangers and anonymous users cannot inspect reviews',async()=>{
 for(const [email,id,role] of [['coder@ufl.edu',researcher,'researcher'],['review@ufl.edu',reviewer,'reviewer']]){const invite=await as(owner,()=>rpc('invite_study_member',[study,email,role]));await as(id,()=>rpc('accept_study_invitation',[invite]));}
 assert.equal((await as(reviewer,get)).can_edit,false);await as(reviewer,()=>assert.rejects(save(review),/Editing access/));await as(stranger,()=>assert.rejects(get(),/access denied/));await as(null,()=>assert.rejects(get(),/permission denied/),'anon');
 for(const table of ['study_run_reviews','study_quality_events'])await as(owner,()=>assert.rejects(db.query(`select * from public.${table}`),/permission denied/));
 await as(owner,()=>assert.rejects(rpc('quality_saved_run',[study,version,question,'run-1']),/permission denied/));
});
test('draft review saves use optimistic revisions and server identity',async()=>{
 context=await as(researcher,()=>save({...review,signed_by:stranger,signed_at:'2000-01-01'}));assert.equal(context.review.updated_by,researcher);assert.equal(context.review.signed_by,null);
 await as(owner,()=>assert.rejects(save(review,context.snapshot_hash,0),/Another researcher/));
});
test('codebook lookup is scoped and returns definitions without response records',async()=>{
 const books=await as(reviewer,()=>rpc('list_study_codebooks'));assert.equal(books.length,1);assert.equal(books[0].labels[0].include_when,'An explicit plan');assert.equal(books[0].prompt,'What helped?');assert.equal(JSON.stringify(books).includes('PRIVATE ANSWER'),false);
 assert.deepEqual(await as(stranger,()=>rpc('list_study_codebooks')),[]);await as(null,()=>assert.rejects(rpc('list_study_codebooks'),/permission denied/),'anon');
});
test('sign-off rejects unresolved flags, missing report sections, false attestation and malformed quotes',async()=>{
 for(const value of [{...review,status:'approved',attested:true,flags:{0:{note:'Uncertain',resolved:false}}},{...review,status:'approved',attested:true,methods:''},{...review,status:'approved',attested:false},{...review,quotes:[99]},{...review,flags:{evil:{note:'x',resolved:false}}}])await as(owner,()=>assert.rejects(save(value),/Resolve|Document|Choose quotes|Invalid response/));
});
test('sign-off records actual actor/time and cannot be forged; editing notes revokes approval',async()=>{
 context=await as(owner,()=>save({...review,status:'approved',attested:true,signed_by:stranger,signed_at:'2000-01-01'}));assert.equal(context.review.status,'approved');assert.equal(context.review.signed_by,owner);assert.ok(new Date(context.review.signed_at).getTime()>new Date('2026-01-01').getTime());assert.equal(context.current,true);
 context=await as(researcher,()=>save({...review,limitations:'Updated limitation.'}));assert.equal(context.review.status,'draft');assert.equal(context.review.signed_at,null);assert.equal(context.events.filter(e=>e.kind==='review_approved').length,1);
});
test('changed snapshot invalidates approval and stale saves, while retained runs keep original review',async()=>{
 context=await as(owner,()=>save({...review,status:'approved',attested:true}));const oldHash=context.snapshot_hash;
 const changed={...snapshot,coded_responses:[{original:'PRIVATE ANSWER',themes:[]}]};await as(owner,()=>rpc('save_study_analysis',[changed,1]));context=await as(owner,get);assert.equal(context.current,false);await as(owner,()=>assert.rejects(save(review,oldHash),/analysis changed/));
 context=await as(owner,()=>save({...review,status:'approved',attested:true}));
 await as(owner,()=>rpc('save_study_analysis',[{...changed,stage:'code',results:{_run_id:'run-2',_draft:true,_completed:[changed]}},2]));const retained=await as(owner,get);assert.equal(retained.current,true);assert.equal(retained.review.status,'approved');
 await as(owner,()=>rpc('save_study_analysis',[{...changed,labels:[],stage:'code',results:{_run_id:'run-2',_draft:true,_completed:[changed]}},3]));assert.equal((await as(owner,()=>rpc('list_study_codebooks')))[0].labels[0].name,'Planning');
 await as(owner,()=>assert.rejects(rpc('get_study_run_review',[study,version,question,'missing']),/no longer available/));
});
test.after(()=>db.close());
