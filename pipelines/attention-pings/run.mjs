// Builds data/attention/results.json for /lab/where-does-my-attention-go from aggregates only.
//
//   node pipelines/attention-pings/run.mjs --empty
//       before collection: writes the file with zero pings
//   ATTENTION_URL=https://... ATTENTION_TOKEN=... node pipelines/attention-pings/run.mjs
//       fetches GET /aggregates from the Worker (counts only; raw answers stay in D1)
//   node pipelines/attention-pings/run.mjs --from aggregates.json
//       uses a saved /aggregates response
//
// Stated priorities come from data/attention/priorities.json, which Felipe commits before the first ping.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarise, comparePriorities, assertAggregateOnly } from './aggregate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESULTS = join(root, 'data/attention/results.json');
export const PRIORITIES = join(root, 'data/attention/priorities.json');
export const COLLECTION = { start: '2026-12-01', end: '2026-12-22' };

export function loadPriorities(path = PRIORITIES) {
  if (!existsSync(path)) return null;
  const p = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(p.projects) && p.projects.length > 0 ? p : null;
}

export function buildResults(aggregates, priorities, today) {
  const summary = aggregates.summary;
  const out = {
    generated: today,
    collection: { ...COLLECTION, ...(aggregates.collection ?? {}) },
    priorities: priorities ? { writtenAt: priorities.writtenAt ?? null, count: priorities.projects.length } : null,
    summary,
    comparison: priorities ? comparePriorities(summary, priorities) : null,
  };
  assertAggregateOnly(out);
  return out;
}

async function main(argv) {
  const today = new Date().toISOString().slice(0, 10);
  const priorities = loadPriorities();
  let aggregates;
  if (argv.includes('--empty')) {
    aggregates = { summary: summarise([], { projects: priorities ? priorities.projects.map((p) => p.name) : [] }) };
  } else if (argv.includes('--from')) {
    aggregates = JSON.parse(readFileSync(argv[argv.indexOf('--from') + 1], 'utf8'));
  } else {
    const { ATTENTION_URL, ATTENTION_TOKEN } = process.env;
    if (!ATTENTION_URL || !ATTENTION_TOKEN) throw new Error('set ATTENTION_URL and ATTENTION_TOKEN, or pass --empty or --from <file>');
    const res = await fetch(`${ATTENTION_URL.replace(/\/$/, '')}/aggregates`, { headers: { authorization: `Bearer ${ATTENTION_TOKEN}` } });
    if (!res.ok) throw new Error(`GET /aggregates returned ${res.status}`);
    aggregates = await res.json();
  }
  const results = buildResults(aggregates, priorities, today);
  writeFileSync(RESULTS, JSON.stringify(results, null, 2) + '\n');
  const p = results.summary.pings;
  console.log(`Wrote ${RESULTS}: ${p.answered} answered of ${p.sent} sent.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
