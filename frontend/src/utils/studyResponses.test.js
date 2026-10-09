import assert from 'node:assert/strict';
import test from 'node:test';
import { responsesForQuestion, responsesToCsv } from './studyResponses.js';

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
