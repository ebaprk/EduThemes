// Disposable PostgreSQL. No production credentials or network connections.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '../../frontend/node_modules/@electric-sql/pglite/dist/index.js');
const db = new PGlite();
const owner = randomUUID(), researcher = randomUUID(), reviewer = randomUUID(), stranger = randomUUID(), unverified = randomUUID();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to authenticated;`);
for (const migration of ['202610090001_studies.sql', '202610240001_canvas_lti.sql']) {
  await db.exec(await readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
}
for (const [id, email] of [[owner, 'owner@ufl.edu'], [researcher, 'researcher@ufl.edu'], [reviewer, 'reviewer@ufl.edu'], [stranger, 'stranger@ufl.edu'], [unverified, 'pending@ufl.edu']]) {
  await db.query('insert into auth.users values ($1,$2,$3)', [id, email, id === unverified ? null : new Date().toISOString()]);
}
const legacy = (await db.query(`insert into public.studies(owner_id,title,research_question,share_code)
  values ($1,'Legacy study','Why?','ABCDEF123456') returning id`, [owner])).rows[0].id;
const oldQuestion = (await db.query(`insert into public.study_questions(study_id,position,prompt)
  values ($1,0,'Old question') returning id`, [legacy])).rows[0].id;
await db.query(`update public.studies set status='open' where id=$1`, [legacy]);
await db.query(`select public.submit_study('ABCDEF123456', $1)`, [{ [oldQuestion]: 'Existing response' }]);
await db.query(`insert into public.study_analyses(study_id,question_id,owner_id,labels,coded_responses,stage,response_count)
  values ($1,$2,$3,'[]','[]','code',1)`, [legacy, oldQuestion, owner]);
await db.exec(await readFile(new URL('../migrations/202610280001_teams_versions_consent.sql', import.meta.url), 'utf8'));

async function as(role, user, fn) {
  await db.exec(`set role ${role}`);
  try { await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [user || '']); return await fn(); }
  finally { await db.exec('reset role'); }
}
async function scalar(sql, params = []) { return (await db.query(sql, params)).rows[0]?.value; }
async function rpc(name, args = [], types = args.map(() => '')) {
  return scalar(`select public.${name}(${args.map((_, i) => `$${i + 1}${types[i] ? `::${types[i]}` : ''}`).join(',')}) as value`, args);
}
const form = { title: 'Advising study', description: 'Tell us about advising', research_question: 'What helps?',
  additional_context: '', consent_text: 'Participation is voluntary. Contact the study team with questions.', participant_mode: 'anonymous', questions: ['What helped?'] };
let study, version, question, code, invitation;

test('migration preserves historical submissions, questions, and analysis without fabricating consent', async () => {
  const rows = (await db.query('select * from public.study_submissions where study_id=$1', [legacy])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].answers[oldQuestion], 'Existing response');
  assert.equal(rows[0].consent_accepted_at, null);
  const snapshot = await rpc('get_public_study', ['ABCDEF123456']);
  assert.equal(snapshot.consent_required, false);
  assert.equal(snapshot.participant_mode, 'optional_canvas');
  assert.equal(snapshot.questions[0].id, oldQuestion);
  assert.equal((await db.query('select study_version_id from public.study_analyses')).rows[0].study_version_id, snapshot.version_id);
});

test('complete draft saves are atomic and reject stale editors', async () => {
  study = await as('authenticated', owner, () => rpc('save_study_draft', [null, form, 0]));
  let row = (await db.query('select * from public.studies where id=$1', [study])).rows[0];
  code = row.share_code;
  await as('authenticated', owner, () => assert.rejects(rpc('save_study_draft', [study, { ...form, title: 'Lost change' }, 0]), /changed this draft/));
  await as('authenticated', owner, () => assert.rejects(rpc('save_study_draft', [study, { ...form, questions: [''] }, row.draft_revision]), /check constraint/));
  assert.equal((await db.query('select title from public.studies where id=$1', [study])).rows[0].title, form.title);
  assert.equal((await db.query('select prompt from public.study_questions where study_id=$1', [study])).rows[0].prompt, 'What helped?');
  const noConsent = await as('authenticated', owner, () => rpc('save_study_draft', [null, { ...form, consent_text: '' }, 0]));
  await as('authenticated', owner, () => assert.rejects(db.query(`update public.studies set status='open' where id=$1`, [noConsent]), /consent text/));
});

test('email invitations reveal no study data until the verified intended account accepts', async () => {
  invitation = await as('authenticated', owner, () => rpc('invite_study_member', [study, ' Researcher@ufl.edu ', 'researcher']));
  await as('authenticated', researcher, async () => {
    assert.equal((await db.query('select * from public.studies where id=$1', [study])).rows.length, 0);
    assert.equal((await rpc('pending_study_invitations'))[0].id, invitation);
  });
  await as('authenticated', stranger, () => assert.rejects(rpc('accept_study_invitation', [invitation]), /verified email/));
  const pending = await as('authenticated', owner, () => rpc('invite_study_member', [study, 'pending@ufl.edu', 'researcher']));
  await as('authenticated', unverified, async () => {
    assert.deepEqual(await rpc('pending_study_invitations'), []);
    await assert.rejects(rpc('accept_study_invitation', [pending]), /verified email/);
  });
  assert.equal(await as('authenticated', researcher, () => rpc('accept_study_invitation', [invitation])), study);
  assert.equal(await as('authenticated', researcher, () => rpc('study_role', [study])), 'researcher');
  await as('authenticated', researcher, () => assert.rejects(rpc('invite_study_member', [study, 'stranger@ufl.edu', 'researcher']), /Only the study owner/));
});

test('researchers edit drafts; owners control publication; reviewers have read-only access', async () => {
  let row = (await db.query('select * from public.studies where id=$1', [study])).rows[0];
  await as('authenticated', researcher, () => rpc('save_study_draft', [study, form, row.draft_revision]));
  await as('authenticated', researcher, () => assert.rejects(db.query(`update public.studies set status='open' where id=$1`, [study]), /Only the study owner/));
  const invite = await as('authenticated', owner, () => rpc('invite_study_member', [study, 'reviewer@ufl.edu', 'reviewer']));
  await as('authenticated', reviewer, () => rpc('accept_study_invitation', [invite]));
  await as('authenticated', reviewer, async () => {
    assert.equal((await db.query('select * from public.studies where id=$1', [study])).rows.length, 1);
    await assert.rejects(rpc('save_study_draft', [study, form, 3]), /permission/);
    assert.equal((await db.query(`update public.studies set status='open' where id=$1 returning id`, [study])).rows.length, 0);
    await assert.rejects(db.query(`update public.study_questions set prompt='Forged'`), /permission denied/);
  });
  await as('authenticated', owner, () => db.query(`update public.studies set status='open' where id=$1`, [study]));
  const published = await as('anon', null, () => rpc('get_public_study', [code]));
  version = published.version_id; question = published.questions[0].id;
  assert.equal(published.version_number, 1);
  assert.equal(published.consent_text, form.consent_text);
  await as('authenticated', owner, () => assert.rejects(db.query(`update public.study_versions set consent_text='Changed'`), /permission denied/));
});

test('public submission enforces consent, version, complete text answers, and identity mode', async () => {
  await as('anon', null, async () => {
    await assert.rejects(rpc('submit_study', [code, { [question]: 'Bypass' }]), /current consent/);
    await assert.rejects(rpc('submit_study_version', [code, { [question]: 'No consent' }, version, false, randomUUID()]), /accept the study consent/);
    await assert.rejects(rpc('submit_study_version', [code, { [question]: 'Stale' }, randomUUID(), true, randomUUID()]), /study has changed/);
    for (const answers of [{}, { [question]: 42 }, { [question]: '' }, { [question]: 'Valid', extra: 'Invalid' }]) {
      await assert.rejects(rpc('submit_study_version', [code, answers, version, true, randomUUID()]), /text answers|Complete each/);
    }
    await assert.rejects(rpc('record_study_submission', [code, { [question]: 'Bypass' }, version, true, randomUUID(), null]), /permission denied/);
    await assert.rejects(db.query('select * from public.study_submissions'), /permission denied/);
  });
});

let submission, requestId;
test('anonymous submissions are idempotent and retain a server-timestamped consent receipt', async () => {
  requestId = randomUUID();
  const args = [code, { [question]: '  Helpful feedback  ' }, version, true, requestId];
  submission = await as('anon', null, () => rpc('submit_study_version', args));
  assert.equal(await as('anon', null, () => rpc('submit_study_version', args)), submission);
  await as('anon', null, () => assert.rejects(rpc('submit_study_version', [code, { [question]: 'Different' }, version, true, requestId]), /request already used/));
  const row = (await db.query('select * from public.study_submissions where id=$1', [submission])).rows[0];
  assert.equal(row.answers[question], 'Helpful feedback');
  assert.ok(row.consent_accepted_at);
  assert.equal(row.study_version_id, version);
  assert.deepEqual(row.participant_data, {});
  const receipt = await as('anon', null, () => rpc('get_study_receipt', [submission, requestId]));
  assert.equal(receipt.consent_text, form.consent_text);
  assert.ok(receipt.consent_accepted_at);
  assert.equal(receipt.answers, undefined);
  assert.equal(await as('anon', null, () => rpc('get_study_receipt', [submission, randomUUID()])), null);
  assert.equal((await as('authenticated', reviewer, () => db.query('select * from public.study_submissions where study_id=$1', [study]))).rows.length, 1);
  assert.equal((await as('authenticated', stranger, () => db.query('select * from public.study_submissions where study_id=$1', [study]))).rows.length, 0);
});

test('analysis saves enforce role, question provenance, and optimistic concurrency', async () => {
  const snapshot = { study_id: study, study_version_id: version, question_id: question,
    labels: [], coded_responses: [{ original: 'Helpful feedback', submission_id: submission }], stage: 'code', response_count: 1 };
  assert.equal(await as('authenticated', owner, () => rpc('save_study_analysis', [snapshot, 0])), 1);
  assert.equal(await as('authenticated', researcher, () => rpc('save_study_analysis', [snapshot, 1])), 2);
  await as('authenticated', owner, () => assert.rejects(rpc('save_study_analysis', [snapshot, 1]), /Another researcher saved/));
  await as('authenticated', reviewer, () => assert.rejects(rpc('save_study_analysis', [snapshot, 2]), /permission/));
  await as('authenticated', stranger, () => assert.rejects(rpc('save_study_analysis', [snapshot, 2]), /permission/));
  await as('authenticated', owner, () => assert.rejects(rpc('save_study_analysis', [{ ...snapshot, question_id: randomUUID() }, 0]), /does not belong/));
  await as('authenticated', researcher, () => assert.rejects(db.query(`update public.study_analyses set stage='results'`), /permission denied/));
  const saved = (await db.query('select * from public.study_analyses where study_id=$1', [study])).rows[0];
  assert.equal(saved.owner_id, owner);
  assert.equal(saved.updated_by, researcher);
  assert.equal(saved.revision, 2);
});

test('new versions preserve old evidence and reject participants holding a stale version', async () => {
  await as('authenticated', owner, async () => {
    await assert.rejects(db.query(`update public.studies set status='draft' where id=$1`, [study]), /Close this study/);
    await db.query(`update public.studies set status='closed' where id=$1`, [study]);
    await db.query(`update public.studies set status='draft' where id=$1`, [study]);
    const revision = (await db.query('select draft_revision from public.studies where id=$1', [study])).rows[0].draft_revision;
    await rpc('save_study_draft', [study, { ...form, consent_text: 'Revised consent', questions: ['What changed?'] }, revision]);
    assert.equal(await rpc('get_public_study', [code]), null);
    await db.query(`update public.studies set status='open' where id=$1`, [study]);
  });
  const published = await rpc('get_public_study', [code]);
  assert.equal(published.version_number, 2);
  assert.notEqual(published.version_id, version);
  const old = (await db.query('select * from public.study_versions where id=$1', [version])).rows[0];
  assert.equal(old.questions[0].id, question);
  assert.equal(old.consent_text, form.consent_text);
  assert.equal((await db.query('select * from public.study_analyses where study_version_id=$1', [version])).rows.length, 1);
  await as('anon', null, () => assert.rejects(rpc('submit_study_version', [code, { [question]: 'New stale answer' }, version, true, randomUUID()]), /study has changed/));
  // A retry of an already accepted submission remains safe after publication changes.
  assert.equal(await as('anon', null, () => rpc('submit_study_version', [code, { [question]: 'Helpful feedback' }, version, true, requestId])), submission);
});

test('removing a collaborator immediately revokes reads and writes', async () => {
  await as('authenticated', owner, () => rpc('remove_study_member', [invitation]));
  await as('authenticated', researcher, async () => {
    assert.equal(await rpc('study_role', [study]), null);
    for (const table of ['studies', 'study_questions', 'study_versions', 'study_submissions', 'study_analyses', 'study_members']) {
      const key = table === 'studies' ? 'id' : 'study_id';
      assert.equal((await db.query(`select * from public.${table} where ${key}=$1`, [study])).rows.length, 0);
    }
    await assert.rejects(rpc('save_study_draft', [study, form, 1]), /permission/);
  });
});

test('Canvas-identified studies require verified server identity and reject anonymous bypass', async () => {
  const canvasStudy = await as('authenticated', owner, () => rpc('save_study_draft', [null, { ...form, participant_mode: 'canvas' }, 0]));
  await as('authenticated', owner, () => db.query(`update public.studies set status='open' where id=$1`, [canvasStudy]));
  const row = (await db.query('select share_code from public.studies where id=$1', [canvasStudy])).rows[0];
  const snapshot = await rpc('get_public_study', [row.share_code]);
  const answers = { [snapshot.questions[0].id]: 'Canvas answer' };
  await as('anon', null, () => assert.rejects(rpc('submit_study_version', [row.share_code, answers, snapshot.version_id, true, randomUUID()]), /identity does not match/));
  const token = 'c'.repeat(64);
  const current = await rpc('get_public_study', [code]);
  await as('service_role', null, async () => {
    await rpc('lti_create_handoff', ['a'.repeat(64), { source: 'canvas', name: 'Verified student' }]);
    await rpc('lti_exchange_handoff', ['a'.repeat(64), token]);
    await assert.rejects(rpc('submit_canvas_study_version', [row.share_code, answers, token, randomUUID(), snapshot.version_id, false]), /accept the study consent/);
    const id = await rpc('submit_canvas_study_version', [row.share_code, answers, token, randomUUID(), snapshot.version_id, true]);
    assert.ok(id);
    await assert.rejects(rpc('submit_canvas_study_version', [code, { [current.questions[0].id]: 'Identity leak' }, token, randomUUID(), current.version_id, true]), /identity does not match/);
  });
  const saved = (await db.query('select * from public.study_submissions where study_id=$1', [canvasStudy])).rows[0];
  assert.equal(saved.participant_data.name, 'Verified student');
  assert.ok(saved.consent_accepted_at);
});

test.after(async () => db.close());
