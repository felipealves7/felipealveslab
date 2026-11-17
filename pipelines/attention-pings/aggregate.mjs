// Turns experience-sampling rows into publishable aggregates: categories and counts only.
// Used inside the Worker (so raw rows never leave D1) and by run.mjs to build the page data.
// No free text is ever collected, and no timestamp, id or single answer is copied to the output.

export const ACTIVITIES = [
  'Focused work',
  'Email and messages',
  'Meetings and calls',
  'Reading and learning',
  'Exercise',
  'Commuting and travel',
  'Eating',
  'Chores and errands',
  'Leisure and entertainment',
  'Socialising',
  'Resting',
  'Other',
];
export const TIME_FOCUS = ['past', 'present', 'future'];
export const NO_PROJECT = 'No project';
// A mood average is published only for a group of at least this many answers,
// so no single answer's mood can be read off the page.
export const MIN_CELL = 5;
// Local-time blocks for the response pattern (start hour inclusive, end hour exclusive).
export const BLOCKS = [[6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]];

/** Wilson score interval for k successes out of n, 95% by default. Returns [low, high] as shares. */
export function wilson(k, n, z = 1.959964) {
  if (n === 0) return null;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [round(Math.max(0, centre - half)), round(Math.min(1, centre + half))];
}

const round = (x, dp = 4) => Math.round(x * 10 ** dp) / 10 ** dp;
const share = (k, n) => (n === 0 ? null : round(k / n));

function blockOf(iso, offsetMinutes) {
  const local = new Date(Date.parse(iso) + offsetMinutes * 60000);
  const h = local.getUTCHours();
  const b = BLOCKS.find(([s, e]) => h >= s && h < e);
  return b ? `${String(b[0]).padStart(2, '0')}–${String(b[1]).padStart(2, '0')}` : 'other';
}

function moodGroup(values) {
  if (values.length < MIN_CELL) return { n: values.length, mean: null, suppressed: true };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { n: values.length, mean: round(mean, 1), suppressed: false };
}

/**
 * rows: one per scheduled ping, as stored in D1 (see schema.sql).
 * projects: the project names offered on the form, in the order Felipe listed them.
 */
export function summarise(rows, { projects = [], offsetMinutes = 240 } = {}) {
  const sent = rows.filter((r) => r.send_status === 'sent');
  const answered = sent.filter((r) => r.answered_at);
  const n = answered.length;

  const count = (list, pred) => list.filter(pred).length;
  const offTask = count(answered, (r) => Number(r.on_task) === 0);
  const projectNames = [...projects, NO_PROJECT];

  for (const r of answered) {
    if (!projectNames.includes(r.project)) throw new Error(`answer names a project not on the list: "${r.project}"`);
    if (!ACTIVITIES.includes(r.activity)) throw new Error(`answer names an unknown activity: "${r.activity}"`);
    if (!TIME_FOCUS.includes(r.time_focus)) throw new Error(`answer has an unknown time focus: "${r.time_focus}"`);
  }

  const blocks = new Map();
  for (const r of sent) {
    const key = blockOf(r.sent_at ?? r.scheduled_at, offsetMinutes);
    const b = blocks.get(key) ?? { block: key, sent: 0, answered: 0 };
    b.sent += 1;
    if (r.answered_at) b.answered += 1;
    blocks.set(key, b);
  }

  const days = new Set(sent.map((r) => r.day));

  return {
    pings: {
      scheduled: rows.length,
      sent: sent.length,
      sendFailed: count(rows, (r) => r.send_status === 'failed'),
      notSent: count(rows, (r) => r.send_status === 'skipped' || r.send_status === 'pending'),
      answered: n,
      missed: sent.length - n,
      answerRate: share(n, sent.length),
      days: days.size,
    },
    responseByBlock: [...blocks.values()].sort((a, b) => a.block.localeCompare(b.block)),
    offTask: { count: offTask, of: n, share: share(offTask, n), interval95: wilson(offTask, n) },
    projects: projectNames.map((name) => {
      const k = count(answered, (r) => r.project === name);
      return { name, count: k, of: n, share: share(k, n), interval95: wilson(k, n) };
    }),
    activities: ACTIVITIES.map((name) => ({ name, count: count(answered, (r) => r.activity === name), of: n })),
    timeFocus: TIME_FOCUS.map((name) => ({ name, count: count(answered, (r) => r.time_focus === name), of: n })),
    mood: {
      all: moodGroup(answered.map((r) => Number(r.mood))),
      onTask: moodGroup(answered.filter((r) => Number(r.on_task) === 1).map((r) => Number(r.mood))),
      offTask: moodGroup(answered.filter((r) => Number(r.on_task) === 0).map((r) => Number(r.mood))),
      minCell: MIN_CELL,
    },
  };
}

/** Rank values high to low; ties share the average of their ranks. */
export function rankDescending(values) {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const ranks = new Array(values.length);
  for (let pos = 0; pos < order.length; ) {
    let end = pos;
    while (end + 1 < order.length && order[end + 1].v === order[pos].v) end += 1;
    const avg = (pos + end) / 2 + 1;
    for (let j = pos; j <= end; j++) ranks[order[j].i] = avg;
    pos = end + 1;
  }
  return ranks;
}

/**
 * Stated priorities against reported attention: one row per ranked project, in stated order.
 * priorities: { writtenAt, projects: [{ name, rank }] } as committed by Felipe before the first ping.
 */
export function comparePriorities(summary, priorities) {
  if (!priorities || !Array.isArray(priorities.projects) || priorities.projects.length === 0) return null;
  const byName = new Map(summary.projects.map((p) => [p.name, p]));
  for (const p of priorities.projects) {
    if (!byName.has(p.name)) throw new Error(`stated priority "${p.name}" is not a project on the form`);
  }
  const stated = [...priorities.projects].sort((a, b) => a.rank - b.rank);
  const counts = stated.map((p) => byName.get(p.name).count);
  const reported = summary.offTask.of === 0 ? stated.map(() => null) : rankDescending(counts);
  return stated.map((p, i) => {
    const s = byName.get(p.name);
    return { name: p.name, statedRank: p.rank, count: s.count, of: s.of, share: s.share, interval95: s.interval95, reportedRank: reported[i] };
  });
}

// Field names that would mean a row-level record leaked into the published file.
const ROW_LEVEL_KEYS = new Set(['id', 'ping_id', 'scheduled_at', 'sent_at', 'answered_at', 'mood_value', 'rows', 'answers', 'note', 'text']);

/** Throws if the object carries anything that looks like a single entry rather than an aggregate. */
export function assertAggregateOnly(obj, path = '$') {
  if (Array.isArray(obj)) return obj.forEach((v, i) => assertAggregateOnly(v, `${path}[${i}]`));
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (ROW_LEVEL_KEYS.has(k)) throw new Error(`row-level field "${k}" at ${path}`);
      assertAggregateOnly(v, `${path}.${k}`);
    }
  }
}
