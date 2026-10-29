import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkLinks, internalRefs, layoutAssets, targetExists } from './check-links.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'links-'));
  mkdirSync(join(root, 'src/pages/case-studies'), { recursive: true });
  mkdirSync(join(root, 'public/css'), { recursive: true });
  mkdirSync(join(root, 'public/assets'), { recursive: true });
  writeFileSync(join(root, 'src/pages/index.astro'), '');
  writeFileSync(join(root, 'src/pages/milestones.astro'), '');
  writeFileSync(join(root, 'src/pages/case-studies/one.astro'), '');
  writeFileSync(join(root, 'public/assets/a.jpg'), '');
  writeFileSync(join(root, 'public/css/styles.css'), '');
  return root;
}

test('finds pages and assets, ignores hash and query', () => {
  const root = fixture();
  assert.ok(targetExists(root, '/'));
  assert.ok(targetExists(root, '/#work'));
  assert.ok(targetExists(root, '/milestones'));
  assert.ok(targetExists(root, '/case-studies/one#outcome'));
  assert.ok(targetExists(root, '/assets/a.jpg?v=2'));
  assert.equal(targetExists(root, '/nope'), false);
});

test('extracts internal references from markup and CSS', () => {
  const refs = internalRefs(`<a href="/milestones">x</a><img src="/assets/a.jpg"><a href="https://x.com/y">z</a>
    .a{background:url('/assets/a.jpg')} .b{background:url("data:image/png;base64,AAA")}`);
  assert.deepEqual(refs, ['/milestones', '/assets/a.jpg', '/assets/a.jpg']);
});

test('reads stylesheets and script names handed to the layout', () => {
  assert.deepEqual(layoutAssets(`css={['styles', 'site-fixes']}\n script="script"`), [
    '/css/styles.css',
    '/css/site-fixes.css',
    '/js/script.js',
  ]);
});

test('reports a broken link', () => {
  const root = fixture();
  writeFileSync(join(root, 'src/pages/index.astro'), '<a href="/missing">x</a><a href="/milestones">ok</a>');
  const problems = checkLinks(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /missing/);
});

test('the real repository has no broken internal references', () => {
  assert.deepEqual(checkLinks(process.cwd()), []);
});
