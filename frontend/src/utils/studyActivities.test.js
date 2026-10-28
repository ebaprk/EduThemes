import assert from 'node:assert/strict';
import test from 'node:test';
import { activityDrafts, completionHandoffCsv, operationsMetrics, studyDraftPayload } from './studyActivities.js';
import { responseRecordsForQuestion } from './studyResponses.js';

test('draft editing preserves the separation of activity questions and normalizes a legacy single activity', () => {
  assert.deepEqual(activityDrafts({ questions: ['Existing question'] })[0].questions, ['Existing question']);
  const activities = activityDrafts({ activity_plan: [
    { id: 'a', title: 'Baseline', questions: [{ id: 'q1', prompt: 'First' }] },
    { id: 'b', title: 'Follow-up', questions: [{ id: 'q2', prompt: 'Second' }] },
  ] });
  const payload = studyDraftPayload({ title: ' Study ', participant_mode: 'anonymous', activities });
  assert.deepEqual(payload.activities.map((activity) => activity.questions), [['First'], ['Second']]);
  assert.deepEqual(payload.questions, ['First', 'Second']); assert.equal(payload.title, 'Study');
  assert.equal(payload.activities[0].id, undefined);
});
test('operations completion counts enrollments and required activities rather than adding response rows', () => {
  const participants = [
    { started: true, required_count: 2, completed_required: 2, completed_activities: 4, overdue_count: 0 },
    { started: true, required_count: 2, completed_required: 1, completed_activities: 3, overdue_count: 1 },
    { started: false, required_count: 2, completed_required: 0, completed_activities: 0, overdue_count: 0 },
  ];
  assert.deepEqual(operationsMetrics(participants), { enrolled: 3, started: 2, completed: 1, overdue: 1 });
});
test('completion handoffs exclude private answers and keys and neutralize spreadsheet formulas', () => {
  const csv = completionHandoffCsv('=1+1', [{ participant_reference: 'P-EXAMPLE', version_number: 1,
    required_count: 2, completed_required: 2, completed_activities: 3, reward_status: 'handed_off',
    access_key: 'private-key', answers: { q: 'Private answer' }, coordinator_notes: 'Private notes' }]);
  assert.ok(csv.includes('"\'=1+1"')); assert.ok(csv.includes('Completed')); assert.ok(csv.includes('Handed off'));
  for (const secret of ['private-key', 'Private answer', 'Private notes']) assert.equal(csv.includes(secret), false);
});
test('coding provenance distinguishes identical text from different activities and enrollments', () => {
  const records = responseRecordsForQuestion('q', [
    { id: 's1', study_version_id: 'v1', activity_id: 'a1', enrollment_id: 'e1', answers: { q: 'Same answer' } },
    { id: 's2', study_version_id: 'v1', activity_id: 'a2', enrollment_id: 'e2', answers: { q: 'Same answer' } },
  ]);
  assert.deepEqual(records.map((record) => [record.activity_id, record.enrollment_id]), [['a1','e1'], ['a2','e2']]);
});
