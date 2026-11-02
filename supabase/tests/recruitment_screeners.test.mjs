import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes,randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite(), owner=randomUUID(), researcher=randomUUID(), reviewer=randomUUID(), outsider=randomUUID();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to authenticated;`);
for(const [id,email] of [[owner,'owner@ufl.edu'],[researcher,'researcher@ufl.edu'],[reviewer,'reviewer@ufl.edu'],[outsider,'other@ufl.edu']])await db.query('insert into auth.users values($1,$2,now())',[id,email]);
for(const name of ['202610090001_studies.sql','202610240001_canvas_lti.sql','202610280001_teams_versions_consent.sql','202610280002_study_operations_activities.sql','202611020001_analysis_jobs.sql'])await db.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));
async function as(role,user,fn){await db.exec(`set role ${role}`);try{await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[user||'']);return await fn();}finally{await db.exec('reset role');}}
async function rpc(name,args=[]){return(await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0]?.value;}
const member=(user,name,args)=>as('authenticated',user,()=>rpc(name,args)), anon=(name,args)=>as('anon',null,()=>rpc(name,args));
const config={enabled:true,eligibility:'Students with advising experience',estimated_minutes:10,location:'Online',notice:'Fabricated software test. Screening is reviewed by the study team.',questions:[
 {id:'q1',prompt:'Have you used advising?',options:[{id:'yes',label:'Yes',qualifies:true},{id:'no',label:'No',qualifies:false}]},
 {id:'q2',prompt:'Which format?',show_if:{question_id:'q1',option_id:'yes'},options:[{id:'online',label:'Online',qualifies:true},{id:'campus',label:'On campus',qualifies:true}]},
 {id:'q3',prompt:'Follow-up format detail?',show_if:{question_id:'q2',option_id:'online'},options:[{id:'video',label:'Video',qualifies:true},{id:'text',label:'Text',qualifies:true}]}
]};
const form={title:'Screened study',research_question:'How does advising help?',consent_text:'Synthetic study consent',participant_mode:'anonymous',recruitment:config,
 activities:[{title:'Experience',kind:'survey',required:true,opens_after_days:0,questions:['What helped?']}]};
const legacy=await member(owner,'save_study_draft',[null,{...form,recruitment:undefined},0]);
await as('authenticated',owner,()=>db.query(`update public.studies set status='open' where id=$1`,[legacy]));
const legacyBefore=(await db.query('select * from public.study_versions where study_id=$1',[legacy])).rows[0];
await db.exec(await readFile(new URL('../migrations/202611020002_recruitment_screeners.sql',import.meta.url),'utf8'));
let study,version,code,applicant,revision,key=randomBytes(32).toString('hex');
const answers={q1:'yes',q2:'online',q3:'text'};

test('additive migration preserves original published records and unscreened flow',async()=>{
 const after=(await db.query('select * from public.study_versions where study_id=$1',[legacy])).rows[0];
 for(const [field,value]of Object.entries(legacyBefore))assert.deepEqual(after[field],value,field);
 const legacyCode=(await db.query('select share_code from public.studies where id=$1',[legacy])).rows[0].share_code;
 const snapshot=await anon('get_public_study',[legacyCode]);assert.equal(snapshot.recruitment.enabled,false);
 await anon('submit_study_version',[legacyCode,{[snapshot.questions[0].id]:'Original flow works'},snapshot.version_id,true,randomUUID()]);
});
test('draft validation rejects cycles, malformed settings and Canvas screeners atomically',async()=>{
 for(const recruitment of [{...config,estimated_minutes:0},{...config,questions:[]},{...config,notice:''},
  {...config,questions:[{...config.questions[0],show_if:{question_id:'q2',option_id:'online'}}]},
  {...config,questions:[config.questions[0],config.questions[0]]}])await assert.rejects(member(owner,'save_study_draft',[null,{...form,recruitment},0]));
 await assert.rejects(member(owner,'save_study_draft',[null,{...form,participant_mode:'canvas'},0]),/anonymous/);
 assert.equal((await db.query('select count(*)::int n from public.studies')).rows[0].n,1);
 study=await member(owner,'save_study_draft',[null,form,0]);
 code=(await db.query('select share_code from public.studies where id=$1',[study])).rows[0].share_code;
 for(const [user,email,role]of [[researcher,'researcher@ufl.edu','researcher'],[reviewer,'reviewer@ufl.edu','reviewer']]){
  const invite=await member(owner,'invite_study_member',[study,email,role]);await member(user,'accept_study_invitation',[invite]);
 }
 await as('authenticated',owner,()=>db.query(`update public.studies set status='open' where id=$1`,[study]));
 const snapshot=await anon('get_public_study',[code]);version=snapshot.version_id;
 assert.equal(snapshot.recruitment.questions.length,3);assert.equal(JSON.stringify(snapshot.recruitment).includes('qualifies'),false);
 assert.equal(snapshot.recruitment.location,'Online');assert.equal((await anon('get_public_study',['MISSING'])),null);
 await assert.rejects(member(owner,'save_study_draft',[study,form,1]),/new draft/);
});
test('screening enforces notice, snapshot, visible branches and allowed choices; retries freeze the answers',async()=>{
 for(const [changes,pattern]of [
  [{p_answers:{q1:'yes'}},/each visible/],[{p_answers:{q1:'no',q2:'online'}},/hidden/],
  [{p_answers:{q1:'no',q3:'text'}},/hidden/],[{p_answers:{q1:'maybe'}},/listed/],
  [{p_screening_accepted:false},/accept/],[{p_version_id:randomUUID()},/changed/],[{p_access_key:'guess'},/secure/]
 ]){
  const p={p_code:code,p_version_id:version,p_access_key:key,p_answers:answers,p_screening_accepted:true,...changes};
  await assert.rejects(anon('submit_study_screener',Object.values(p)),pattern);
 }
 const result=await anon('submit_study_screener',[code,version,key,answers,true]);assert.equal(result.recruitment_status,'awaiting_review');
 assert.equal((await anon('submit_study_screener',[code,version,key,answers,true])).reference,result.reference);
 await assert.rejects(anon('submit_study_screener',[code,version,key,{q1:'no'},true]),/already submitted/);
 const candidates=await member(owner,'get_study_recruitment',[study]);assert.equal(candidates.applicants.length,1);
 applicant=candidates.applicants[0];revision=applicant.revision;assert.equal(applicant.rule_result,'matches');
 const nonmatch=await anon('submit_study_screener',[code,version,randomBytes(32).toString('hex'),{q1:'no'},true]);
 assert.equal(nonmatch.recruitment_status,'awaiting_review');
 assert.equal((await member(owner,'get_study_recruitment',[study])).applicants.find(a=>a.reference===nonmatch.reference).rule_result,'needs_review');
});
test('participant and table access cannot expose notes, keys, other applicants, or helper functions',async()=>{
 for(const user of [outsider])await assert.rejects(member(user,'get_study_recruitment',[study]),/access/);
 await assert.rejects(anon('get_study_recruitment',[study]),/permission denied/);
 for(const table of ['study_applicants','study_applicant_events'])for(const role of ['anon','authenticated'])await as(role,owner,()=>assert.rejects(db.query(`select * from public.${table}`),/permission denied/));
 await assert.rejects(anon('private_applicant',[key]),/permission denied/);
 await assert.rejects(anon('private_save_study_draft_base',[study,form,1]),/permission denied/);
 await assert.rejects(anon('get_participant_portal',[randomBytes(32).toString('hex')]),/invalid/);
 assert.equal(JSON.stringify(await member(reviewer,'get_study_recruitment',[study])).includes(key),false);
});
test('human review, waitlists and invitations enforce roles, stale revisions and an eligibility step',async()=>{
 for(const user of [outsider,reviewer])await assert.rejects(member(user,'review_study_applicant',[applicant.id,'eligible','Private note',revision]),/permission/);
 await assert.rejects(member(owner,'review_study_applicant',[applicant.id,'invited','',revision]),/Confirm eligibility/);
 revision=await member(researcher,'review_study_applicant',[applicant.id,'waitlisted','Private note',revision]);
 assert.equal((await anon('get_participant_portal',[key])).screening.recruitment_status,'waitlisted');
 assert.equal(JSON.stringify(await anon('get_participant_portal',[key])).includes('Private note'),false);
 await assert.rejects(member(owner,'review_study_applicant',[applicant.id,'eligible','',1]),/changed/);
 revision=await member(owner,'review_study_applicant',[applicant.id,'eligible','Human checked',revision]);
 revision=await member(owner,'review_study_applicant',[applicant.id,'invited','Ready to join',revision]);
 const panel=(await member(owner,'get_study_recruitment',[study])).applicants.find(a=>a.id===applicant.id);
 assert.equal(panel.events.length,3);assert.equal(panel.status,'invited');
 assert.equal((await anon('get_participant_recruitment',[key])).can_join,true);
});
test('uninvited participants cannot bypass screening through old submit or enrollment APIs',async()=>{
 const snapshot=await anon('get_public_study',[code]);
 await assert.rejects(anon('submit_study_version',[code,{[snapshot.questions[0].id]:'Bypass'},version,true,randomUUID()]),/invited private/);
 await assert.rejects(anon('enroll_recruited_study',[key,false,true]),/Accept/);
 const multi=await member(owner,'save_study_draft',[null,{...form,activities:[...form.activities,{...form.activities[0],title:'Follow-up'}]},0]);
 await as('authenticated',owner,()=>db.query(`update public.studies set status='open' where id=$1`,[multi]));
 const m=(await db.query('select * from public.studies where id=$1',[multi])).rows[0];
 await assert.rejects(anon('enroll_study',[m.share_code,m.current_version_id,randomBytes(32).toString('hex'),true,true]),/screening/);
});
test('invitation enrollment is idempotent, requires separate study consent, and tracks completion from actual responses',async()=>{
 const hub=await anon('enroll_recruited_study',[key,true,true]);assert.equal(hub.activities.length,1);
 assert.equal((await anon('enroll_recruited_study',[key,true,true])).participant_reference,hub.participant_reference);
 assert.equal((await anon('get_participant_portal',[key])).title,form.title);
 let row=(await member(owner,'get_study_recruitment',[study])).applicants.find(a=>a.id===applicant.id);assert.equal(row.status,'enrolled');
 await assert.rejects(member(owner,'review_study_applicant',[applicant.id,'not_eligible','',revision]),/already enrolled/);
 await anon('submit_study_activity',[key,hub.activities[0].id,{[hub.activities[0].questions[0].id]:'Research answer only'},true,randomUUID()]);
 row=(await member(owner,'get_study_recruitment',[study])).applicants.find(a=>a.id===applicant.id);assert.equal(row.status,'completed');
 const submission=(await db.query('select answers from public.study_submissions where study_id=$1',[study])).rows[0];
 assert.equal(JSON.stringify(submission).includes('online'),false);
});
test('old invitations cannot silently enroll into revised studies, while existing enrollments retain their plan',async()=>{
 const spare=randomBytes(32).toString('hex');
 await anon('submit_study_screener',[code,version,spare,{q1:'no'},true]);
 let candidate=(await member(owner,'get_study_recruitment',[study])).applicants.find(a=>a.answers.q1==='no'&&a.status==='awaiting_review');
 let rev=await member(owner,'review_study_applicant',[candidate.id,'eligible','Manual override after review',candidate.revision]);
 await member(owner,'review_study_applicant',[candidate.id,'invited','',rev]);
 await as('authenticated',owner,()=>db.query(`update public.studies set status='closed' where id=$1`,[study]));
 await assert.rejects(anon('enroll_recruited_study',[spare,true,true]),/paused or closed/);
 await as('authenticated',owner,()=>db.query(`update public.studies set status='draft' where id=$1`,[study]));
 const saved=(await db.query('select draft_revision from public.studies where id=$1',[study])).rows[0].draft_revision;
 await member(owner,'save_study_draft',[study,{...form,recruitment:{...config,notice:'Revised screening notice'}},saved]);
 await as('authenticated',owner,()=>db.query(`update public.studies set status='open' where id=$1`,[study]));
 assert.equal((await anon('get_participant_recruitment',[spare])).current_version,false);
 await assert.rejects(anon('enroll_recruited_study',[spare,true,true]),/newer version/);
 assert.equal((await anon('get_participant_portal',[key])).version_id,version);
 const newer=await anon('get_public_study',[code]);assert.equal(newer.recruitment.notice,'Revised screening notice');
 assert.equal((await db.query('select recruitment from public.study_versions where id=$1',[version])).rows[0].recruitment.notice,config.notice);
});
test.after(()=>db.close());
