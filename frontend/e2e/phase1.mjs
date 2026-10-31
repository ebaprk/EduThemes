// Production-bundle walkthroughs using synthetic people and intercepted services.
// Database authorization is tested separately against disposable PostgreSQL.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const participantRoot = process.env.PARTICIPANT_PROJECT || path.resolve(root, '../EduThemes-Participant');
const output = path.resolve(root, 'frontend/test-results/phase1');
await mkdir(output, { recursive: true });
const owner = '10000000-0000-4000-8000-000000000001';
const studyId = '20000000-0000-4000-8000-000000000001';
const versionId = '30000000-0000-4000-8000-000000000001';
const questionId = '40000000-0000-4000-8000-000000000001';
const responseId = '50000000-0000-4000-8000-000000000001';
const code = 'ABCDEF123456';
const env = await readFile(path.join(root, 'frontend/.env.production'), 'utf8');
const supabaseUrl = env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim();
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const user = { id: owner, email: 'owner@ufl.edu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;

function fixture() {
  const study = { id: studyId, owner_id: owner, title: 'Advising experiences', description: 'Tell us about advising.', research_question: 'What helps students?',
    additional_context: '', consent_text: 'Participation is voluntary. You can leave before submitting. Contact the research team with questions.',
    participant_mode: 'anonymous', status: 'open', current_version_id: versionId, share_code: code, draft_revision: 2, created_at: '2026-10-28T12:00:00Z' };
  const questions = [{ id: questionId, position: 0, prompt: 'What helped you get advising?' }];
  const versions = [{ ...study, id: versionId, study_id: studyId, questions, version_number: 1, consent_required: true, published_at: '2026-10-28T12:00:00Z' }];
  return { study, questions, versions, role: 'owner', members: [], pending: [], calls: [], failSubmission: false,
    responses: [{ id: responseId, study_id: studyId, study_version_id: versionId, answers: { [questionId]: 'A clear appointment link helped.' }, participant_data: {}, consent_accepted_at: '2026-10-28T12:30:00Z' }],
    analyses: [{ study_id: studyId, study_version_id: versionId, question_id: questionId, owner_id: owner, revision: 1, stage: 'results', response_count: 1,
      labels: [{ name: 'Clear guidance', description: 'Knowing what to do next' }], results: { summary: 'Clear instructions helped.', themes: [{ name: 'Clear guidance', frequency: 1 }] },
      coded_responses: [{ original: 'A clear appointment link helped.', submission_id: responseId, study_version_id: versionId, question_id: questionId,
        themes: [{ name: 'Clear guidance' }], review_decisions: { 'Clear guidance': { action: 'approve', recorded_at: '2026-10-28T12:40:00Z' } } }] }],
  };
}
async function serve(directory) {
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let target = path.resolve(directory, `.${pathname}`);
      if (!target.startsWith(`${directory}${path.sep}`)) target = path.join(directory, 'index.html');
      let body;
      try { body = await readFile(target); } catch { target = path.join(directory, 'index.html'); body = await readFile(target); }
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(target)] || 'application/octet-stream');
      res.end(body);
    } catch { res.writeHead(500); res.end('Test asset unavailable'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const researcherServer = await serve(path.join(root, 'frontend/dist-researcher'));
const participantServer = await serve(path.join(participantRoot, 'dist'));
const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });

async function scenario(name, fn) {
  if (process.env.SCENARIO && !name.includes(process.env.SCENARIO)) return;
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const data = fixture();
  const errors = [];
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const request = route.request();
    const reply = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    const body = request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : null;
    if (url.pathname.startsWith('/auth/v1/')) return reply(user);
    const rpc = url.pathname.split('/rpc/')[1];
    if (rpc) {
      data.calls.push({ rpc, body });
      if (rpc === 'study_role') return reply(data.role);
      if (rpc === 'pending_study_invitations') return reply(data.pending);
      if (rpc === 'invite_study_member') { data.members.push({ id: 'invitation', study_id: studyId, email: body.p_email, role: body.p_role, created_at: '2026-10-28', accepted_at: null }); return reply('invitation'); }
      if (rpc === 'accept_study_invitation') { data.pending = []; data.role = 'researcher'; return reply(studyId); }
      if (rpc === 'remove_study_member') { data.members = []; return reply(null); }
      if (rpc === 'save_study_draft') { Object.assign(data.study, body.p_form); data.study.draft_revision += 1; data.questions = body.p_form.questions.map((prompt, position) => ({ id: questionId, prompt, position })); return reply(studyId); }
      if (rpc === 'save_study_analysis') {
        if (data.conflictOnSave) return reply({ code: 'PT409', message: 'Another researcher saved this analysis.' }, 409);
        const saved = { ...body.p_snapshot, revision: body.p_expected_revision + 1 };
        data.analyses = [saved]; return reply(saved.revision);
      }
      if (rpc === 'get_public_study' && data.loadDelay) await new Promise((resolve) => setTimeout(resolve, data.loadDelay));
      if (rpc === 'get_public_study') return reply({ ...data.versions[0], version_id: data.versions[0].id, ...{ participant_mode: data.study.participant_mode } });
      if (rpc === 'submit_study_version') {
        if (data.submitDelay) await new Promise((resolve) => setTimeout(resolve, data.submitDelay));
        if (data.failSubmission) return reply({ message: 'Connection interrupted. Please try again.', code: 'NETWORK_TEST' }, 503);
        return reply(responseId);
      }
      if (rpc === 'enroll_study') return reply(data.participantStudy);
      if (rpc === 'get_participant_study') return reply(data.participantStudy);
      if (rpc === 'start_study_activity') return reply(data.activityProgress);
      if (rpc === 'save_activity_draft') {
        if (data.saveDelay) await new Promise((resolve) => setTimeout(resolve, data.saveDelay));
        if (data.conflictOnDraft) return reply({ code: 'PT409', message: 'A newer saved draft exists.' }, 409);
        data.activityProgress.draft_answers = body.p_answers;
        data.activityProgress.revision += 1;
        return reply(data.activityProgress.revision);
      }
      if (rpc === 'submit_study_activity') {
        if (data.failSubmission) return reply({ message: 'Connection interrupted. Please try again.', code: 'NETWORK_TEST' }, 503);
        data.participantStudy.activities[0].status = 'completed';
        return reply(responseId);
      }
      if (rpc === 'get_study_receipt') return reply({ submission_id: responseId, title: data.study.title, version_id: versionId, version_number: 1,
        consent_text: data.study.consent_text, consent_accepted_at: '2026-10-28T12:30:00Z' });
      return reply({ message: `Unhandled test RPC: ${rpc}` }, 500);
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').at(-1);
      if (table === 'studies') {
        if (request.method() === 'PATCH') { Object.assign(data.study, body); return reply([{ id: studyId }]); }
        return reply(request.headers().accept?.includes('vnd.pgrst.object') ? data.study : [data.study]);
      }
      return reply(({ study_questions: data.questions, study_versions: data.versions, study_submissions: data.responses, study_analyses: data.analyses, study_members: data.members })[table] || []);
    }
    if (url.pathname === '/models') return reply({ models: { navigator: true } });
    if (url.pathname === '/session/start') return reply({ session_id: 'test-session' });
    if (url.pathname.endsWith('/upload-dataset')) return reply({ preprocessed_dataset: [{ original: 'A clear appointment link helped.', cleaned: 'A clear appointment link helped.', themes: [] }], predefined_themes: [], dataset_summary: { response_count: 1 } });
    if (url.pathname.startsWith('/session/')) return reply({ status: 'CREATED' });
    return route.abort();
  });
  try {
    const page = await context.newPage();
    await fn({ page, context, data });
    assert.deepEqual(errors, [], 'Browser errors');
    console.log(`PASS ${name}`);
  } catch (error) {
    for (const page of context.pages()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
async function signIn(context, sessionValues = {}) {
  await context.addInitScript(({ key, session, values }) => {
    localStorage.setItem(key, JSON.stringify(session));
    for (const [name, value] of Object.entries(values)) if (!sessionStorage.getItem(name)) sessionStorage.setItem(name, JSON.stringify(value));
  }, { key: storageKey, session: { access_token: token, refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }, values: sessionValues });
}

try {
  await scenario('participant portal matches the workspace and preserves private activity access', async ({ page, data }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(participantServer.url);
    await expect(page.getByRole('heading', { name: 'Join a study.' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Participant workspace' })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'participant-portal-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'participant-portal-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByLabel('Study code', { exact: true }).fill(code.toLowerCase());
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: data.study.title })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start study', exact: true })).toBeVisible();
    await expect(page.locator('.participant-sidebar')).not.toBeVisible();
    await page.getByRole('link', { name: 'EduThemes home', exact: true }).click();
    await page.getByRole('link', { name: 'My studies', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your next activity starts here' })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'participant-saved-studies-mobile.png'), fullPage: true, animations: 'disabled' });
    const key = 'b'.repeat(64);
    data.participantStudy = { ...data.versions[0], version_id: versionId, participant_reference: 'STUDY-DEMO', study_status: 'open', reward_status: 'not_recorded', activities: [
      { id: 'baseline', title: 'Classroom reflections', required: true, status: 'available', opens_at: '2026-10-28T12:00:00Z', questions: data.questions },
      { id: 'followup', title: 'Follow-up reflection', required: true, status: 'blocked', opens_at: '2026-11-04T12:00:00Z', questions: data.questions },
    ] };
    data.activityProgress = { draft_answers: {}, revision: 0 };
    await page.getByLabel('Private return link or study key').fill(`${participantServer.url}/my-studies#access=${key}`);
    await page.getByRole('button', { name: 'Open my study', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your study progress', exact: true })).toBeVisible();
    assert.equal((await page.textContent('body')).includes(key), false);
    assert.equal(page.url().includes(key), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'participant-hub-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await page.getByRole('button', { name: 'Open activities', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your study progress', exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(output, 'participant-hub-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Start activity', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Classroom reflections', exact: true })).toBeVisible();
    await expect(page.locator('.participant-sidebar')).not.toBeVisible();
  });
  await scenario('owner can invite collaborators, inspect published consent, and trace theme evidence', async ({ page, context, data }) => {
    await signIn(context);
    await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await expect(page.getByRole('heading', { name: 'Advising experiences' })).toBeVisible();
    await page.getByText('View published questions and consent').click();
    await expect(page.getByText(data.study.consent_text, { exact: true })).toBeVisible();
    await page.getByText('Clear guidance · 1 of 1 coded responses').click();
    await expect(page.getByText('Classification accepted', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'View original response and consent record' }).click();
    await expect(page.locator(`#response-${responseId}`)).toBeVisible();
    await page.getByLabel('Collaborator email').fill('colleague@ufl.edu');
    await page.getByRole('button', { name: 'Create invitation' }).click();
    await expect(page.getByText('colleague@ufl.edu', { exact: true })).toBeVisible();
    assert.equal(data.calls.find((call) => call.rpc === 'invite_study_member').body.p_role, 'researcher');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(output, 'researcher-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByLabel('Collaborator email').scrollIntoViewIfNeeded();
    await expect(page.getByLabel('Collaborator email')).toBeInViewport();
    await page.screenshot({ path: path.join(output, 'researcher-mobile.png'), animations: 'disabled' });
  });
  await scenario('reviewers cannot edit, invite, change publication, or launch coding', async ({ page, context, data }) => {
    data.role = 'reviewer'; await signIn(context);
    await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await expect(page.getByText('You have read-only access to this study.')).toBeVisible();
    for (const name of ['Close study', 'Create invitation', 'Start coding', 'Analyze current responses', 'Edit draft']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download responses and consent records' })).toBeVisible();
  });
  await scenario('draft editor saves consent and an explicit identity mode together', async ({ page, context, data }) => {
    data.study.status = 'draft'; data.study.current_version_id = null; data.versions = []; data.analyses = [];
    data.study.consent_text = ''; await signIn(context);
    await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await expect(page.getByRole('button', { name: 'Publish study', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Edit draft' }).click();
    await page.getByLabel('Participant consent text').fill('You may choose whether to participate. Contact the team with questions.');
    await page.getByLabel('Participant identity', { exact: true }).selectOption('anonymous');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('button', { name: 'Publish study', exact: true })).toBeEnabled();
    const saved = data.calls.find((call) => call.rpc === 'save_study_draft').body;
    assert.equal(saved.p_expected_revision, 2); assert.equal(saved.p_form.questions[0], data.questions[0].prompt);
  });
  await scenario('invited collaborators can accept before opening study data', async ({ page, context, data }) => {
    data.pending = [{ id: 'invitation', study_id: studyId, title: data.study.title, role: 'researcher' }];
    await signIn(context); await page.goto(`${researcherServer.url}/?invitation=invitation`);
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page).toHaveURL(`${researcherServer.url}/studies/${studyId}`);
    await expect(page.getByText('Your access:', { exact: false })).toContainText('researcher');
  });
  await scenario('study analysis saves source IDs, version IDs, and the expected revision', async ({ page, context, data }) => {
    data.analyses = []; await signIn(context); await page.goto(`${researcherServer.url}/studies/${studyId}`);
    await page.getByRole('button', { name: 'Start coding', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Shape the themes in your data' })).toBeVisible();
    await expect(page.getByText('Study progress saved', { exact: true })).toBeVisible();
    const saved = data.calls.find((call) => call.rpc === 'save_study_analysis').body;
    assert.equal(saved.p_snapshot.study_version_id, versionId);
    assert.equal(saved.p_snapshot.coded_responses[0].submission_id, responseId);
    assert.equal(saved.p_expected_revision, 0);
  });
  await scenario('participant consent is explicit, drafts recover after reload, and retries keep one ID', async ({ page, data }) => {
    await page.goto(`${participantServer.url}/join/${code}`);
    await page.getByRole('button', { name: 'Start study' }).click();
    await expect(page.getByRole('heading', { name: 'Before you take part' })).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeDisabled();
    await page.screenshot({ path: path.join(output, 'participant-consent.png'), fullPage: true });
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await page.getByRole('textbox').fill('A clear appointment link helped.');
    await page.reload();
    await page.getByRole('button', { name: 'Start study' }).click();
    await expect(page.getByRole('button', { name: 'Agree and continue' })).toBeDisabled();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('A clear appointment link helped.');
    await page.getByRole('button', { name: 'Review answers' }).click();
    data.failSubmission = true; await page.getByRole('button', { name: 'Submit responses' }).click();
    await expect(page.getByRole('alert')).toContainText('Connection interrupted');
    data.failSubmission = false; await page.getByRole('button', { name: 'Submit responses' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
    const submissions = data.calls.filter((call) => call.rpc === 'submit_study_version');
    assert.equal(submissions.length, 2); assert.equal(submissions[0].body.p_request_id, submissions[1].body.p_request_id);
    assert.equal(submissions[0].body.p_consent_accepted, true);
    assert.equal(submissions[0].body.p_version_id, versionId);
    await expect(page.getByRole('button', { name: 'Download study receipt' })).toBeVisible();
    await page.reload(); await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
  });
  await scenario('participant slides validate one answer, support keyboard navigation, and review without submitting early', async ({ page, data }) => {
    data.loadDelay = 350; data.submitDelay = 500;
    data.questions.push({ id: 'question-two', prompt: 'What would make that experience better?', position: 1 });
    data.questions.push({ id: 'question-three', prompt: 'Is there anything else you would like the research team to understand about getting help and finding the information you need?', position: 2 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${participantServer.url}/join/${code}`);
    await expect(page.getByRole('status')).toContainText('Loading your study');
    await expect(page.getByRole('heading', { name: 'Study unavailable' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Start study' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: data.questions[0].prompt })).toBeFocused();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Please add your answer');
    await page.getByRole('textbox').fill('   ');
    await page.getByRole('textbox').press('Control+Enter');
    await expect(page.getByRole('heading', { name: data.questions[0].prompt })).toBeVisible();
    await page.getByRole('textbox').fill('Clear guidance');
    await page.getByRole('textbox').press('End');
    await page.getByRole('textbox').press('Enter');
    await page.getByRole('textbox').pressSequentially('and a helpful advisor.');
    await expect(page.getByRole('textbox')).toHaveValue('Clear guidance\nand a helpful advisor.');
    await page.getByRole('textbox').press('Control+Enter');
    await expect(page.getByRole('heading', { name: data.questions[1].prompt })).toBeFocused();
    await expect(page.getByRole('textbox')).toHaveValue('');
    await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
    await page.getByRole('textbox').fill('An easier way to book.');
    await page.getByRole('button', { name: 'Previous question' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('Clear guidance\nand a helpful advisor.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('textbox')).toHaveValue('An easier way to book.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('textbox').fill('Please keep the directions simple.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await expect(page.getByRole('button', { name: 'Review answers' })).toBeInViewport();
    await page.screenshot({ path: path.join(output, 'participant-slide-mobile.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('button', { name: 'Review answers' })).toBeInViewport();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: path.join(output, 'participant-slide-desktop.png'), animations: 'disabled' });
    await page.getByRole('textbox').press('Meta+Enter');
    await expect(page.getByRole('heading', { name: 'Ready when you are.' })).toBeFocused();
    await page.getByRole('button', { name: 'Edit answer 1', exact: true }).press('Control+Enter');
    assert.equal(data.calls.filter((call) => call.rpc === 'submit_study_version').length, 0);
    await page.getByRole('button', { name: 'Edit answer 1', exact: true }).click();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await page.getByRole('textbox').fill('Updated first answer.');
    await page.getByRole('button', { name: 'Back to review' }).click();
    await expect(page.getByText('Updated first answer.', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'participant-review-desktop.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Submit responses' }).click();
    await expect(page.getByRole('button', { name: 'Submitting…' })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('Updated first answer.', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
    assert.deepEqual(data.calls.find((call) => call.rpc === 'submit_study_version').body.p_answers, {
      [questionId]: 'Updated first answer.', 'question-two': 'An easier way to book.', 'question-three': 'Please keep the directions simple.',
    });
  });
  await scenario('participant multi-activity slides keep consent, drafts, retries, and completion intact', async ({ page, data }) => {
    const activities = [
      { id: 'baseline', title: 'Baseline reflection', required: true, status: 'available', opens_after_days: 0,
        questions: [{ id: questionId, prompt: data.questions[0].prompt }, { id: 'followup-question', prompt: 'What could improve?' }] },
      { id: 'followup', title: 'Follow-up', required: true, status: 'blocked', opens_after_days: 1, questions: [{ id: 'later-question', prompt: 'What changed?' }] },
    ];
    data.versions[0].activities = activities;
    data.participantStudy = { ...data.versions[0], version_id: versionId, activities, participant_reference: 'STUDY-TEST', study_status: 'open', reward_status: 'not_recorded' };
    data.activityProgress = { draft_answers: {}, revision: 0 };
    data.saveDelay = 350;
    await page.goto(`${participantServer.url}/join/${code}`);
    await page.getByRole('button', { name: 'Review study consent' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('button', { name: 'Join and open my activities' })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I agree that my responses and progress', exact: false }).check();
    await page.getByRole('button', { name: 'Join and open my activities' }).click();
    const enrollment = data.calls.find((call) => call.rpc === 'enroll_study').body;
    assert.equal(enrollment.p_consent_accepted, true); assert.equal(enrollment.p_linking_accepted, true);
    await page.getByRole('button', { name: 'Start activity' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await page.getByRole('textbox').fill('My baseline draft.');
    await expect.poll(() => data.calls.filter((call) => call.rpc === 'save_activity_draft').length).toBeGreaterThan(0);
    await expect(page.getByRole('textbox')).toBeEnabled();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('textbox').fill('More accessible booking.');
    await page.getByRole('button', { name: 'Back to activities', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your study progress' })).toBeVisible();
    assert.equal(data.activityProgress.draft_answers['followup-question'], 'More accessible booking.');
    await page.getByRole('button', { name: 'Start activity' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('More accessible booking.');
    await page.getByRole('button', { name: 'Review answers' }).click();
    data.failSubmission = true; await page.getByRole('button', { name: 'Submit this activity' }).click();
    await expect(page.getByRole('alert')).toContainText('Connection interrupted');
    await expect(page.getByText('My baseline draft.', { exact: true })).toBeVisible();
    data.failSubmission = false; await page.getByRole('button', { name: 'Submit this activity' }).click();
    await expect(page.getByText('Activity submitted.', { exact: false })).toBeVisible();
    const submissions = data.calls.filter((call) => call.rpc === 'submit_study_activity');
    assert.equal(submissions.length, 2); assert.equal(submissions[0].body.p_request_id, submissions[1].body.p_request_id);
    assert.deepEqual(submissions[1].body.p_answers, { [questionId]: 'My baseline draft.', 'followup-question': 'More accessible booking.' });
  });
  await scenario('participant slide drafts preserve older copies and block overwriting a newer server draft', async ({ page, context, data }) => {
    const key = 'a'.repeat(64);
    const activities = [{ id: 'conflict-activity', title: 'Draft recovery', required: true, status: 'available', questions: data.questions }];
    data.participantStudy = { ...data.versions[0], version_id: versionId, activities, participant_reference: 'STUDY-TEST', study_status: 'open', reward_status: 'not_recorded' };
    data.activityProgress = { draft_answers: { [questionId]: 'Latest saved answer.' }, revision: 3 };
    await context.addInitScript(({ name, question }) => {
      sessionStorage.setItem(name, JSON.stringify({ answers: { [question]: 'Older unsaved answer.' }, base_revision: 1 }));
    }, { name: `eduthemes.activity-draft.${key.slice(-16)}.conflict-activity`, question: questionId });
    await page.goto(`${participantServer.url}/my-studies#access=${key}`);
    await page.getByRole('button', { name: 'Start activity' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('textbox')).toHaveValue('Latest saved answer.');
    await expect(page.getByRole('textbox')).toBeDisabled();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download the older copy' }).click();
    const download = await downloading;
    const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.equal(backup.answers[questionId], 'Older unsaved answer.');
    await page.getByRole('button', { name: 'Continue with the saved draft' }).click();
    data.conflictOnDraft = true;
    await page.getByRole('textbox').fill('Keep this local edit.');
    await expect(page.getByRole('alert')).toContainText('A newer saved draft exists.');
    await expect(page.getByRole('textbox')).toHaveValue('Keep this local edit.');
    await expect(page.getByRole('button', { name: 'Review answers' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Download unfinished answers' })).toBeVisible();
    await page.getByRole('button', { name: 'Return to saved activities', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your study progress' })).toBeVisible();
    assert.equal(data.activityProgress.draft_answers[questionId], 'Latest saved answer.');
  });
  await scenario('accepted coding decisions recover after a browser reload', async ({ page, context, data }) => {
    const dataset = [{ original: 'A clear appointment link helped.', submission_id: responseId, study_version_id: versionId, question_id: questionId, themes: [] }];
    await signIn(context, {
      'eduthemes.sessionId': 'test-session', 'eduthemes.dataset': dataset,
      'eduthemes.labels': [{ name: 'Clear guidance', description: 'Knowing what to do next' }],
      'eduthemes.claudeData': { 'Clear guidance': [0], Unclassified: [] },
      'eduthemes.analysisSource': { studyId, questionId, versionId, ownerId: owner, actorId: owner, runId: 'test-session', revision: 1, title: data.study.title, prompt: data.questions[0].prompt },
    });
    await page.goto(`${researcherServer.url}/review`);
    await page.getByRole('button', { name: 'Accept response 1', exact: true }).click();
    await expect(page.locator('.review-response-card.is-approved')).toHaveCount(1);
    await expect(page.getByText('Study progress saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.review-response-card.is-approved')).toHaveCount(1);
    assert.equal(data.analyses[0].coded_responses[0].review_decisions['Clear guidance'].action, 'approve');
  });
  await scenario('participant Canvas studies cannot submit with anonymous identity', async ({ page, data }) => {
    data.study.participant_mode = 'canvas';
    await page.goto(`${participantServer.url}/join/${code}`);
    await page.getByRole('button', { name: 'Start study' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByRole('alert')).toContainText('requires verified Canvas details');
    await expect(page.getByRole('button', { name: 'Continue to questions' })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  });
  await scenario('participant blocked browser storage still permits anonymous submission and receipt download', async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { value: {
        getItem() { throw new Error('Storage denied'); }, setItem() { throw new Error('Storage denied'); }, removeItem() { throw new Error('Storage denied'); },
      } });
    });
    await page.goto(`${participantServer.url}/join/${code}`);
    await page.getByRole('button', { name: 'Start study' }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Agree and continue' }).click();
    await expect(page.getByText('This browser cannot save your draft.', { exact: false })).toBeVisible();
    await page.getByRole('textbox').fill('My response is preserved until submission.');
    await page.getByRole('button', { name: 'Review answers' }).click();
    await page.getByRole('button', { name: 'Submit responses' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download study receipt' })).toBeVisible();
  });
  await scenario('conflicting analysis saves remain visible and local coding can be downloaded', async ({ page, context, data }) => {
    data.conflictOnSave = true;
    await signIn(context, {
      'eduthemes.sessionId': 'conflict-session', 'eduthemes.dataset': [{ original: 'A clear appointment link helped.', themes: [] }],
      'eduthemes.labels': [{ name: 'Clear guidance' }], 'eduthemes.claudeData': { 'Clear guidance': [0], Unclassified: [] },
      'eduthemes.analysisSource': { studyId, questionId, versionId, ownerId: owner, actorId: owner, runId: 'conflict-session', revision: 1, title: data.study.title, prompt: data.questions[0].prompt },
    });
    await page.goto(`${researcherServer.url}/review`);
    await expect(page.getByText('Could not save study progress:', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Accept response 1', exact: true }).click();
    await expect(page.locator('.review-response-card.is-approved')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Download current coding' })).toBeVisible();
    await expect(page.getByText('Could not save study progress:', { exact: false })).toBeVisible();
  });
} finally {
  await browser.close();
  await Promise.all([new Promise((resolve) => researcherServer.server.close(resolve)), new Promise((resolve) => participantServer.server.close(resolve))]);
}
