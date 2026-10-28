import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const owner = randomUUID(), researcher = randomUUID(), reviewer = randomUUID(), stranger = randomUUID();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema public,auth to anon,authenticated,service_role;
  grant execute on function auth.uid() to authenticated;`);
for (const name of ['202610090001_studies.sql', '202610240001_canvas_lti.sql']) await migrate(name);
for (const [id, email] of [[owner,'owner@ufl.edu'],[researcher,'researcher@ufl.edu'],[reviewer,'reviewer@ufl.edu'],[stranger,'stranger@ufl.edu']]) {
  await db.query('insert into auth.users values ($1,$2,now())',[id,email]);
}
const legacy = (await db.query(`insert into public.studies(owner_id,title,research_question)
  values ($1,'Existing study','Existing inquiry') returning *`,[owner])).rows[0];
const legacyQuestion = (await db.query(`insert into public.study_questions(study_id,position,prompt)
  values ($1,0,'Existing question') returning id`,[legacy.id])).rows[0].id;
await db.query(`update public.studies set status='open' where id=$1`,[legacy.id]);
await rpc('submit_study',[legacy.share_code,{[legacyQuestion]:'Original response'}]);
await migrate('202610280001_teams_versions_consent.sql');
const before = (await db.query('select * from public.study_submissions')).rows[0];
await migrate('202610280002_study_operations_activities.sql');

async function migrate(name) { await db.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')); }
async function as(role,user,fn) {
  await db.exec(`set role ${role}`);
  try { await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[user || '']); return await fn(); }
  finally { await db.exec('reset role'); }
}
async function rpc(name,args=[]) {
  return (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args)).rows[0]?.value;
}
const publicRpc = (name,args) => as('anon',null,()=>rpc(name,args));
const key = randomBytes(32).toString('hex'), otherKey = randomBytes(32).toString('hex');
const form = {title:'Semester experience',research_question:'How does experience change?',description:'Synthetic test',
  participant_mode:'anonymous',consent_text:'Synthetic consent for the complete activity plan.',
  compensation_details:'Course credit is coordinated separately.',contact_info:'Study coordinator',
  activities:[
    {title:'Baseline',kind:'baseline',opens_after_days:0,due_after_days:1,required:true,questions:['Baseline question']},
    {title:'Follow-up',kind:'followup',opens_after_days:2,due_after_days:3,required:true,questions:['Follow-up question']},
    {title:'Optional diary',kind:'diary',opens_after_days:0,due_after_days:null,required:false,questions:['Diary question']},
  ]};
let study, code, version, activities, enrollment, submission, requestId;

test('migration adds activity provenance without rewriting historical answers or consent',async()=>{
  const after=(await db.query('select * from public.study_submissions where id=$1',[before.id])).rows[0];
  for(const [field,value] of Object.entries(before)) assert.deepEqual(after[field],value,field);
  assert.ok(after.activity_id); assert.equal(after.enrollment_id,null); assert.equal(after.consent_accepted_at,null);
  const snapshot=await publicRpc('get_public_study',[legacy.share_code]);
  assert.equal(snapshot.activities.length,1); assert.equal(snapshot.questions[0].id,legacyQuestion);
  assert.equal(snapshot.consent_required,false);
  await publicRpc('submit_study',[legacy.share_code,{[legacyQuestion]:'Another original-flow answer'}]);
});

test('activity plans save atomically, retain global question provenance, and reject stale or invalid edits',async()=>{
  study=await as('authenticated',owner,()=>rpc('save_study_draft',[null,form,0]));
  const row=(await db.query('select * from public.studies where id=$1',[study])).rows[0]; code=row.share_code;
  assert.equal(row.activity_plan.length,3);
  assert.equal((await db.query('select * from public.study_questions where study_id=$1',[study])).rows.length,3);
  await as('authenticated',owner,async()=>{
    await assert.rejects(rpc('save_study_draft',[study,form,0]),/changed this draft/);
    for(const changed of [
      {...form,activities:[]},
      {...form,activities:form.activities.map(a=>({...a,required:false}))},
      {...form,activities:[{...form.activities[0],opens_after_days:2}]},
      {...form,activities:[{...form.activities[0],questions:['']}]},
      {...form,participant_mode:'canvas'},
    ]) await assert.rejects(rpc('save_study_draft',[study,changed,row.draft_revision]));
    await assert.rejects(rpc('save_study_draft',[study,{...form,activities:undefined,questions:['Flattened']},row.draft_revision]),/activities|Reload/);
  });
  assert.equal((await db.query('select activity_plan from public.studies where id=$1',[study])).rows[0].activity_plan.length,3);
});

test('publishing freezes the plan and study roles govern operations access',async()=>{
  for(const [user,email,role] of [[researcher,'researcher@ufl.edu','researcher'],[reviewer,'reviewer@ufl.edu','reviewer']]) {
    const invitation=await as('authenticated',owner,()=>rpc('invite_study_member',[study,email,role]));
    await as('authenticated',user,()=>rpc('accept_study_invitation',[invitation]));
  }
  await as('authenticated',owner,()=>db.query(`update public.studies set status='open' where id=$1`,[study]));
  const snapshot=await publicRpc('get_public_study',[code]);
  version=snapshot.version_id; activities=snapshot.activities;
  assert.equal(activities.length,3); assert.equal(snapshot.questions.length,3);
  assert.equal(snapshot.contact_info,form.contact_info); assert.equal(snapshot.compensation_details,form.compensation_details);
  for(const user of [owner,researcher,reviewer]) assert.equal((await as('authenticated',user,()=>rpc('get_study_operations',[study]))).participants.length,0);
  await as('authenticated',stranger,()=>assert.rejects(rpc('get_study_operations',[study]),/access/));
  await as('anon',null,()=>assert.rejects(rpc('get_study_operations',[study]),/permission denied/));
});

test('enrollment requires explicit consent and activity linking, hashes the key, and is idempotent',async()=>{
  for(const flags of [[false,true],[true,false],[null,true]]) await assert.rejects(publicRpc('enroll_study',[code,version,key,...flags]),/Accept/);
  await assert.rejects(publicRpc('enroll_study',[code,version,'guessable',true,true]),/secure/);
  await assert.rejects(publicRpc('enroll_study',[code,randomUUID(),key,true,true]),/study has changed/);
  const hub=await publicRpc('enroll_study',[code,version,key,true,true]);
  assert.match(hub.participant_reference,/^P-/); assert.equal(hub.activities[0].status,'available');
  assert.equal(hub.activities[1].status,'blocked'); assert.equal(hub.version_id,version);
  const row=(await db.query('select * from public.study_enrollments where study_id=$1',[study])).rows[0]; enrollment=row.id;
  assert.equal(row.access_key_hash,createHash('sha256').update(key).digest('hex'));
  assert.equal(JSON.stringify(hub).includes(key),false); assert.equal(JSON.stringify(hub).includes(row.access_key_hash),false);
  assert.equal((await publicRpc('enroll_study',[code,version,key,true,true])).participant_reference,hub.participant_reference);
  assert.equal((await db.query('select * from public.study_enrollments where study_id=$1',[study])).rows.length,1);
});

test('private keys cannot enumerate other participation, and no role can read unfinished answers through tables',async()=>{
  await assert.rejects(publicRpc('get_participant_study',[otherKey]),/invalid/);
  for(const role of ['anon','authenticated']) await as(role,role==='authenticated'?owner:null,async()=>{
    for(const table of ['study_enrollments','study_activity_progress','study_operations']) await assert.rejects(db.query(`select * from public.${table}`),/permission denied/);
    await assert.rejects(rpc('private_participation',[key]),/permission denied/);
    await assert.rejects(rpc('private_editable_activity',[key,activities[0].id]),/permission denied/);
  });
  await assert.rejects(publicRpc('start_study_activity',[key,randomUUID()]),/does not belong/);
  await assert.rejects(publicRpc('start_study_activity',[key,activities[1].id]),/not available/);
});

test('activity starts and draft saves persist across returns while competing tabs cannot overwrite work',async()=>{
  const started=await publicRpc('start_study_activity',[key,activities[0].id]); assert.equal(started.revision,0);
  const answers={[activities[0].questions[0].id]:'Unfinished answer'};
  assert.equal(await publicRpc('save_activity_draft',[key,activities[0].id,answers,0]),1);
  const hub=await publicRpc('get_participant_study',[key]);
  assert.equal(hub.activities[0].status,'in_progress'); assert.deepEqual(hub.activities[0].draft_answers,answers);
  await assert.rejects(publicRpc('save_activity_draft',[key,activities[0].id,{...answers},0]),/another tab/);
  for(const bad of [{foreign:'Answer'},{[activities[0].questions[0].id]:42},{[activities[0].questions[0].id]:'x'.repeat(10001)}]) {
    await assert.rejects(publicRpc('save_activity_draft',[key,activities[0].id,bad,1]),/Check the draft/);
  }
  const operations=await as('authenticated',owner,()=>rpc('get_study_operations',[study]));
  assert.equal(operations.participants[0].started,true); assert.equal(JSON.stringify(operations).includes('Unfinished answer'),false);
});

test('complete activity submissions enforce consent and question boundaries and cannot use the legacy bypass',async()=>{
  const aid=activities[0].id, question=activities[0].questions[0].id;
  await assert.rejects(publicRpc('submit_study_activity',[key,aid,{[question]:'Answer'},false,randomUUID()]),/consent/);
  for(const bad of [{},{[question]:''},{[question]:42},{[question]:'Answer',extra:'Not part of this activity'}]) {
    await assert.rejects(publicRpc('submit_study_activity',[key,aid,bad,true,randomUUID()]),/text answers|Complete each/);
  }
  const allAnswers=Object.fromEntries(activities.flatMap(a=>a.questions.map(q=>[q.id,'Bypass attempt'])));
  await assert.rejects(publicRpc('submit_study_version',[code,allAnswers,version,true,randomUUID()]),/study hub/);
  requestId=randomUUID();
  submission=await publicRpc('submit_study_activity',[key,aid,{[question]:'  Baseline complete  '},true,requestId]);
  assert.equal(await publicRpc('submit_study_activity',[key,aid,{[question]:'Baseline complete'},true,requestId]),submission);
  await assert.rejects(publicRpc('submit_study_activity',[key,aid,{[question]:'Changed'},true,requestId]),/request already used/);
  const row=(await db.query('select * from public.study_submissions where id=$1',[submission])).rows[0];
  assert.equal(row.enrollment_id,enrollment); assert.equal(row.activity_id,aid); assert.equal(row.study_version_id,version);
  const hub=await publicRpc('get_participant_study',[key]);
  assert.equal(hub.activities[0].status,'completed'); assert.deepEqual(hub.activities[0].draft_answers,{});
  assert.equal(hub.activities[1].status,'upcoming');
  await assert.rejects(publicRpc('save_activity_draft',[key,aid,{[question]:'Late overwrite'},1]),/already been submitted/);
});

test('receipts identify the actual activity, version, and consent without disclosing answers or return keys',async()=>{
  const receipt=await publicRpc('get_study_receipt',[submission,requestId]);
  assert.equal(receipt.activity_id,activities[0].id); assert.equal(receipt.activity_title,'Baseline');
  assert.equal(receipt.version_id,version); assert.equal(receipt.consent_text,form.consent_text);
  assert.ok(receipt.consent_accepted_at); assert.equal(receipt.participant_mode,'study_code');
  assert.match(receipt.linking_notice_text,/linked using a study-specific code/);
  assert.equal(receipt.linking_notice_version,'study-activities-v1'); assert.ok(receipt.linking_accepted_at);
  assert.equal(receipt.answers,undefined); assert.equal(receipt.access_key,undefined);
  assert.equal(await publicRpc('get_study_receipt',[submission,randomUUID()]),null);
});

test('follow-ups unlock on their opening day and operations count completed enrollments rather than response rows',async()=>{
  await db.query(`update public.study_enrollments set consent_accepted_at=now()-interval '4 days' where id=$1`,[enrollment]);
  const hub=await publicRpc('get_participant_study',[key]); assert.equal(hub.activities[1].status,'overdue');
  await publicRpc('start_study_activity',[key,activities[1].id]);
  await publicRpc('submit_study_activity',[key,activities[1].id,{[activities[1].questions[0].id]:'Follow-up complete'},true,randomUUID()]);
  const ops=await as('authenticated',owner,()=>rpc('get_study_operations',[study]));
  assert.equal(ops.participants.length,1); assert.equal(ops.participants[0].completed_required,2);
  assert.equal(ops.participants[0].required_count,2); assert.equal(ops.participants[0].completed_activities,2);
  assert.equal(ops.activity_submissions,2); assert.equal(ops.unlinked_responses,0);
  const old=await as('authenticated',owner,()=>rpc('get_study_operations',[legacy.id]));
  assert.equal(old.participants.length,0); assert.equal(old.unlinked_responses,2);
});

test('operations settings and manual reward handoffs enforce roles and stale-save protection',async()=>{
  assert.equal(await as('authenticated',owner,()=>rpc('save_study_operations',[study,40,'Private coordinator notes',0])),1);
  assert.equal(await as('authenticated',researcher,()=>rpc('save_study_operations',[study,45,'Updated notes',1])),2);
  await as('authenticated',owner,()=>assert.rejects(rpc('save_study_operations',[study,999,'Overwrite',1]),/another researcher/));
  for(const user of [reviewer,stranger]) await as('authenticated',user,()=>assert.rejects(rpc('save_study_operations',[study,1,'',2]),/permission/));
  await as('authenticated',owner,()=>assert.rejects(rpc('save_study_operations',[study,-1,'',2]),/check constraint/));
  assert.equal(await as('authenticated',researcher,()=>rpc('update_participation_reward',[enrollment,'handed_off',1])),2);
  await as('authenticated',owner,()=>assert.rejects(rpc('update_participation_reward',[enrollment,'confirmed',1]),/record changed/));
  await as('authenticated',reviewer,()=>assert.rejects(rpc('update_participation_reward',[enrollment,'confirmed',2]),/permission/));
  const ops=await as('authenticated',reviewer,()=>rpc('get_study_operations',[study]));
  assert.equal(ops.recruitment_target,45); assert.equal(ops.participants[0].reward_status,'handed_off');
  assert.equal(JSON.stringify(await publicRpc('get_public_study',[code])).includes('Updated notes'),false);
});

test('closure pauses writes but preserves receipts and safe retries; new versions do not rewrite an enrolled plan',async()=>{
  await as('authenticated',owner,()=>db.query(`update public.studies set status='closed' where id=$1`,[study]));
  await assert.rejects(publicRpc('start_study_activity',[key,activities[2].id]),/paused or closed/);
  assert.equal((await publicRpc('get_participant_study',[key])).activities[0].status,'completed');
  assert.equal(await publicRpc('submit_study_activity',[key,activities[0].id,{[activities[0].questions[0].id]:'Baseline complete'},true,requestId]),submission);
  await as('authenticated',owner,async()=>{
    await db.query(`update public.studies set status='draft' where id=$1`,[study]);
    const revision=(await db.query('select draft_revision from public.studies where id=$1',[study])).rows[0].draft_revision;
    await rpc('save_study_draft',[study,{...form,consent_text:'New version consent'},revision]);
    await db.query(`update public.studies set status='open' where id=$1`,[study]);
  });
  const latest=await publicRpc('get_public_study',[code]); assert.notEqual(latest.version_id,version);
  const original=await publicRpc('get_participant_study',[key]); assert.equal(original.version_id,version);
  assert.equal(original.consent_text,form.consent_text); assert.equal(original.activities[0].receipt.activity_title,'Baseline');
  await assert.rejects(publicRpc('start_study_activity',[key,latest.activities[0].id]),/does not belong/);
  await publicRpc('start_study_activity',[key,activities[2].id]);
  await publicRpc('submit_study_activity',[key,activities[2].id,{[activities[2].questions[0].id]:'Optional original-plan entry'},true,randomUUID()]);
  const second=await publicRpc('enroll_study',[code,latest.version_id,otherKey,true,true]);
  assert.equal(second.activities[0].status,'available'); assert.equal(second.consent_text,'New version consent');
});

test('revoking a team member removes operations access immediately',async()=>{
  const member=(await db.query('select id from public.study_members where study_id=$1 and user_id=$2',[study,researcher])).rows[0].id;
  await as('authenticated',owner,()=>rpc('remove_study_member',[member]));
  await as('authenticated',researcher,()=>assert.rejects(rpc('get_study_operations',[study]),/access/));
  await as('authenticated',researcher,()=>assert.rejects(rpc('update_participation_reward',[enrollment,'confirmed',2]),/permission/));
});

test('the original owner study-deletion path still removes the complete disposable study atomically',async()=>{
  await as('authenticated',owner,()=>db.query('delete from public.studies where id=$1',[study]));
  assert.equal((await db.query('select count(*)::integer as count from public.study_enrollments where study_id=$1',[study])).rows[0].count,0);
  assert.equal((await db.query('select count(*)::integer as count from public.study_submissions where study_id=$1',[study])).rows[0].count,0);
});

test.after(()=>db.close());
