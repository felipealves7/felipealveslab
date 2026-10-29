// Collects the model's SQL for the scorecard questions and scores it. Needs a running Worker.
//
//   cd pipelines/ledger-api
//   npx wrangler dev --remote --var ALLOW_LOCALHOST:1 --var VISITOR_CAP:100 --var DAILY_CAP:100
//   node collect.mjs http://localhost:8787 http://localhost:8080
//
// The second argument is the Origin header to send (must be a localhost origin in dev).
// It writes data/ask-the-ledger/scorecard.json and its public copy. Nothing here needs a key:
// wrangler uses your own Cloudflare login. The raised caps apply to your local run only.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scorecardQuestions, scoreGenerated } from './scorecard.mjs';
import { scorecardFile } from './build-data.mjs';

const [base, origin = 'http://localhost:8080'] = process.argv.slice(2);
if (!base) {
  console.error('usage: node collect.mjs <worker url> [origin]');
  process.exit(1);
}

const generated = [];
for (const q of scorecardQuestions()) {
  const res = await fetch(`${base}/ask`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ question: q.text }) });
  const body = await res.json().catch(() => ({}));
  // A rejected or failed request has no sql to run; "REJECTED" fails validation, so it scores as wrong.
  if (body.ok) generated.push({ id: q.id, sql: body.declined ? null : body.sql });
  else generated.push({ id: q.id, sql: 'REJECTED' });
  console.log(q.id, res.status, body.code ?? 'ok');
}

const card = scoreGenerated(generated);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const json = scorecardFile({ ...card, collectedAt: new Date().toISOString().slice(0, 10), model: process.env.SCORECARD_MODEL ?? 'not recorded' });
for (const out of ['data/ask-the-ledger/scorecard.json', 'public/data/ask-the-ledger/scorecard.json']) writeFileSync(join(root, out), json);
console.log(`${card.correct} of ${card.run} correct`);
