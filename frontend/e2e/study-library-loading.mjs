// Verify the library keeps its selected layout when delayed data replaces placeholders.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(frontend, 'test-results/study-library-loading');
await mkdir(output, { recursive: true });
const env = await readFile(path.join(frontend, '.env.production'), 'utf8');
const storageKey = `sb-${new URL(env.match(/^VITE_SUPABASE_URL=(.+)$/m)[1].trim()).hostname.split('.')[0]}-auth-token`;
const origin = 'https://researcher.local';
const user = { id: '10000000-0000-4000-8000-000000000001', email: 'test@example.edu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;
const studies = Array.from({ length: 6 }, (_, index) => ({
  id: `20000000-0000-4000-8000-00000000000${index}`,
  title: `Advising experiences ${index + 1}`, status: 'open',
  created_at: '2026-11-21T12:00:00Z', owner_id: user.id, source_type: 'participant',
}));
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];

async function scenario(width, savedLayout, reduced = false, switchLayout = false) {
  const name = `${width}-${savedLayout || 'default'}${reduced ? '-reduced' : ''}${switchLayout ? '-toggle' : ''}`;
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await context.addInitScript(({ storageKey, token, user, savedLayout }) => {
    localStorage.setItem(storageKey, JSON.stringify({ access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, user }));
    if (savedLayout) localStorage.setItem('eduthemes.studyLayout', savedLayout);
  }, { storageKey, token, user, savedLayout });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      const file = path.extname(url.pathname) ? url.pathname.slice(1) : 'index.html';
      const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(file)];
      return route.fulfill({ body: await readFile(path.join(frontend, 'dist-researcher', file)), contentType });
    }
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: user });
    if (url.pathname === '/rest/v1/studies') {
      await pending;
      return route.fulfill({ json: studies });
    }
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [] });
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin);
    const loading = page.getByRole('status').filter({ hasText: 'Loading studies…' });
    await expect(loading).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No studies yet' })).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0); // Decorative placeholders stay hidden from accessibility APIs.
    let layout = savedLayout || 'list';
    if (switchLayout) {
      layout = layout === 'list' ? 'grid' : 'list';
      await page.getByRole('button', { name: layout === 'grid' ? 'Grid view' : 'List view', exact: true }).click();
    }
    const container = layout === 'grid' ? '.study-list' : '.study-library-table-wrap';
    const before = await loading.locator(container).boundingBox();
    if (layout === 'list') {
      await expect(loading.locator('thead th')).toHaveText(['Study name', 'Status', 'Access', 'Progress', 'Updated']);
      await expect(loading.locator('tbody tr')).toHaveCount(8);
      await expect(loading.locator('tbody tr').first().locator('td')).toHaveCount(5);
      await expect(loading.locator('.study-list-card')).toHaveCount(0);
    } else {
      await expect(loading.locator('.study-list-card')).toHaveCount(6);
      await expect(loading.locator('.study-card-top')).toHaveCount(6);
      await expect(loading.locator('.study-card-bottom')).toHaveCount(6);
    }
    const columns = layout === 'grid' ? await loading.locator(container).evaluate(el => getComputedStyle(el).gridTemplateColumns) : null;
    const skeleton = loading.locator('.edu-skeleton').first();
    assert.equal(await skeleton.evaluate(el => el.getAnimations({ subtree: true }).some(animation => animation.playState === 'running')), !reduced);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'No page overflow while loading');
    await page.screenshot({ path: path.join(output, `${name}-loading.png`), fullPage: true, animations: 'disabled' });
    release();
    await expect(loading).toHaveCount(0);
    await expect(page.locator(layout === 'grid' ? '.study-list-card' : '.study-library-table tbody tr')).toHaveCount(6);
    const after = await page.locator(container).boundingBox();
    for (const dimension of ['x', 'y', 'width']) assert.ok(Math.abs(before[dimension] - after[dimension]) < 1, `${dimension} stays aligned after loading`);
    if (layout === 'grid') assert.equal(await page.locator(container).evaluate(el => getComputedStyle(el).gridTemplateColumns), columns, 'Grid columns stay aligned after loading');
    else await expect(page.getByRole('columnheader')).toHaveText(['Study name', 'Status', 'Access', 'Progress', 'Updated']);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'No page overflow after loading');
    await page.screenshot({ path: path.join(output, `${name}-loaded.png`), fullPage: true, animations: 'disabled' });
    console.log(`PASS ${name}`);
  } finally {
    release();
    await context.close();
  }
}

try {
  for (const width of [1440, 1800, 390, 320]) {
    await scenario(width, null);
    await scenario(width, 'grid');
  }
  await scenario(1440, null, true);
  await scenario(1440, 'list', false, true);
  await scenario(1440, 'grid', false, true);
  assert.deepEqual(errors, [], 'No browser errors');
} finally {
  await browser.close();
}
