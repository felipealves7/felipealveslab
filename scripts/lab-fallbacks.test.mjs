// Every box a script fills on a Lab page says, before the script runs, that it needs JavaScript and
// where the saved output is. A "Loading…" line would stay on screen forever with scripts off.
// Run: node --test scripts/lab-fallbacks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../src/content/lab/', import.meta.url);
const pages = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));

// <div id="…" … data-src|data-api="…"><p>fallback</p></div> on one line, as the pages write them.
const MOUNT = /<div id="([^"]+)"[^>]*\bdata-(?:src|api)="[^"]+"[^>]*><p>([\s\S]*?)<\/p><\/div>/g;

test('each script-filled box has a no-JavaScript fallback that names the saved output', () => {
  let mounts = 0;
  for (const f of pages) {
    const md = readFileSync(new URL(f, dir), 'utf8');
    for (const [, id, text] of md.matchAll(MOUNT)) {
      mounts += 1;
      assert.match(text, /needs JavaScript/, `${f} #${id}: say that it needs JavaScript`);
      assert.match(text, /<code>(data|pipelines)\/[^<]+<\/code>/, `${f} #${id}: name the saved file or code`);
      assert.doesNotMatch(text, /Loading/i, `${f} #${id}: no loading message`);
    }
  }
  assert.ok(mounts >= 4, `found ${mounts} script-filled boxes`);
});
