// Check actual rendered motion while synthetic requests remain pending.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const live = process.env.LIVE === '1';
const origins = live ? ['https://eduthemes-abepark.web.app', 'https://eduthemes-participant-abepark.web.app'] : ['https://researcher.local', 'https://participant.local'];
const builds = [path.join(root, 'frontend/dist-researcher'), path.resolve(root, '../EduThemes-Participant/dist')];
const output = path.join(root, 'outputs/loading-indicators-2026-11-20', live ? 'live' : 'local');
await mkdir(output, { recursive: true });
const env = await readFile(path.join(root, 'frontend/.env.production'), 'utf8');
const storageKey = `sb-${new URL(env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim()).hostname.split('.')[0]}-auth-token`;
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'test@example.edu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.synthetic`;
const source = { studyId: '20000000-0000-4000-8000-000000000001', versionId: '30000000-0000-4000-8000-000000000001', questionId: '40000000-0000-4000-8000-000000000001', actorId: user.id, ownerId: user.id, runId: 'loading-test', revision: 1, title: 'Advising experiences', prompt: 'What helped you?', studySnapshot: { source_type: 'participant' } };
const labels = [{ name: 'Planning', description: 'Clear next steps', color: '#176b52' }];
const dataset = [{ original: 'My advisor explained the next steps.', cleaned: 'My advisor explained the next steps.', themes: labels }, { original: 'I received encouragement.', cleaned: 'I received encouragement.', themes: [] }];
const study = { title: 'Advising experiences', description: 'Tell us about advising.', version_id: source.versionId, version_number: 1, participant_mode: 'anonymous', status: 'open', consent_required: true, consent_text: 'Participation is voluntary.', activities: [], questions: [{ id: 'q1', prompt: 'What helped you?' }] };
const submission = '50000000-0000-4000-8000-000000000001';
const results = [];
const errors = [];
const browser = await chromium.launch({ channel: 'chrome' });
function gate() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }

async function motion(locator, reduced, surface = false) {
  await expect(locator).toBeVisible();
  const frames = await locator.evaluate(async (element, surface) => {
    const frame = () => ({
      running: element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
      visual: surface ? getComputedStyle(element, '::after').transform : [...element.querySelectorAll('.ui-skeleton__dot')].map(dot => `${getComputedStyle(dot).transform}:${getComputedStyle(dot).opacity}`).join('|')
    });
    const first = frame();
    await new Promise(resolve => setTimeout(resolve, 220));
    return [first, frame()];
  }, surface);
  if (reduced) {
    assert.equal(frames[0].running, 0);
    assert.equal(frames[0].visual, frames[1].visual);
  } else {
    assert.ok(frames[0].running > 0, 'Loading indicator has a running animation');
    assert.notEqual(frames[0].visual, frames[1].visual, 'Rendered loading indicator visibly changes between frames');
  }
  return frames;
}

async function setup(app, width, reduced) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const waits = { library: gate(), checking: gate(), suggestions: gate(), study: gate(), submission: gate() };
  if (app === 0) await context.addInitScript(({ storageKey, token, user, source, labels, dataset }) => {
    localStorage.setItem(storageKey, JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now()/1000)+3600, user }));
    for (const [key, value] of Object.entries({ sessionId: 'loading-test', dataset, labels, analysisSource: source, projectMetadata: { researchQuestion: 'What helped you?', projectDescription: 'Synthetic animation check', apiKey: 'navigator' } })) sessionStorage.setItem(`eduthemes.${key}`, JSON.stringify(value));
  }, { storageKey, token, user, source, labels, dataset });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origins[app] && request.method() === 'GET' && ['document', 'script', 'stylesheet', 'image', 'font', 'manifest'].includes(request.resourceType())) {
      if (live) return route.continue();
      const file = path.extname(url.pathname) ? url.pathname.slice(1) : 'index.html';
      const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' }[path.extname(file)];
      return route.fulfill({ body: await readFile(path.join(builds[app], file)), contentType });
    }
    const reply = json => route.fulfill({ json });
    if (url.pathname.startsWith('/auth/v1/')) return reply(user);
    const rpc = url.pathname.split('/rpc/')[1];
    if (rpc === 'pending_study_invitations') return reply([]);
    if (rpc === 'study_role') return reply('owner');
    if (rpc === 'save_study_analysis') return reply(request.postDataJSON().p_expected_revision + 1);
    if (rpc === 'analysis_job') { await waits.checking.promise; return reply(null); }
    if (rpc === 'get_public_study') { await waits.study.promise; return reply(study); }
    if (rpc === 'submit_study_version') { await waits.submission.promise; return reply(submission); }
    if (rpc === 'get_study_receipt') return reply({ submission_id: submission, title: study.title, version_number: 1, consent_accepted_at: '2026-11-21T01:16:03Z' });
    if (url.pathname === '/rest/v1/studies') { await waits.library.promise; return reply([]); }
    if (url.pathname.startsWith('/rest/v1/')) return reply([]);
    if (url.pathname === '/models') return reply({ models: { navigator: true }, background_analysis: true });
    if (url.pathname.endsWith('/suggest-themes')) { await waits.suggestions.promise; return reply({ suggested_themes: [{ name: 'Support', description: 'Encouragement from others' }] }); }
    if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, waits, page };
}

try {
  for (const [width, reduced] of [[1440, false], [390, false], [320, false], [1440, true]]) {
    for (const app of [0, 1]) {
      const { context, waits, page } = await setup(app, width, reduced);
      const name = `${app === 0 ? 'researcher' : 'participant'}-${width}-${reduced ? 'reduced' : 'animated'}`;
      const checked = { name, frames: {} };
      try {
        if (app === 0) {
          await page.goto(origins[app]);
          const loading = page.getByRole('status').filter({ hasText: 'Loading studies…' });
          await expect(loading).toBeVisible();
          await expect(page.getByRole('heading', { name: 'No studies yet' })).toHaveCount(0);
          checked.frames.cards = await motion(loading.locator('[data-variant="surface"]').first(), reduced, true);
          await page.screenshot({ path: `${output}/${name}-library.png`, fullPage: true });
          waits.library.release();
          await page.goto(origins[app] + '/code');
          const checking = page.getByRole('status').filter({ hasText: 'Checking saved analysis…' });
          await expect(checking).toBeVisible();
          const button = page.getByRole('button', { name: 'Checking saved analysis…', exact: true });
          await expect(button).toHaveAttribute('aria-busy', 'true');
          await expect(button).toBeDisabled();
          checked.frames.inline = await motion(checking.locator('[data-variant="activity"]'), reduced);
          checked.frames.button = await motion(button.locator('[data-variant="activity"]'), reduced);
          await expect(page.getByText(dataset[0].original, { exact: true })).toBeVisible();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
          await page.screenshot({ path: `${output}/${name}-checking.png`, fullPage: true });
          waits.checking.release();
          await expect(checking).toHaveCount(0);
          await page.getByRole('button', { name: 'Suggest themes', exact: true }).click();
          const suggestions = page.getByRole('status').filter({ hasText: 'Generating theme suggestions…' });
          await expect(suggestions).toBeVisible();
          checked.frames.suggestions = await motion(suggestions.locator('[data-variant="surface"]').first(), reduced, true);
          await expect(page.locator('.codebook-actions button[aria-busy="true"]')).toContainText('Suggesting themes…');
          waits.suggestions.release();
          await expect(suggestions).toHaveCount(0);
        } else {
          await page.goto(origins[app] + '/join/ABCDEF123456');
          const loading = page.getByRole('status').filter({ hasText: 'Loading your study…' });
          checked.frames.study = await motion(loading.locator('[data-variant="surface"]').first(), reduced, true);
          checked.frames.studyActivity = await motion(loading.locator('[data-variant="activity"]'), reduced);
          await page.screenshot({ path: `${output}/${name}-study.png`, fullPage: true });
          waits.study.release();
          await page.getByRole('button', { name: 'Start study' }).click();
          await page.getByRole('checkbox').check();
          await page.getByRole('button', { name: 'Agree and continue' }).click();
          await page.getByRole('textbox', { name: 'What helped you?' }).fill('Clear next steps helped me plan my courses.');
          await page.getByRole('button', { name: 'Review answers' }).click();
          await page.getByRole('button', { name: 'Submit responses' }).click();
          const button = page.getByRole('button', { name: 'Submitting…', exact: true });
          await expect(button).toHaveAttribute('aria-busy', 'true');
          await expect(button).toBeDisabled();
          checked.frames.button = await motion(button.locator('[data-variant="activity"]'), reduced);
          const saving = page.getByRole('status').filter({ hasText: 'Submitting your responses and preparing your receipt…' });
          checked.frames.inline = await motion(saving.locator('[data-variant="activity"]'), reduced);
          await expect(page.getByText('Clear next steps helped me plan my courses.', { exact: true })).toBeVisible();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
          await page.screenshot({ path: `${output}/${name}-submitting.png`, fullPage: true });
          waits.submission.release();
          await expect(page.getByRole('heading', { name: 'Thank you for participating' })).toBeVisible();
        }
        results.push(checked);
        console.log(`PASS ${name}`);
      } finally {
        Object.values(waits).forEach(wait => wait.release());
        await context.close();
      }
    }
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/verification.json`, JSON.stringify({ live, results, errors }, null, 2));
} finally { await browser.close(); }
