// Lab pages mark a source that was not opened as "not verified" (CLAUDE.md rule 3) and never narrate
// how an agent's session went. Felipe's own essays are left out of the check.
// Run: node --test scripts/lab-voice.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../src/content/lab/', import.meta.url);
const pages = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));

// Session narration seen on published pages: what a fetch did, rather than what the source says.
const NARRATION = [/could not be opened from here/i, /refused the request/i, /\bnot opened:/i];

// The Provocation and The Return are Felipe's; their essays stay as he wrote them.
function withoutFelipesSections(md) {
  return md.replace(/^## The (Provocation|Return)\n[\s\S]*?(?=^## )/gm, '');
}

test('no Lab page narrates a fetch; unopened sources are marked not verified', () => {
  assert.ok(pages.length > 0);
  for (const f of pages) {
    const text = withoutFelipesSections(readFileSync(new URL(f, dir), 'utf8'));
    for (const re of NARRATION) assert.doesNotMatch(text, re, `${f}: write "not verified" instead of ${re}`);
  }
});

test('the check leaves Felipe’s sections out and keeps everything else', () => {
  const md = '---\nx: 1\n---\n\n## The Provocation\n\nSeen from here.\n\n## What We Know\n\nA.\n\n## The Return\n\nB.\n\n## How it was built\n\nC.\n';
  const kept = withoutFelipesSections(md);
  assert.doesNotMatch(kept, /Seen from here|\nB\./);
  assert.match(kept, /## What We Know\n\nA\./);
  assert.match(kept, /## How it was built\n\nC\./);
});
