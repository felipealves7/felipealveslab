// The README is the repository's front page: it links every Lab exhibit and describes the folders
// that exist. Run: node --test scripts/readme.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readme = readFileSync(root + 'README.md', 'utf8');
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

test('the README links every Lab exhibit on the live site', () => {
  const slugs = readdirSync(root + 'src/content/lab').filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => f.replace(/\.md$/, ''));
  assert.ok(slugs.length > 0);
  for (const slug of slugs) assert.ok(readme.includes(`(https://felipealveslab.com/lab/${slug})`), `README links /lab/${slug}`);
  const linked = [...readme.matchAll(/\(https:\/\/felipealveslab\.com\/lab\/([a-z0-9-]+)\)/g)].map((m) => m[1]).filter((s) => s !== 'how-its-built');
  for (const s of linked) assert.ok(slugs.includes(s), `README links /lab/${s}, which is not an exhibit`);
});

test('every folder and file the README points to exists, and its counts match', () => {
  for (const [, path] of readme.matchAll(/`((?:src|pipelines|data|public|scripts)\/[^`*]*?)`/g)) {
    assert.ok(existsSync(root + path.replace(/\/$/, '')), `${path} exists`);
  }
  const cases = readdirSync(root + 'src/pages/case-studies').filter((f) => f.endsWith('.astro')).length;
  assert.match(readme, new RegExp(`${WORDS[cases]} case studies`), `README says ${WORDS[cases]} case studies`);
  const prompts = readdirSync(root + '.claude/prompts').filter((f) => f.endsWith('.md')).length;
  assert.match(readme, new RegExp(`${WORDS[prompts][0].toUpperCase()}${WORDS[prompts].slice(1)} Claude agents`));
});
