// The lockdown and power-load page: every figure on it comes from data/power-lockdown/results.json.
// Run: node --test scripts/power-page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const r = JSON.parse(read('data/power-lockdown/results.json'));
const page = read('src/content/lab/brazil-lockdown-power-load.md');
const pct = (v) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2)}%`;
const int = (n) => new Intl.NumberFormat('en-GB').format(n);

test('the level-of-detail table matches the saved results', () => {
  const L = r.levels.BR;
  assert.ok(page.includes(`| Hour | ${pct(L.hour.fall_pct)} | 9 Apr 2020, ${String(L.hour.hour).padStart(2, '0')}:00 | ${int(L.hour.of)} comparable hours |`));
  assert.equal(L.hour.date, '2020-04-09');
  assert.ok(page.includes(`| Day | ${pct(L.day.fall_pct)} | 9 Apr 2020 | ${L.day.of} comparable days |`));
  assert.equal(L.week.from, '2020-04-20');
  assert.ok(page.includes(`| ISO week | ${pct(L.week.fall_pct)} | 20 to 26 Apr 2020 (${L.week.days} comparable days) | ${L.week.of} weeks`));
  assert.ok(page.includes(`| Calendar month | ${pct(L.month.fall_pct)} | April 2020 |`));
  assert.ok(page.includes(`| Calendar quarter | ${pct(L.quarter.fall_pct)} | Q2 2020 |`));
  assert.ok(page.includes(`| The whole period | ${pct(L.window.fall_pct)} | 16 Mar to 30 Jun 2020 | ${L.window.days} comparable days |`));
  assert.ok(page.includes(`That keeps ${r.rows.ordinary_days_in_window} of the ${r.rows.days_in_window} days`));
});

test('IBC-Br, the April table and the dose estimates match the saved results', () => {
  const a = r.activity;
  assert.ok(page.includes(`was ${Math.abs(a.months[1].fall_pct).toFixed(2)}% below the mean of April 2018 and April 2019`));
  assert.ok(page.includes(`IBC-Br was ${Math.abs(a.quarter.fall_pct).toFixed(2)}% lower and load ${Math.abs(r.levels.BR.quarter.fall_pct).toFixed(2)}% lower`));
  assert.ok(page.includes(`fell ${Math.abs(a.sa_feb_to_apr_pct).toFixed(2)}% from February to April 2020`));
  const names = { N: 'North', NE: 'Northeast', S: 'South', SE: 'Southeast/Centre-West' };
  for (const s of r.april) {
    assert.ok(page.includes(`| ${names[s.subsystem]} | ${s.stringency_capacity.toFixed(1)} | ${s.stringency_equal.toFixed(1)} | ${pct(s.load_fall_pct)} | ${s.comparable_days} |`), s.subsystem);
  }
  const row = (e) => `${pct(e.per10_pct)} (${pct(e.low_pct)} to ${pct(e.high_pct)})`.replace(/\(\+/g, '(').replace(/ to \+/g, ' to ');
  const c = r.estimates.capacity;
  const e = r.estimates.equal;
  const plain = (s) => s.replace(/\+/g, '');
  assert.ok(plain(page).includes(plain(`| ${c.over_time.days} | ${row(c.over_time)} | ${row(e.over_time)} |`)), 'over time');
  assert.ok(plain(page).includes(plain(`| ${c.same_day.days} | ${row(c.same_day)} | ${row(e.same_day)} |`)), 'same day');
  assert.ok(page.includes(`${r.bootstrap.reps.toLocaleString('en-GB')} bootstrap draws`));
  assert.ok(page.includes(`(seed ${r.bootstrap.seed})`));
  // The same-day interval includes zero under both weightings: the page says the dose is not shown.
  for (const w of ['capacity', 'equal']) assert.ok(r.estimates[w].same_day.low_pct < 0 && r.estimates[w].same_day.high_pct > 0, w);
  assert.match(page, /harder lockdowns are not shown to have cut more load/);
});

test('the dose spread, the bridge and the checks match the saved results', () => {
  const d = r.dose;
  assert.ok(page.includes(`from ${d.april_states.mildest.stringency} (Federal District) to ${d.april_states.strictest.stringency} (Roraima)`));
  assert.deepEqual([d.april_states.mildest.state, d.april_states.strictest.state], ['DF', 'RR']);
  assert.ok(page.includes(`${d.subsystem_gap.capacity.mean_gap} points apart on an average day (capacity weights; ${d.subsystem_gap.equal.mean_gap} with equal weights), ${d.subsystem_gap.capacity.max_gap} at most`));
  const b = Object.fromEntries(r.bridge.map((x) => [x.state, x]));
  assert.ok(page.includes(`São Paulo carries ${(100 * b.SP.w_capacity).toFixed(1)}%`));
  assert.ok(page.includes(`Bahia ${(100 * b.BA.w_capacity).toFixed(1)}%`));
  assert.ok(page.includes(`it carries ${(100 * b.RR.w_capacity).toFixed(1)}% of the North's capacity weight`));
  for (const [st, sub] of [['PA', 'N'], ['TO', 'N'], ['PR', 'S'], ['MT', 'SE'], ['AC', 'SE'], ['RO', 'SE']]) assert.equal(b[st].subsystem, sub, st);
  const split = r.bridge.filter((x) => x.substations_elsewhere > 0).map((x) => x.state).sort();
  assert.deepEqual(split, ['MT', 'PA', 'PR', 'TO']);
  assert.ok(page.includes('Four states have substations in two subsystems'));
  assert.ok(page.includes(`**${r.checks.total} checks, all passed, tolerance zero:**`));
  assert.equal(r.checks.passed, r.checks.total);
  assert.ok(page.includes(`${int(r.rows.hourly)} rows, one per subsystem and hour`));
  assert.ok(page.includes(`the South ran ${r.estimates.capacity.pre_growth_pct.S}% above its 2018–19 days and the Southeast/Centre-West ${Math.abs(r.estimates.capacity.pre_growth_pct.SE)}% below`));
});

test('the page embeds the dbt docs served with the site, with the still as its fallback', () => {
  assert.match(page, /<iframe class="power-docs-live" src="\/lab-docs\/semantic-layer\/index\.html#!\/model\/model\.lab_semantic_layer\.fct_load_vs_reference"[^>]* loading="lazy"><\/iframe>/);
  assert.match(page, /<img class="power-docs-still" src="\/assets\/lab\/power-lockdown-lineage\.png"/);
  assert.ok(existsSync(new URL('../public/assets/lab/power-lockdown-lineage.png', import.meta.url)));
  const docs = read('public/lab-docs/semantic-layer/index.html');
  for (const m of ['fct_load_vs_reference', 'fct_stringency_subsystem_daily', 'bridge_weights_sum_to_one', 'load_not_counted_twice']) assert.ok(docs.includes(m), m);
  assert.doesNotMatch(docs, /\/(home|Users|root)\/[\w.-]+\//, 'no local paths in the docs');
  assert.match(page, /<div data-lab-chart="power"><\/div>/);
  // Phones get the still: the frame shows only from 900 px.
  const css = read('public/css/lab-power.css');
  assert.match(css, /\.power-docs-live \{ display: none;/);
  assert.match(css, /@media \(min-width: 900px\) \{\n {2}\.power-docs-live \{ display: block; \}/);
});
