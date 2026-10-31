// Research workspace interactions against a production build and synthetic services.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(frontend, 'test-results/research-ui');
await mkdir(output, { recursive: true });
const env = await readFile(path.join(frontend, '.env.production'), 'utf8');
const supabaseUrl = env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim();
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'alex@university.edu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: 'Alex Morgan' } };
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;
const studies = [
  { id: '20000000-0000-4000-8000-000000000001', title: 'Student belonging in the classroom', status: 'open', created_at: '2026-10-28T12:00:00Z', owner_id: user.id, share_code: 'BELONG' },
  { id: '20000000-0000-4000-8000-000000000002', title: 'Learning with generative AI', status: 'draft', created_at: '2026-10-25T12:00:00Z', owner_id: user.id, share_code: 'LEARN' },
  { id: '20000000-0000-4000-8000-000000000003', title: 'Reflections on peer feedback', status: 'closed', created_at: '2026-10-20T12:00:00Z', owner_id: 'another-researcher', share_code: 'REFLECT' },
  { id: '20000000-0000-4000-8000-000000000004', title: 'First-year advising experiences', status: 'open', created_at: '2026-10-15T12:00:00Z', owner_id: user.id, share_code: 'ADVISING' },
];
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const directory = path.join(frontend, 'dist-researcher');
  let target = path.resolve(directory, `.${pathname}`);
  if (!target.startsWith(`${directory}${path.sep}`)) target = path.join(directory, 'index.html');
  let body;
  try { body = await readFile(target); } catch { target = path.join(directory, 'index.html'); body = await readFile(target); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[path.extname(target)] || 'application/octet-stream');
  res.end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });

async function scenario(name, run, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const state = { studies: structuredClone(studies), delay: 0, fail: false, calls: [], ...options };
  const errors = [];
  if (!options.signedOut) await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey, session: { access_token: token, refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user } });
  await context.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/token')) return reply({ error: 'invalid_grant', error_description: 'Email or password is incorrect.' }, 400);
      return reply(user);
    }
    const rpc = url.pathname.split('/rpc/')[1];
    if (rpc) {
      const body = request.postDataJSON(); state.calls.push({ rpc, body });
      if (rpc === 'pending_study_invitations') return reply([]);
      if (rpc === 'study_role') return reply('owner');
      if (rpc === 'get_study_operations') return reply({ recruitment_target: 40, coordinator_notes: '', revision: 0, participants: [], unlinked_responses: 0 });
      if (rpc === 'save_study_draft') { state.saved = body; state.studies.push({ ...studies[1], ...body.p_form }); return reply(studies[1].id); }
      return reply(null);
    }
    if (url.pathname === '/rest/v1/studies') {
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (state.fail) return reply({ message: 'The connection was interrupted.' }, 503);
      if (request.headers().accept?.includes('vnd.pgrst.object')) {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        return reply({ ...state.studies.find((study) => study.id === id), description: '', research_question: 'What helps students learn?', consent_text: '', participant_mode: 'anonymous', draft_revision: 1, current_version_id: null });
      }
      return reply(state.studies);
    }
    if (url.pathname.startsWith('/rest/v1/')) return reply([]);
    if (url.pathname === '/models') return reply({ models: { navigator: true } });
    if (url.pathname.startsWith('/session/')) return reply({ status: 'CREATED' });
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await run(page, state);
    assert.deepEqual(errors, [], 'No browser errors');
    console.log(`PASS ${name}`);
  } catch (error) { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); throw error; }
  finally { await context.close(); }
}

try {
  await scenario('study library supports live counts, search, filters, sorting, and both layouts', async (page) => {
    await page.goto(baseUrl);
    await expect(page.locator('.study-list-card')).toHaveCount(4);
    await expect(page.getByText('YOUR RESEARCH, IN ONE PLACE', { exact: true })).toHaveCount(0);
    await expect(page.locator('.dashboard-metric').first()).toContainText('04');
    await page.screenshot({ path: path.join(output, 'dashboard-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Collecting', exact: true }).click();
    await expect(page.locator('.study-list-card')).toHaveCount(2);
    await expect(page).toHaveURL(/status=open/);
    await page.getByLabel('Search studies').fill('advising');
    await expect(page.locator('.study-list-card')).toHaveCount(1);
    await page.getByLabel('Clear search').click();
    await page.getByRole('button', { name: 'Drafts', exact: true }).click();
    await expect(page.locator('.study-list-card')).toHaveCount(1);
    await expect(page.locator('.study-list-card')).toContainText('Learning with generative AI');
    await page.getByRole('button', { name: 'All studies 4', exact: true }).click();
    await page.getByLabel('Sort studies').selectOption('name');
    await expect(page.locator('.study-list-card').first()).toContainText('First-year advising');
    await page.getByLabel('List view', { exact: true }).click();
    await expect(page.locator('.study-library-table tbody tr')).toHaveCount(4);
    await page.getByLabel('Sort studies').selectOption('oldest');
    await expect(page.locator('.study-library-table tbody tr').first()).toContainText('First-year advising');
    await page.getByLabel('Search studies').fill('no matching title');
    await expect(page.getByRole('heading', { name: 'No matching studies' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('.study-library-table tbody tr')).toHaveCount(4);
    await page.getByRole('link', { name: 'Drafts', exact: true }).click();
    await expect(page.locator('.study-library-table tbody tr')).toHaveCount(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Drafts', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.study-list-card')).toHaveCount(1);
  });
  await scenario('mobile navigation traps focus, restores focus, closes on navigation, and fits small screens', async (page) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(baseUrl);
    await expect(page.locator('.study-list-card')).toHaveCount(4);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'dashboard-mobile.png'), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'EduThemes home' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(drawer.getByRole('link', { name: 'Help & documentation' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawer.getByRole('link', { name: 'EduThemes home' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Drafts', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.study-list-card')).toHaveCount(1);
    await page.setViewportSize({ width: 320, height: 650 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
  await scenario('loading uses content skeletons without flashing empty studies', async (page) => {
    await page.goto(baseUrl);
    await expect(page.getByText('Loading studies…', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your next question belongs here' })).toHaveCount(0);
    await expect(page.locator('.study-list-card')).toHaveCount(4);
  }, { delay: 600 });
  await scenario('researcher setup shows all sections together and saves directly', async (page, state) => {
    await page.goto(baseUrl);
    await expect(page.getByRole('heading', { name: 'Your next question belongs here' })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'dashboard-empty.png'), fullPage: true });
    await page.getByRole('button', { name: 'Create your first study' }).click();
    await expect(page.getByRole('heading', { name: 'Create study', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Study library', exact: false })).toHaveCount(0);
    for (const name of ['Study title', 'Research question', 'Participant consent text', 'Question 1']) {
      await expect(page.getByLabel(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
    await expect(page.getByRole('progressbar', { name: 'Study setup progress' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('study title');
    await expect(page.getByLabel('Study title', { exact: true })).toBeFocused();
    await page.getByLabel('Study title', { exact: true }).fill('Understanding student confidence');
    await page.getByLabel('Research question', { exact: true }).fill('What builds confidence?');
    await page.getByLabel('Participant introduction', { exact: true }).fill('Tell us about your classroom experiences.');
    await page.getByLabel('Participant identity', { exact: true }).selectOption('anonymous');
    await page.getByLabel('Participant consent text').fill('Participation is voluntary.');
    await page.getByLabel('Question 1', { exact: true }).fill('What helped you feel confident?');
    await page.getByRole('navigation', { name: 'Study setup sections' }).getByRole('link', { name: 'Study design', exact: true }).click();
    await expect(page.getByLabel('Study title', { exact: true })).toHaveValue('Understanding student confidence');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(output, 'study-form-desktop.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('navigation', { name: 'Study setup sections' }).getByRole('link', { name: 'Participation', exact: true }).click();
    await expect(page.getByLabel('Participant consent text')).toHaveValue('Participation is voluntary.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'study-form-mobile.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(studies[1].id));
    assert.equal(state.saved.p_form.title, 'Understanding student confidence');
    assert.equal(state.saved.p_form.consent_text, 'Participation is voluntary.');
    assert.equal(state.saved.p_form.description, 'Tell us about your classroom experiences.');
    assert.equal(state.saved.p_form.questions[0], 'What helped you feel confident?');
  }, { studies: [] });
  await scenario('single-page setup preserves multiple activities and validates before saving', async (page, state) => {
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Create study', exact: true }).click();
    await page.getByLabel('Question 1', { exact: true }).fill('What helped you get started?');
    await page.getByRole('button', { name: /Add question$/ }).click();
    await page.getByLabel('Question 2', { exact: true }).fill('What would you improve?');
    await page.getByRole('button', { name: /Add activity$/ }).click();
    await page.getByLabel('Activity 2 title', { exact: true }).fill('Follow-up reflection');
    const followup = page.getByRole('group', { name: 'Activity 2', exact: true });
    await followup.getByLabel('Opens on day after joining', { exact: true }).fill('3');
    await followup.getByLabel('Due on day after joining', { exact: false }).fill('7');
    await page.getByLabel('Activity 2 · Question 1', { exact: true }).fill('What changed since the first activity?');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('study title');
    assert.equal(state.saved, undefined);
    await page.getByLabel('Study title', { exact: true }).fill('Learning over time');
    await page.getByLabel('Research question', { exact: true }).fill('How does learning develop?');
    await expect(page.getByLabel('Participant identity', { exact: true }).locator('option[value="canvas"]')).toBeDisabled();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(studies[1].id));
    assert.equal(state.saved.p_form.activities.length, 2);
    assert.deepEqual(state.saved.p_form.activities[0].questions, ['What helped you get started?', 'What would you improve?']);
    assert.equal(state.saved.p_form.activities[0].opens_after_days, 0);
    assert.equal(state.saved.p_form.activities[1].opens_after_days, 3);
    assert.equal(state.saved.p_form.activities[1].due_after_days, 7);
    assert.equal(state.saved.p_form.activities[1].questions[0], 'What changed since the first activity?');
    assert.equal(state.saved.p_form.consent_text, '');
  });
  await scenario('failed library requests show an error and can recover', async (page, state) => {
    await page.goto(baseUrl);
    await expect(page.getByRole('heading', { name: "We couldn't load your studies" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: 'Your next question belongs here' })).toHaveCount(0);
    state.fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('.study-list-card')).toHaveCount(4);
  }, { fail: true });
  await scenario('sidebar collapse retains named navigation and restores the workspace', async (page) => {
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.locator('.workspace-sidebar')).toHaveAttribute('data-collapsed', 'true');
    await expect(page.getByRole('link', { name: 'Drafts', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Drafts', exact: true }).click();
    await expect(page.locator('.study-list-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(page.locator('.workspace-sidebar')).toHaveAttribute('data-collapsed', 'false');
    await page.getByRole('link', { name: 'File analysis', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your analysis workspace' })).toBeVisible();
    await expect(page.locator('.sidebar-link[aria-current="page"]')).toHaveAttribute('href', '/analysis');
    await page.screenshot({ path: path.join(output, 'analysis-start.png'), fullPage: true, animations: 'disabled' });
  });
  await scenario('sign-in and account creation keep entered values and communicate failures', async (page) => {
    await page.goto(baseUrl);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'sign-in-desktop.png'), fullPage: true });
    await page.getByLabel('Email address').fill('alex@university.edu');
    await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'A fresh start for your research' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveValue('alex@university.edu');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Email or password is incorrect.');
    await expect(page.getByLabel('Email address')).toHaveValue('alex@university.edu');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('synthetic-password');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, 'sign-in-mobile.png'), fullPage: true });
  }, { signedOut: true });
  await scenario('coding, review, and results remain usable at desktop and phone widths', async (page) => {
    await page.addInitScript(() => {
      const values = {
        'eduthemes.sessionId': 'ui-preview-session',
        'eduthemes.dataset': [
          { original: 'Working with a small group helped me feel that I belonged in the classroom.', cleaned: 'Working with a small group helped me feel that I belonged in the classroom.', themes: [{ name: 'Connection' }] },
          { original: 'Having time to ask questions gave me confidence to try something new.', cleaned: 'Having time to ask questions gave me confidence to try something new.', themes: [{ name: 'Confidence' }] },
          { original: 'My classmates helped me find the resources I needed.', cleaned: 'My classmates helped me find the resources I needed.', themes: [{ name: 'Connection' }] },
        ],
        'eduthemes.labels': [{ name: 'Connection', description: 'Relationships and a sense of belonging.', color: '#6d8b75' }, { name: 'Confidence', description: 'Feeling ready to participate and learn.', color: '#b87957' }],
        'eduthemes.claudeData': { Connection: [0, 2], Confidence: [1], Unclassified: [] },
        'eduthemes.results': { summary: '## Understanding student belonging\n\nParticipants described how peer relationships and opportunities to ask questions supported their learning.\n\n### Connection\n\nWorking together helped participants feel included and find the support they needed.\n\n### Confidence\n\nA space for questions helped participants try new approaches.', themes: [{ name: 'Connection', frequency: 2, color: '#6d8b75' }, { name: 'Confidence', frequency: 1, color: '#b87957' }] },
        'eduthemes.projectMetadata': { researchQuestion: 'What helps students feel they belong?', projectDescription: 'Student reflections on classroom experiences.', additionalContext: '', apiKey: 'navigator' },
      };
      for (const [key, value] of Object.entries(values)) sessionStorage.setItem(key, JSON.stringify(value));
    });
    for (const [route, heading] of [['code', 'Shape the themes in your data'], ['review', 'Review every classification with confidence'], ['results', 'Your themes, clearly summarized']]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(`${baseUrl}/${route}`);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await page.screenshot({ path: path.join(output, `${route}-desktop.png`), fullPage: true, animations: 'disabled' });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${route} fits a phone`);
      await page.screenshot({ path: path.join(output, `${route}-mobile.png`), fullPage: true, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('tab', { name: 'Visualizations' }).click();
    await expect(page.getByText('Theme Distribution', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, 'results-charts.png'), fullPage: true, animations: 'disabled' });
  });
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
