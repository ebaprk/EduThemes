import test from 'node:test';
import assert from 'node:assert/strict';
import { addThemeAssignment, rejectThemeAssignments, removeThemeAssignment } from './themeAssignments.js';

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
