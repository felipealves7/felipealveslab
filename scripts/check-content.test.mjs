import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findEmployerTerms, findSecrets, missingHeadings, REQUIRED_HEADINGS } from './check-content.mjs';

test('flags employer names, case-insensitively', () => {
  assert.deepEqual(findEmployerTerms('built with Emirates data').length, 1);
  assert.deepEqual(findEmployerTerms('a public airline dataset'), []);
});

test('flags secret-shaped strings', () => {
  assert.deepEqual(findSecrets('token ghp_' + 'a'.repeat(30)), ['GitHub token']);
  assert.deepEqual(findSecrets('nothing to see here'), []);
});

test('accepts a page with every heading in order, even with an empty My take', () => {
  const page = REQUIRED_HEADINGS.map((h) => `${h}\n\ntext`).join('\n\n');
  assert.deepEqual(missingHeadings(page), []);
});

test('reports a missing heading', () => {
  const page = REQUIRED_HEADINGS.filter((h) => h !== '## My take').join('\n\n');
  assert.deepEqual(missingHeadings(page), ['## My take']);
});

test('reports headings out of order as missing', () => {
  const reversed = [...REQUIRED_HEADINGS].reverse().join('\n\n');
  assert.ok(missingHeadings(reversed).length > 0);
});
