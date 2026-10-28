import assert from 'node:assert/strict';
import test from 'node:test';
import { recordReviewDecision } from './reviewDecisions.js';

test('review decisions survive progress saves and undo preserves other decisions and sources', () => {
  const original = [{ original: 'Answer', submission_id: 'source', themes: [] }, { original: 'Other' }];
  const accepted = recordReviewDecision(original, [0], 'Belonging', 'approve', 'now');
  assert.equal(original[0].review_decisions, undefined);
  assert.equal(accepted[0].submission_id, 'source');
  assert.equal(accepted[0].review_decisions.Belonging.action, 'approve');
  const rejected = recordReviewDecision(accepted, [0], 'Cost', 'deny', 'later');
  const undone = recordReviewDecision(rejected, [0], 'Belonging', null);
  assert.equal(undone[0].review_decisions.Belonging, undefined);
  assert.equal(undone[0].review_decisions.Cost.action, 'deny');
  assert.strictEqual(undone[1], original[1]);
});
