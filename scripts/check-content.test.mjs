import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findEmployerTerms, findSecrets, missingHeadings, REQUIRED_HEADINGS, headingSlugs, idClashes } from './check-content.mjs';

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

test('heading anchors follow the slug rules Astro uses', () => {
  const page = [
    '## The question',
    '### Ask your own question (live box)',
    '### Model scorecard',
    '### Model scorecard',
    '```sh',
    '# a comment inside code is not a heading',
    '```',
    '### Uses `ledger-api` and [a link](https://example.com)',
  ].join('\n');
  assert.deepEqual(headingSlugs(page), [
    'the-question',
    'ask-your-own-question-live-box',
    'model-scorecard',
    'model-scorecard-1',
    'uses-ledger-api-and-a-link',
  ]);
});

test('flags an element id that equals a heading anchor, as on the live page in October 2026', () => {
  const page = '### Model scorecard\n\n<div id="model-scorecard" class="ledger-demo"></div>';
  assert.deepEqual(idClashes(page), ['id "model-scorecard" is also a heading\'s anchor']);
});

test('flags an element id used twice and accepts distinct ids', () => {
  assert.deepEqual(idClashes('<div id="a"></div>\n<div id="a"></div>'), ['id "a" is used twice']);
  assert.deepEqual(idClashes('### Model scorecard\n\n<div id="model-scorecard-box"></div>\n<h3 id="recorded-session">Recorded session</h3>'), []);
});
