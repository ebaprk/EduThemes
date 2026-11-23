import test from 'node:test';
import assert from 'node:assert/strict';
import { addThemeAssignment, classificationsFromDataset, rejectThemeAssignments, removeThemeAssignment, reviewedDataset, reviewResponseThemes } from './themeAssignments.js';

const themeA = { name: 'Access', color: '#315f9f', description: 'Access issues' };
const unclassifiedTheme = { name: 'Unclassified', color: '#cccccc', description: 'No match' };

test('adding a theme is immutable, deduplicated, and removes unclassified', () => {
  const dataset = [{ original: 'Response', themes: [unclassifiedTheme] }];
  const classifications = { Access: [], Unclassified: [0] };
  const first = addThemeAssignment({ classifications, dataset, theme: themeA, responseIndex: 0 });
  const second = addThemeAssignment({ ...first, theme: themeA, responseIndex: 0 });

  assert.deepEqual(second.classifications, { Access: [0], Unclassified: [] });
  assert.deepEqual(second.dataset[0].themes, [themeA]);
  assert.deepEqual(dataset[0].themes, [unclassifiedTheme]);
});

test('removing one theme never removes a different assignment', () => {
  const other = { name: 'Support', color: '#000000' };
  const result = removeThemeAssignment({
    classifications: { Access: [0], Support: [0] },
    dataset: [{ themes: [themeA, other] }],
    themeName: 'Access',
    responseIndex: 0,
  });

  assert.deepEqual(result.dataset[0].themes, [other]);
  assert.deepEqual(result.classifications.Support, [0]);
});

test('rejected responses become unclassified only when no other theme remains', () => {
  const other = { name: 'Support', color: '#000000' };
  const result = rejectThemeAssignments({
    classifications: { Access: [0, 1], Support: [1], Unclassified: [] },
    dataset: [{ themes: [themeA] }, { themes: [themeA, other] }],
    rejectedIndices: [0, 1],
    themeName: 'Access',
    unclassifiedTheme,
  });

  assert.deepEqual(result.classifications.Unclassified, [0]);
  assert.deepEqual(result.dataset[0].themes, [unclassifiedTheme]);
  assert.deepEqual(result.dataset[1].themes, [other]);
});

test('findings keep the approved rows after a rejection changes their positions', () => {
  const support = { name: 'Support', color: '#000000', description: 'Help from others' };
  const labels = [themeA, support, unclassifiedTheme];
  const dataset = [
    { original: 'Rejected in both themes', themes: [support], review_decisions: { Access: { action: 'deny' }, Support: { action: 'deny' } } },
    { original: 'Accepted in both themes', themes: [], review_decisions: { Access: { action: 'approve' }, Support: { action: 'approve' } } },
    { original: 'Accepted in one theme', themes: [], review_decisions: { Access: { action: 'approve' }, Support: { action: 'deny' } } },
    { original: 'No suggested theme', themes: [] },
  ];
  const rejectedInAccess = rejectThemeAssignments({
    classifications: { Access: [0, 1, 2], Support: [0, 1, 2], Unclassified: [3] },
    dataset,
    rejectedIndices: [0],
    themeName: 'Access',
    unclassifiedTheme,
  });
  const finalDataset = reviewedDataset({ ...rejectedInAccess, labels });

  assert.deepEqual(finalDataset.map(row => row.original), dataset.map(row => row.original));
  assert.deepEqual(finalDataset.map(row => row.review_decisions), dataset.map(row => row.review_decisions));
  assert.deepEqual(finalDataset.map(row => row.themes), [[unclassifiedTheme], [themeA, support], [themeA], [unclassifiedTheme]]);
  assert.deepEqual(classificationsFromDataset(finalDataset, labels), { Access: [1, 2], Support: [1], Unclassified: [0, 3] });
});

test('review can add a missing second theme and restore a rejected theme through final findings', () => {
  const support = { name: 'Support', color: '#000000', description: 'Help from others' };
  const labels = [themeA, support, unclassifiedTheme];
  const original = {
    classifications: { Access: [0, 1], Support: [1], Unclassified: [] },
    dataset: [
      { original: 'Both themes', submission_id: 'source-1', themes: [themeA], review_decisions: { Access: { action: 'approve' }, Support: { action: 'deny' } } },
      { original: 'Keep this row unchanged', themes: [themeA, support], review_decisions: { Access: { action: 'approve' }, Support: { action: 'approve' } } },
    ],
  };
  const result = reviewResponseThemes({ ...original, labels, responseIndex: 0, selectedNames: ['Access', 'Support', 'Support'], recordedAt: 'now' });
  assert.deepEqual(result.classifications, { Access: [0, 1], Support: [1, 0], Unclassified: [] });
  assert.equal(result.dataset[0].submission_id, 'source-1');
  assert.equal(result.dataset[0].review_decisions.Support.action, 'approve');
  assert.equal(result.dataset[0].review_decisions.Support.recorded_at, 'now');
  assert.strictEqual(result.dataset[1], original.dataset[1]);
  assert.deepEqual(original.dataset[0].themes, [themeA]);
  const restored = JSON.parse(JSON.stringify(result));
  const final = reviewedDataset({ ...restored, labels });
  assert.deepEqual(classificationsFromDataset(final, labels), { Access: [0, 1], Support: [0, 1], Unclassified: [] });
});

test('review can assign several themes to an unclassified row and clear them without losing the response', () => {
  const support = { name: 'Support', color: '#000000' };
  const labels = [themeA, support, unclassifiedTheme];
  const initial = { classifications: { Access: [], Support: [], Unclassified: [0] }, dataset: [{ original: 'Source text', submission_id: 'source', themes: [unclassifiedTheme] }] };
  const assigned = reviewResponseThemes({ ...initial, labels, responseIndex: 0, selectedNames: ['Access', 'Support'] });
  assert.deepEqual(assigned.classifications, { Access: [0], Support: [0], Unclassified: [] });
  const cleared = reviewResponseThemes({ ...assigned, labels, responseIndex: 0, selectedNames: [] });
  assert.deepEqual(cleared.classifications, { Access: [], Support: [], Unclassified: [0] });
  assert.equal(cleared.dataset[0].review_decisions.Access.action, 'deny');
  assert.equal(cleared.dataset[0].review_decisions.Support.action, 'deny');
  assert.deepEqual(reviewedDataset({ ...cleared, labels })[0].themes, [unclassifiedTheme]);
  assert.equal(cleared.dataset[0].original, 'Source text');
  assert.equal(cleared.dataset[0].submission_id, 'source');
  assert.throws(() => reviewResponseThemes({ ...assigned, labels, responseIndex: 0, selectedNames: ['Unknown theme'] }), /current codebook/);
  assert.deepEqual(assigned.dataset[0].themes, [themeA, support]);
});
