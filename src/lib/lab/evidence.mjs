// Build-time summaries of checked-in Lab evidence. No synthetic display values and no network.
// This module intentionally receives parsed JSON so tests and Astro use the same functions.
const fmt = (value) => new Intl.NumberFormat('en-GB').format(value);
const count = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

function whole(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label} in checked-in Lab evidence`);
  return value;
}

export function ledgerEvidence(data) {
  if (data?.synthetic !== true || data?.translator?.includes('keyword rules') !== true) {
    throw new Error('Unexpected Ledger evidence provenance or translator');
  }
  const source = 'data/ask-the-ledger/results.json';
  const s = data.summary;
  const bars = [
    { key: 'correct_answer', label: 'Correct answers', value: whole(s.correct_answer, 'correct answers'), tone: 'positive' },
    { key: 'correct_refusal', label: 'Correct refusals', value: whole(s.correct_refusal, 'correct refusals'), tone: 'positive' },
    { key: 'wrong_answer', label: 'Wrong answers', value: whole(s.wrong_answer, 'wrong answers'), tone: 'negative' },
    { key: 'wrongly_refused', label: 'Wrong refusals', value: whole(s.wrongly_refused, 'wrong refusals'), tone: 'negative' },
  ];
  const total = whole(s.total, 'question total');
  if (total === 0 || bars.reduce((sum, bar) => sum + bar.value, 0) !== total || data.questions?.length !== total) {
    throw new Error('Ledger outcome totals do not match the saved questions');
  }
  return {
    title: 'Rule-based translator: outcomes',
    subtitle: `${fmt(total)} saved evaluation questions · synthetic finance ledger`,
    source,
    provenance: 'In source',
    unit: 'questions',
    bars: bars.map((b) => ({ ...b, percent: (b.value / total) * 100 })),
    summary: `${count(s.correct_answer + s.correct_refusal, 'correct outcome')}; ${count(s.wrong_answer, 'wrong answer')} and ${count(s.wrongly_refused, 'wrong refusal')}. This is not a model-accuracy score.`,
  };
}

export function airportEvidence(data) {
  if (data?.synthetic !== false || !Array.isArray(data.runs)) {
    throw new Error('Unexpected Airport evidence provenance');
  }
  // Rehearsed failures are deliberate and must not be counted as upstream incidents.
  const run = [...data.runs].reverse().find((r) => r.deliberate === false);
  if (!run || !['pass', 'fail'].includes(run.status)) throw new Error('No saved non-rehearsal Airport run');
  if (!Number.isFinite(Date.parse(run.runDate))) throw new Error('Invalid Airport run date');
  const rows = ['airports', 'runways', 'countries'].map((key) => ({ key, label: key[0].toUpperCase() + key.slice(1), value: whole(run.rows[key], `${key} rows`) }));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (!total) throw new Error('Saved Airport run contains no rows');
  const rules = run.checks?.length;
  if (!Number.isSafeInteger(rules) || rules === 0) throw new Error('Saved Airport run lacks checks');
  // One cell per contract check: pass, tolerated (passed within its documented tolerance) or fail.
  const cells = run.checks.map((c) => ({
    id: String(c.id ?? ''),
    says: String(c.says ?? c.id ?? ''),
    status: !c.passed ? 'fail' : c.failed > 0 ? 'tolerated' : 'pass',
  }));
  const tally = (status) => cells.filter((c) => c.status === status).length;
  const [pass, tolerated, fail] = [tally('pass'), tally('tolerated'), tally('fail')];
  return {
    title: 'Airport contract: validation checks',
    subtitle: `${run.runDate.slice(0, 10)} · last checked-in non-rehearsal run · ${run.status}`,
    source: 'data/airport-contract/results.json',
    provenance: 'In source',
    unit: 'checks',
    bars: [],
    cells,
    tally: { pass, tolerated, fail },
    rows,
    rowsLine: `${rows.map((r) => `${fmt(r.value)} ${r.key}`).join(' · ')} checked`,
    summary: `${count(rules, 'check')}: ${fmt(pass)} passed, ${fmt(tolerated)} within a documented tolerance, ${fmt(fail)} failed, across ${fmt(total)} rows in three source tables. This is not a claim about upstream accuracy or current live status.`,
  };
}
