// Scores both rule versions against the hand-labelled sample and builds the saved results.
// Usage: node pipelines/airport-names/evaluate.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classify, VERSIONS } from './classify.mjs';
import { parseCsv } from './csv.mjs';
import { drawSample, loadSet, SAMPLE_SEED, SAMPLE_SIZE } from './sample.mjs';

const root = new URL('../../', import.meta.url);
export const OUTPUTS = [
  fileURLToPath(new URL('data/airport-names/results.json', root)),
  fileURLToPath(new URL('public/data/airport-names/results.json', root)),
];
const LABELS_FILE = fileURLToPath(new URL('data/airport-names/labels.csv', root));
export const CLASSES = ['person', 'place', 'other'];
export const RETRIEVED = '2026-10-29';

export function loadLabels() {
  return Object.fromEntries(parseCsv(readFileSync(LABELS_FILE, 'utf8')).map((r) => [r.id, r]));
}

/** Confusion counts, accuracy, and per-class precision and recall. Unclear counts as a miss. */
export function score(sample, labels, version) {
  const confusion = {};
  for (const want of CLASSES) confusion[want] = { person: 0, place: 0, other: 0, unclear: 0 };
  let right = 0;
  for (const a of sample) {
    const want = labels[a.id].label;
    const got = classify(a, version).label;
    confusion[want][got]++;
    if (got === want) right++;
  }
  const perClass = {};
  for (const c of CLASSES) {
    const tp = confusion[c][c];
    const predicted = CLASSES.reduce((n, w) => n + confusion[w][c], 0);
    const actual = CLASSES.reduce((n, g) => n + confusion[c][g], 0) + confusion[c].unclear;
    perClass[c] = { actual, predicted, precision: predicted ? tp / predicted : null, recall: actual ? tp / actual : null };
  }
  const unclear = CLASSES.reduce((n, w) => n + confusion[w].unclear, 0);
  const sure = sample.filter((a) => !labels[a.id].unsure);
  const sureRight = sure.filter((a) => classify(a, version).label === labels[a.id].label).length;
  return {
    version,
    total: sample.length,
    right,
    accuracy: right / sample.length,
    unclear,
    accuracyWithoutUnsureLabels: sureRight / sure.length,
    unsureLabels: sample.length - sure.length,
    confusion,
    perClass,
  };
}

export function buildResults() {
  const airports = loadSet();
  const sample = drawSample(airports);
  const labels = loadLabels();
  const rows = airports.map((a) => {
    const c = classify(a, 'v2');
    return { id: a.id, name: a.name, city: a.municipality, country: a.iso_country, label: c.label, reason: c.reason };
  });
  const byCountry = {};
  for (const r of rows) {
    byCountry[r.country] ??= { person: 0, place: 0, other: 0, unclear: 0, total: 0 };
    byCountry[r.country][r.label]++;
    byCountry[r.country].total++;
  }
  const share = { person: 0, place: 0, other: 0, unclear: 0 };
  for (const r of rows) share[r.label]++;
  const mistakes = sample
    .filter((a) => classify(a, 'v2').label !== labels[a.id].label)
    .map((a) => ({ id: a.id, name: a.name, city: a.municipality, country: a.iso_country, hand: labels[a.id].label, rules: classify(a, 'v2').label }));
  return {
    set: { size: airports.length, definition: 'OurAirports type large_airport with scheduled_service yes', retrieved: RETRIEVED, synthetic: false },
    sample: { size: SAMPLE_SIZE, seed: SAMPLE_SEED },
    evaluation: VERSIONS.map((v) => score(sample, labels, v)),
    mistakesV2: mistakes,
    counts: share,
    byCountry,
    airports: rows,
  };
}

export function sameResult(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = buildResults();
  for (const out of OUTPUTS) {
    mkdirSync(new URL('.', 'file://' + out), { recursive: true });
    writeFileSync(out, JSON.stringify(results));
  }
  for (const e of results.evaluation) console.log(e.version, `${e.right}/${e.total}`, `accuracy ${(e.accuracy * 100).toFixed(1)}%`, `unclear ${e.unclear}`);
  console.log(results.counts);
}
