import assert from 'node:assert/strict';
import test from 'node:test';
import { participantDetails, submissionsToCsv } from './participantData.js';

test('only supplied and supported participant fields are displayed', () => {
  assert.deepEqual(participantDetails({ name: 'Student', academic_year: '', raw_token: 'secret' }), [['Name', 'Student']]);
  assert.deepEqual(participantDetails(), []);
});

test('export preserves association of identity, answers, and anonymous responses', () => {
  const csv = submissionsToCsv([
    { id: 'one', created_at: 'today', participant_data: { name: 'Alex, "A"', academic_year: 'Junior' }, answers: { q: 'First\nanswer' } },
    { id: 'two', created_at: 'today', answers: { q: 'Second answer' } },
  ], [{ id: 'q', prompt: 'Why?', position: 0 }]);
  assert.ok(csv.includes('"Alex, ""A"""'));
  assert.ok(csv.includes('"Junior"'));
  assert.ok(csv.includes('"First\nanswer"'));
  assert.ok(csv.includes('"anonymous"'));
  assert.ok(csv.indexOf('First\nanswer') < csv.indexOf('"two"'));
});

test('CSV export neutralizes formula injection in names, answers, and question prompts', () => {
  const csv = submissionsToCsv([{ participant_data: { name: '=HYPERLINK("bad")' }, answers: { q: '\t=1+1' } }], [{ id: 'q', position: 0, prompt: '=1+1' }]);
  assert.ok(csv.includes('"\'=HYPERLINK('));
  assert.ok(csv.includes('"\'\t=1+1"'));
});
