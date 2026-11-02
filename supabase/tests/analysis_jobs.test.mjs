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
await migrate('202611020001_analysis_jobs.sql');

async function migrate(name) { await db.exec(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8')); }
async function as(role,user,fn) {
  await db.exec(`set role ${role}`);
  try { await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[user || '']); return await fn(); }
  finally { await db.exec('reset role'); }
}
async function rpc(name,args=[]) {
  return (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args)).rows[0]?.value;
}

const version=(await db.query('select current_version_id from public.studies where id=$1',[legacy.id])).rows[0].current_version_id;
const payload={dataset:[{original:'Synthetic answer',themes:[]}],labels:[{name:'Help'}]};
const args=[legacy.id,version,legacyQuestion,'run-one','classify'];
const ownerJob=(extra=[])=>as('authenticated',owner,()=>rpc('analysis_job',[...args,...extra]));
let job,claim;
test('enqueue is durable and idempotent, and cannot replace submitted inputs',async()=>{
 job=await ownerJob([payload]);
 const duplicate=await ownerJob([payload]);
 await assert.rejects(ownerJob([{...payload,dataset:[{original:'Changed'}]}]),/already running/);
 assert.equal(duplicate.id,job.id);assert.deepEqual(duplicate.payload,payload);
 assert.equal((await ownerJob()).status,'queued');
 assert.equal('lease_token' in job,false);
});
test('outsiders, anonymous users and browser roles cannot read the table or claim work',async()=>{
 await as('authenticated',stranger,()=>assert.rejects(rpc('analysis_job',args),/access denied/i));
 for(const role of ['anon','authenticated'])await as(role,owner,async()=>{
  await assert.rejects(db.query('select * from public.analysis_jobs'),/permission denied/);
  await assert.rejects(rpc('claim_analysis_job'),/permission denied/);
  await assert.rejects(rpc('update_analysis_job',[job.id,randomUUID(),'completed',{},null]),/permission denied/);
 });
});
test('question/version provenance is checked',async()=>{
 await as('authenticated',owner,()=>assert.rejects(rpc('analysis_job',[legacy.id,version,randomUUID(),'run','classify',payload]),/does not belong/));
});
test('claim has a lease and only its worker can finish',async()=>{
 claim=await as('service_role',null,()=>rpc('claim_analysis_job'));
 assert.equal(claim.id,job.id);assert.equal(claim.attempts,1);
 assert.equal(await as('service_role',null,()=>rpc('claim_analysis_job')),null);
 assert.equal(await as('service_role',null,()=>rpc('update_analysis_job',[job.id,randomUUID(),'completed',{},null])),false);
});
test('restart reclaims expired jobs and rejects stale workers',async()=>{
 await db.query("update public.analysis_jobs set lease_until=now()-interval '1 second' where id=$1",[job.id]);
 const recovered=await as('service_role',null,()=>rpc('claim_analysis_job'));
 assert.notEqual(recovered.lease_token,claim.lease_token);
 assert.equal(await as('service_role',null,()=>rpc('update_analysis_job',[job.id,claim.lease_token,'completed',{},null])),false);
 claim=recovered;
 assert.equal(await as('service_role',null,()=>rpc('update_analysis_job',[job.id,claim.lease_token,'failed',null,'Please retry'])),true);
});
test('retry keeps frozen inputs and completed results survive reconnection',async()=>{
 assert.equal((await ownerJob([null,true])).status,'queued');
 claim=await as('service_role',null,()=>rpc('claim_analysis_job'));
 await as('service_role',null,()=>rpc('update_analysis_job',[job.id,claim.lease_token,'completed',{claude_data:{Help:[0]}},null]));
 const reopened=await ownerJob();assert.equal(reopened.status,'completed');assert.deepEqual(reopened.payload,payload);
 assert.deepEqual(reopened.result,{claude_data:{Help:[0]}});
 assert.equal((await ownerJob([null,true])).status,'completed');
});

test('changed inputs create a new job without replacing earlier results',async()=>{
 const changed={...payload,dataset:[{original:'A new response',themes:[]}]};
 const newer=await ownerJob([changed]);assert.notEqual(newer.id,job.id);assert.equal(newer.status,'queued');
 const earlier=(await db.query('select * from public.analysis_jobs where id=$1',[job.id])).rows[0];
 assert.equal(earlier.status,'completed');assert.deepEqual(earlier.payload,payload);
});

test('reviewers can inspect progress but cannot enqueue or retry',async()=>{
 await db.query("insert into public.study_members(study_id,email,user_id,role,invited_by,accepted_at) values($1,'reviewer@ufl.edu',$2,'reviewer',$3,now())",[legacy.id,reviewer,owner]);
 assert.equal((await as('authenticated',reviewer,()=>rpc('analysis_job',args))).status,'queued');
 await as('authenticated',reviewer,()=>assert.rejects(rpc('analysis_job',[...args,payload]),/Editing access/));
 await as('authenticated',reviewer,()=>assert.rejects(rpc('analysis_job',[...args,null,true]),/Editing access/));
});
test('repeated crashes terminate instead of retrying forever',async()=>{
 const active=await as('service_role',null,()=>rpc('claim_analysis_job'));
 await db.query("update public.analysis_jobs set attempts=3,lease_until=now()-interval '1 second' where id=$1",[active.id]);
 assert.equal(await as('service_role',null,()=>rpc('claim_analysis_job')),null);
 assert.equal((await ownerJob()).status,'failed');
});
