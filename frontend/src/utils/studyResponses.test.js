import assert from 'node:assert/strict';
import test from 'node:test';
import { attachResponseSources, responseRecordsForQuestion, responsesForQuestion, responsesToCsv } from './studyResponses.js';

test('study coding imports only answers to the selected question', () => {
  const submissions = [
    { answers: { a: 'first', b: 'other' } },
    { answers: { a: '  ', b: 'different' } },
    { answers: { a: 'second' } },
  ];
  assert.deepEqual(responsesForQuestion('a', submissions), ['first', 'second']);
});

test('resuming coding keeps the exact saved response set', () => {
  const current = [{ answers: { a: 'new response' } }];
  const saved = { coded_responses: [{ original: 'old response', themes: [{ name: 'Belonging' }] }] };
  assert.deepEqual(responsesForQuestion('a', current, saved), ['old response']);
});

test('CSV conversion preserves commas, quotes, and line breaks', () => {
  assert.equal(responsesToCsv(['one, two', 'A "quote"\nand next line']), 'Response\n"one, two"\n"A ""quote""\nand next line"');
});

test('identical answer text retains distinct participant source records', () => {
  const records = responseRecordsForQuestion('q', [
    { id: 'one', study_version_id: 'v1', answers: { q: 'Same answer' } },
    { id: 'two', study_version_id: 'v1', answers: { q: 'Same answer' } },
  ]);
  const dataset = attachResponseSources([{ original: 'Same answer', themes: [] }, { original: 'Same answer', themes: [] }], records);
  assert.deepEqual(dataset.map((entry) => entry.submission_id), ['one', 'two']);
  assert.equal(dataset[0].study_version_id, 'v1');
  assert.throws(() => attachResponseSources([{ original: 'Changed text' }], records), /did not match/);
  assert.throws(() => attachResponseSources([{ original: 'Changed text' }, { original: 'Same answer' }], records), /did not match/);
});
