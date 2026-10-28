// Run with: PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test supabase/tests/canvas_lti.test.mjs
// Uses disposable real PostgreSQL (PGlite); never connects to the live project.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href : '../../frontend/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const owner = randomUUID();
const stranger = randomUUID();
let studyId, questionId;
const code = 'ABCDEF123456';
const token = 'c'.repeat(64);

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to authenticated;
`);
for (const migration of ['202610090001_studies.sql', '202610240001_canvas_lti.sql']) {
  await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
}
await db.query('insert into auth.users values ($1), ($2)', [owner, stranger]);
studyId = (await db.query(`insert into public.studies(owner_id,title,research_question,share_code)
  values ($1,'Test study','Why?',$2) returning id`, [owner, code])).rows[0].id;
questionId = (await db.query(`insert into public.study_questions(study_id,position,prompt)
  values ($1,0,'What helped?') returning id`, [studyId])).rows[0].id;
await db.query(`update public.studies set status='open' where id=$1`, [studyId]);

async function role(name, user, fn) {
  await db.exec(`set role ${name}`);
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user || '']);
    return await fn();
  } finally { await db.exec('reset role'); }
}

async function scalar(sql, args = []) { return (await db.query(sql, args)).rows[0].value; }

test('private login/session tables and identity functions deny anonymous/researcher access', async () => {
  for (const name of ['anon', 'authenticated']) {
    await role(name, owner, async () => {
      await assert.rejects(db.query('select * from public.lti_sessions'), /permission denied/);
      await assert.rejects(db.query('select * from public.lti_logins'), /permission denied/);
      await assert.rejects(db.query(`select public.lti_get_session($1)`, [token]), /permission denied/);
      await assert.rejects(db.query(`select public.submit_canvas_study($1, $2, $3, $4)`, [code, {}, token, randomUUID()]), /permission denied/);
      await assert.rejects(db.query(`update public.study_submissions set participant_data='{"name":"Forged"}'`), /permission denied/);
    });
  }
});

test('login state expires and can be consumed exactly once by the matching browser', async () => {
  const state = 'a'.repeat(64), browser = 'b'.repeat(64);
  await role('service_role', null, async () => {
    await db.query(`select public.lti_create_login($1,$2,'nonce','uf')`, [state, browser]);
    assert.equal(await scalar('select public.lti_consume_login($1,$2) as value', [state, 'd'.repeat(64)]), null);
    assert.deepEqual(await scalar('select public.lti_consume_login($1,$2) as value', [state, browser]), { nonce: 'nonce', registration_id: 'uf' });
    assert.equal(await scalar('select public.lti_consume_login($1,$2) as value', [state, browser]), null);
    await db.query(`select public.lti_create_login($1,$2,'nonce','uf')`, [state, browser]);
  });
  await db.query(`update public.lti_logins set expires_at=now()-interval '1 second'`);
  assert.equal(await scalar('select public.lti_consume_login($1,$2) as value', [state, browser]), null);
});

test('handoff exchanges once, and participant metadata is stored atomically with answers', async () => {
  const profile = { source: 'canvas', name: 'Alex', academic_year: 'Junior', subject: 'student', issuer: 'canvas', client_id: 'client', deployment_id: 'uf' };
  await role('service_role', null, async () => {
    await db.query(`select public.lti_create_handoff($1,$2)`, ['e'.repeat(64), profile]);
    assert.deepEqual(await scalar('select public.lti_exchange_handoff($1,$2) as value', ['e'.repeat(64), token]), profile);
    assert.equal(await scalar('select public.lti_exchange_handoff($1,$2) as value', ['e'.repeat(64), 'f'.repeat(64)]), null);
    const request = randomUUID();
    const params = [code, { [questionId]: '  Feedback helped  ' }, token, request];
    const id = await scalar('select public.submit_canvas_study($1,$2,$3,$4) as value', params);
    assert.equal(await scalar('select public.submit_canvas_study($1,$2,$3,$4) as value', params), id);
    await assert.rejects(db.query('select public.submit_canvas_study($1,$2,$3,$4)', [code, { [questionId]: 'Different answer' }, token, request]), /Submission request already used/);
  });
  const submissions = (await db.query('select * from public.study_submissions')).rows;
  assert.equal(submissions.length, 1);
  assert.deepEqual(submissions[0].answers, { [questionId]: 'Feedback helped' });
  assert.equal(submissions[0].participant_data.name, 'Alex');
  assert.equal(submissions[0].participant_data.academic_year, 'Junior');
  assert.ok(submissions[0].participant_data.shared_at);
  assert.equal(submissions[0].participant_data.sharing_notice_version, 'canvas-participant-v1');
});

test('only study owner can read collected participant details', async () => {
  assert.equal((await role('authenticated', owner, () => db.query('select participant_data from public.study_submissions'))).rows.length, 1);
  assert.equal((await role('authenticated', stranger, () => db.query('select participant_data from public.study_submissions'))).rows.length, 0);
  await role('anon', null, () => assert.rejects(db.query('select participant_data from public.study_submissions'), /permission denied/));
});

test('incomplete answers and closed studies create no submissions', async () => {
  await role('service_role', null, async () => {
    for (const answers of [{}, { [questionId]: 42 }, { [questionId]: '' }, { [questionId]: 'valid', unexpected: 'bad' }]) {
      await assert.rejects(db.query('select public.submit_canvas_study($1,$2,$3,$4)', [code, answers, token, randomUUID()]), /Answers must be strings|Study closed or answers invalid/);
    }
  });
  await db.query(`update public.studies set status='closed' where id=$1`, [studyId]);
  await role('service_role', null, () => assert.rejects(db.query('select public.submit_canvas_study($1,$2,$3,$4)', [code, { [questionId]: 'valid' }, token, randomUUID()]), /Study closed or answers invalid/));
  assert.equal(await scalar('select count(*)::int as value from public.study_submissions'), 1);
  await db.query(`update public.studies set status='open' where id=$1`, [studyId]);
});

test('each study gets its own snapshot and one session cannot reuse another session’s submission ID', async () => {
  const otherCode = '123456ABCDEF';
  const otherStudy = (await db.query(`insert into public.studies(owner_id,title,research_question,share_code)
    values ($1,'Second study','Why?',$2) returning id`, [owner, otherCode])).rows[0].id;
  const otherQuestion = (await db.query(`insert into public.study_questions(study_id,position,prompt)
    values ($1,0,'What changed?') returning id`, [otherStudy])).rows[0].id;
  await db.query(`update public.studies set status='open' where id=$1`, [otherStudy]);
  await role('service_role', null, () => db.query('select public.submit_canvas_study($1,$2,$3,$4)', [otherCode, { [otherQuestion]: 'Second study answer' }, token, randomUUID()]));
  const second = (await db.query('select participant_data from public.study_submissions where study_id=$1', [otherStudy])).rows;
  assert.equal(second.length, 1);
  assert.equal(second[0].participant_data.name, 'Alex');
  const otherToken = '9'.repeat(64);
  await db.query('select public.lti_create_handoff($1,$2)', ['8'.repeat(64), { source: 'canvas', name: 'Another student' }]);
  await db.query('select public.lti_exchange_handoff($1,$2)', ['8'.repeat(64), otherToken]);
  const previousRequest = (await db.query('select canvas_request_id from public.study_submissions where study_id=$1', [studyId])).rows[0].canvas_request_id;
  await role('service_role', null, () => assert.rejects(db.query('select public.submit_canvas_study($1,$2,$3,$4)', [code, { [questionId]: 'Feedback helped' }, otherToken, previousRequest]), /Submission request already used/));
});

test('expired handoffs and sessions fail closed; logout revokes sessions', async () => {
  await db.query(`select public.lti_create_handoff($1,'{}')`, ['1'.repeat(64)]);
  await db.query(`update public.lti_sessions set handoff_expires_at=now()-interval '1 second' where token_hash is null`);
  assert.equal(await scalar('select public.lti_exchange_handoff($1,$2) as value', ['1'.repeat(64), '2'.repeat(64)]), null);
  await db.query(`update public.lti_sessions set expires_at=now()-interval '1 second' where token_hash=$1`, [token]);
  assert.equal(await scalar('select public.lti_get_session($1) as value', [token]), null);
  await assert.rejects(db.query('select public.submit_canvas_study($1,$2,$3,$4)', [code, { [questionId]: 'valid' }, token, randomUUID()]), /Canvas session expired/);
  await db.query(`select public.lti_delete_session($1)`, [token]);
  assert.equal(await scalar('select count(*)::int as value from public.lti_sessions where token_hash=$1', [token]), 0);
});

test('anonymous participation still stores answers with empty participant data', async () => {
  await role('anon', null, () => db.query('select public.submit_study($1,$2)', [code, { [questionId]: 'Anonymous answer' }]));
  const row = (await db.query(`select participant_data from public.study_submissions where answers->>$1='Anonymous answer'`, [questionId])).rows[0];
  assert.deepEqual(row.participant_data, {});
});

test.after(async () => { await db.close(); });
