// Illustration for the eInvoicing case study.
// Question: what happens to programme status when three tools each use their own words?
//
// All data is synthetic. The three vocabularies are generic examples of how test tools,
// issue trackers and hand-kept spreadsheets tend to label work. No employer system,
// application list or status data is used.

import { makeRng } from './prng.mjs';

export const STATES = ['not_started', 'in_progress', 'blocked', 'complete', 'out_of_scope', 'unclassified'];

export const STATE_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  complete: 'Complete',
  out_of_scope: 'Out of scope',
  unclassified: 'Unclassified',
};

// Each source has its own words. After trimming and lower-casing, these tables decide the shared state.
// RAG colours and "TBC" say how worried someone is, or that nobody knows. They do not say what the status is,
// so they stay "unclassified" until an owner states a status.
export const MAPPINGS = {
  testTool: {
    'not run': 'not_started',
    passed: 'complete',
    failed: 'in_progress',
    blocked: 'blocked',
    'n/a': 'out_of_scope',
  },
  tracker: {
    'to do': 'not_started',
    'in progress': 'in_progress',
    'in review': 'in_progress',
    done: 'complete',
    "won't do": 'out_of_scope',
  },
  spreadsheet: {
    done: 'complete',
    'n/a': 'out_of_scope',
    green: 'unclassified',
    amber: 'unclassified',
    red: 'unclassified',
    tbc: 'unclassified',
  },
};

// The words each source uses for each real state. The spreadsheet is hand-typed, so spelling varies.
const VOCABULARY = {
  testTool: {
    not_started: ['Not Run'],
    in_progress: ['Failed'],
    blocked: ['Blocked'],
    complete: ['Passed'],
    out_of_scope: ['N/A'],
  },
  tracker: {
    not_started: ['To Do'],
    in_progress: ['In Progress', 'In Review'],
    blocked: ['In Progress'], // trackers often have no "blocked" state, so blocked work hides here
    complete: ['Done'],
    out_of_scope: ["Won't Do"],
  },
  spreadsheet: {
    not_started: ['TBC'],
    in_progress: ['amber', 'Amber', 'green', 'Green'],
    blocked: ['RED', 'red'],
    complete: ['done', 'Done ', 'DONE'],
    out_of_scope: ['n/a', 'N/A'],
  },
};

const SOURCES = ['testTool', 'tracker', 'spreadsheet'];

/** Build synthetic application status rows. Each row is what one source says about one application. */
export function buildRows({ seed = 40, applications = 40 } = {}) {
  const rng = makeRng(seed);
  const trueStates = ['not_started', 'in_progress', 'in_progress', 'blocked', 'complete', 'complete', 'complete', 'out_of_scope'];
  const rows = [];
  for (let i = 1; i <= applications; i++) {
    const trueState = rng.pick(trueStates);
    const source = SOURCES[(i - 1) % SOURCES.length];
    const raw = rng.pick(VOCABULARY[source][trueState]);
    rows.push({ application: `App ${String(i).padStart(2, '0')}`, source, trueState, raw });
  }
  return rows;
}

/** Map one raw label to the shared state. Labels with no mapping are reported, never guessed. */
export function normalise(source, raw) {
  const key = raw.trim().toLowerCase();
  const state = MAPPINGS[source]?.[key];
  return state ? { state, mapped: true } : { state: 'unclassified', mapped: false };
}

export function statusIllustration(options) {
  const rows = buildRows(options);
  const normalised = rows.map((r) => ({ ...r, ...normalise(r.source, r.raw) }));

  const rawLabels = new Set(rows.map((r) => r.raw));
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  normalised.forEach((r) => (counts[r.state] += 1));

  const unmapped = [...new Set(normalised.filter((r) => !r.mapped).map((r) => `${r.source}: ${r.raw}`))];
  // How many applications the shared view puts in a different state from the truth the generator started with?
  const wrong = normalised.filter((r) => r.state !== r.trueState && r.state !== 'unclassified').length;
  const hidden = normalised.filter((r) => r.state === 'unclassified').length;

  return {
    applications: rows.length,
    rawLabelCount: rawLabels.size,
    sharedStateCount: STATES.filter((s) => s !== 'unclassified').length,
    counts,
    unmapped,
    unclassified: hidden,
    misclassified: wrong,
  };
}
