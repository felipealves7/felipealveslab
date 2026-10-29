// Tests for the airport Lab page's helpers: src/lib/airport/{summary,regions,highlight}.mjs.
// Every figure the page shows comes from a run record through summary.mjs, so these tests pin the
// sentences and numbers to the saved runs in data/airport-contract/results.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  fmtInt, fmtDate, fmtBytes, fmtMs, fmtShare, fmtTolerance, checkState, counts, rowsChecked, groupByTable,
  latest, lastPass, freshnessBadge, causes, followers, headline, causeSentence, STALE_AFTER_DAYS,
} from '../src/lib/airport/summary.mjs';
import { regions, dedent } from '../src/lib/airport/regions.mjs';
import { tokens } from '../src/lib/airport/highlight.mjs';
import { readsById } from '../pipelines/airport-contract/contract.mjs';

const saved = JSON.parse(readFileSync(new URL('../data/airport-contract/results.json', import.meta.url), 'utf8'));
const real = latest(saved, false);
const rehearsal = latest(saved, true);
const reads = readsById();
const DAY = 86400000;

test('the saved file has a real run and a rehearsal to show', () => {
  assert.ok(real && !real.deliberate);
  assert.ok(rehearsal && rehearsal.deliberate);
});

test('formats numbers, dates, sizes and shares the way the page prints them', () => {
  assert.equal(fmtInt(134932), '134,932');
  assert.equal(fmtDate('2026-10-29T08:15:50.497Z'), '29 Oct 2026');
  assert.equal(fmtBytes(12_400_000), '12.4 MB');
  assert.equal(fmtBytes(6387), '6 KB');
  assert.equal(fmtMs(1460), '1.5 s');
  assert.equal(fmtMs(87), '87 ms');
  assert.equal(fmtShare(6, 48382), '0.012%');
  assert.equal(fmtShare(86301, 86301), '100%');
  assert.equal(fmtShare(0, 100), '0%');
  assert.equal(fmtTolerance(0.001), '0.1%');
  assert.equal(fmtTolerance(0), 'none');
});

test('counts the latest real run: every row, every rule, one tolerated', () => {
  const n = counts(real);
  assert.equal(n.rules, real.checks.length);
  assert.equal(n.pass + n.tolerated + n.fail, n.rules);
  assert.equal(n.tableRules + n.rowRules, n.rules);
  assert.equal(rowsChecked(real), real.rows.airports + real.rows.runways + real.rows.countries);
  assert.equal(groupByTable(real).reduce((s, g) => s + g.checks.length, 0), n.rules);
});

test('a rule with bad rows under its tolerance is tolerated, not failed', () => {
  assert.equal(checkState({ passed: true, failed: 0 }), 'pass');
  assert.equal(checkState({ passed: true, failed: 6 }), 'tolerated');
  assert.equal(checkState({ passed: false, failed: 6 }), 'fail');
});

test('the headline for a passing run names the tolerated rows', () => {
  const t = real.checks.filter((c) => checkState(c) === 'tolerated');
  const sentence = headline(real, reads);
  if (t.length) assert.match(sentence, new RegExp(`^${fmtInt(t[0].failed)} rows? in ${t[0].table} broke one rule`));
  else assert.match(sentence, /^Every rule passed on all [\d,]+ rows\.$/);
});

test('the rehearsal fails for one cause: the renamed column, with the rules that read it under it', () => {
  const list = causes(rehearsal, reads);
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'columns');
  assert.deepEqual(list[0].columns, ['iso_country']);
  assert.deepEqual([...list[0].follow].sort(), ['airports.country_known', 'airports.region_matches_country']);
  assert.equal(causeSentence(list[0]), 'The airports file has no iso_country column. 2 more rules failed because they read it.');
  assert.equal(headline(rehearsal, reads), causeSentence(list[0]));
  assert.deepEqual(Object.keys(followers(rehearsal, reads)).sort(), ['airports.country_known', 'airports.region_matches_country']);
});

test('without the column map, each failed rule is its own cause', () => {
  assert.equal(causes(rehearsal, {}).length, 3);
});

test('a stale upstream file is a cause of its own', () => {
  const stale = { ...real, status: 'fail', freshness: { ...real.freshness, ageDays: 30, ok: false } };
  const list = causes(stale, reads);
  assert.equal(list.at(-1).kind, 'stale');
  assert.match(causeSentence(list.at(-1)), /30 days before the run\. The contract allows 7\./);
});

test('the freshness badge turns stale after the allowed days, counting from the last real pass', () => {
  const pass = lastPass(saved);
  const at = (days) => Date.parse(pass.runDate) + days * DAY;
  assert.equal(freshnessBadge(saved, at(0)).state, 'fresh');
  assert.equal(freshnessBadge(saved, at(STALE_AFTER_DAYS + 0.5)).state, 'fresh');
  assert.equal(freshnessBadge(saved, at(STALE_AFTER_DAYS + 1)).state, 'stale');
  assert.equal(freshnessBadge({ runs: [rehearsal] }, at(0)).state, 'none');
});

test('regions read marked lines with their line numbers, without the markers, and dedented', () => {
  const src = [
    'const a = 1;',
    '  // #region outer',
    '  const b = 2;',
    '    // #region inner',
    '    const c = 3;',
    '    // #endregion',
    '  // #endregion',
  ].join('\n');
  const r = regions(src);
  assert.deepEqual(r.inner, { code: 'const c = 3;', from: 5, to: 5 });
  assert.deepEqual(r.outer, { code: 'const b = 2;\n  const c = 3;', from: 3, to: 5 });
  assert.equal(dedent(['    x', '', '      y']), 'x\n\n  y');
});

test('every region the page shows exists in the pipeline files', () => {
  const wanted = {
    'load.mjs': ['source', 'request', 'parse'],
    'csv.mjs': ['scan'],
    'contract.mjs': ['max-age', 'freshness', 'rule-helper', 'rule-columns', 'rule-country', 'rule-region', 'rule-runway', 'tolerance'],
    'record.mjs': ['gate'],
    'run.mjs': ['record', 'exit'],
  };
  for (const [file, names] of Object.entries(wanted)) {
    const r = regions(readFileSync(new URL(`../pipelines/airport-contract/${file}`, import.meta.url), 'utf8'));
    for (const name of names) assert.ok(r[name]?.code, `${file} #region ${name}`);
  }
});

test('the highlighter keeps every character and tells a regex from a division', () => {
  const code = "const int = /^-?\\d+$/; // whole numbers\nconst half = a / 2 + 'x';";
  const t = tokens(code);
  assert.equal(t.map((x) => x.s).join(''), code);
  assert.deepEqual(t.filter((x) => x.t !== 'plain').map((x) => `${x.t}:${x.s}`), [
    'keyword:const', 'regex:/^-?\\d+$/', 'comment:// whole numbers', 'keyword:const', 'number:2', "string:'x'",
  ]);
});

test('a rule with too many bad rows is described in plain words', () => {
  const c = { kind: 'rows', table: 'airports', says: 'latitude is -90 to 90 and longitude is -180 to 180', failed: 200, checked: 86301 };
  assert.equal(causeSentence(c), '200 of 86,301 rows in airports break the rule “latitude is -90 to 90 and longitude is -180 to 180”.');
});
