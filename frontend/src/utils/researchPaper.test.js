import test from 'node:test';
import assert from 'node:assert/strict';
import { paperReview, paperSettings, readPaperDraft, paperFingerprint } from './researchPaper.js';

test('paper report notes exclude private flags, signatures and participant details', () => {
  const review = paperReview({ methods: 'Actual method', quotes: [2, 0, 2], signed_by: 'private identity', flags: { 0: { note: 'Private uncertainty', resolved: false } }, participant_data: 'private participant' });
  assert.deepEqual(review.quotes, [0, 2]);
  assert.equal(review.flags[0].resolved, false);
  for (const secret of ['Private uncertainty', 'private identity', 'private participant']) assert.equal(JSON.stringify(review).includes(secret), false);
});
test('references preserve supplied source notes and reject excessive input', () => {
  const settings = { title: ' Study ', authors: '', affiliation: '', target_words: '1800', references: 'First citation\nSource note\n\nSecond citation' };
  assert.deepEqual(paperSettings(settings), { title: 'Study', authors: '', affiliation: '', target_words: 1800, references: ['First citation\nSource note', 'Second citation'] });
  assert.throws(() => paperSettings({ ...settings, references: Array(21).fill('Citation').join('\n\n') }));
});
test('draft recovery fails safely for unavailable storage and invalid saved records', () => {
  assert.equal(readPaperDraft({ getItem() { throw new Error('blocked'); } }, 'key'), null);
  assert.equal(readPaperDraft({ getItem: () => 'malformed' }, 'key'), null);
  assert.equal(readPaperDraft({ getItem: () => JSON.stringify({ version: 1, draft: { markdown: 99 } }) }, 'key'), null);
  const saved = { version: 1, draft: { markdown: 'An edited draft.' }, settings: { title: 'Study' } };
  assert.deepEqual(readPaperDraft({ getItem: () => JSON.stringify(saved) }, 'key'), saved);
});
test('changing source snapshots or paper settings marks a retained draft as stale', () => {
  const settings = { title: 'Study' }, evidence = { sources: [{ snapshot_hash: 'original' }] };
  assert.equal(paperFingerprint(evidence, settings), paperFingerprint(structuredClone(evidence), settings));
  assert.notEqual(paperFingerprint(evidence, settings), paperFingerprint({ sources: [{ snapshot_hash: 'changed' }] }, settings));
  assert.notEqual(paperFingerprint(evidence, settings), paperFingerprint(evidence, { title: 'New title' }));
});
