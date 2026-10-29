// Removes chat session links (CLAUDE.md rule 8) from issues, pull requests and comments.
// Claude Code adds a session link to text it posts. The `chat-privacy` workflow runs this on
// every issue, pull request and comment event and edits that text in place. The event text is
// treated as data: it is matched with fixed patterns and never run. Zero dependencies.
//
//   node scripts/strip-session-links.mjs           clean the item named in $GITHUB_EVENT_PATH
//   node scripts/strip-session-links.mjs --sweep   clean every issue, pull request and comment

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SESSION_URL = String.raw`(?:https?:\/\/)?claude\.ai\/code\/session[^\s)\]>"'\x60]*`;
// Link labels are capped at 300 characters so a crafted comment cannot make the match slow.
const MARKDOWN_LINK = new RegExp(String.raw`\[([^\]\n]{0,300})\]\(\s*${SESSION_URL}\s*\)`, 'gi');
const BARE_URL = new RegExp(SESSION_URL, 'gi');
const SESSION_ID = /\b(?:session|cse)_01[A-Za-z0-9]{8,}\b/g;
const TRAILER = /^\s*Claude-Session:/i;
const PLACEHOLDER = '[session link removed]';

/** Does the text hold a session link, session id or Claude-Session line? */
export function hasSessionLink(text) {
  if (typeof text !== 'string' || text === '') return false;
  return stripSessionLinks(text) !== text;
}

/**
 * Returns the text without session links. Text with none comes back unchanged (same string).
 * A markdown link to a session keeps its label; a bare link becomes a placeholder; a line that
 * held nothing but a link, or a `Claude-Session:` line, is dropped.
 */
export function stripSessionLinks(text) {
  if (typeof text !== 'string' || text === '') return text;
  let changed = false;
  const kept = [];
  for (const line of text.split('\n')) {
    if (TRAILER.test(line)) {
      changed = true;
      continue;
    }
    const clean = line
      .replace(MARKDOWN_LINK, '$1')
      .replace(BARE_URL, PLACEHOLDER)
      .replace(SESSION_ID, PLACEHOLDER);
    if (clean === line) {
      kept.push(line);
      continue;
    }
    changed = true;
    const rest = clean.split(PLACEHOLDER).join('').replace(/[\s_*`<>()[\]-]/g, '');
    if (rest !== '') kept.push(clean);
  }
  if (!changed) return text;
  let out = kept.join('\n').replace(/\s+$/, '');
  // A footer rule left with nothing under it.
  if (/(^|\n)\s*-{3,}$/.test(out)) out = out.replace(/(^|\n)\s*-{3,}$/, '').replace(/\s+$/, '');
  return out;
}

/** Which API item an event points at, or null when there is nothing to check. */
export function targetFor(eventName, payload, repo) {
  const n = (v) => (Number.isInteger(v) && v > 0 ? v : null);
  const issue = n(payload?.issue?.number);
  const pull = n(payload?.pull_request?.number);
  const comment = n(payload?.comment?.id);
  const review = n(payload?.review?.id);
  switch (eventName) {
    case 'issues':
      return issue && { kind: `issue #${issue}`, path: `/repos/${repo}/issues/${issue}`, method: 'PATCH' };
    case 'pull_request':
      return pull && { kind: `pull request #${pull}`, path: `/repos/${repo}/pulls/${pull}`, method: 'PATCH' };
    case 'issue_comment':
      return comment && { kind: `comment ${comment}`, path: `/repos/${repo}/issues/comments/${comment}`, method: 'PATCH' };
    case 'pull_request_review_comment':
      return comment && { kind: `review comment ${comment}`, path: `/repos/${repo}/pulls/comments/${comment}`, method: 'PATCH' };
    case 'pull_request_review':
      return pull && review && { kind: `review ${review}`, path: `/repos/${repo}/pulls/${pull}/reviews/${review}`, method: 'PUT' };
    default:
      return null;
  }
}

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'felipealveslab-chat-privacy',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`${method} ${path}: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function clean(target, currentBody) {
  const body = currentBody ?? (await api('GET', target.path)).body;
  if (!hasSessionLink(body)) return false;
  await api(target.method, target.path, { body: stripSessionLinks(body) });
  console.log(`Removed a session link from ${target.kind}.`);
  return true;
}

async function* pages(path) {
  for (let page = 1; ; page++) {
    const items = await api('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    yield* items;
    if (items.length < 100) return;
  }
}

async function sweep(repo) {
  let checked = 0;
  let cleaned = 0;
  const tally = async (target, body) => {
    checked++;
    try {
      if (await clean(target, body ?? '')) cleaned++;
    } catch (err) {
      console.log(`Could not clean ${target.kind}: ${err.message}`);
    }
  };
  const pulls = [];
  for await (const it of pages(`/repos/${repo}/issues?state=all`)) {
    await tally({ kind: `#${it.number}`, path: `/repos/${repo}/issues/${it.number}`, method: 'PATCH' }, it.body);
    if (it.pull_request) pulls.push(it.number);
  }
  for await (const c of pages(`/repos/${repo}/issues/comments`)) {
    await tally({ kind: `comment ${c.id}`, path: `/repos/${repo}/issues/comments/${c.id}`, method: 'PATCH' }, c.body);
  }
  for await (const c of pages(`/repos/${repo}/pulls/comments`)) {
    await tally({ kind: `review comment ${c.id}`, path: `/repos/${repo}/pulls/comments/${c.id}`, method: 'PATCH' }, c.body);
  }
  for (const p of pulls) {
    for await (const r of pages(`/repos/${repo}/pulls/${p}/reviews`)) {
      await tally({ kind: `review ${r.id}`, path: `/repos/${repo}/pulls/${p}/reviews/${r.id}`, method: 'PUT' }, r.body);
    }
  }
  console.log(`Sweep: checked ${checked} items, cleaned ${cleaned}.`);
}

export async function main(argv = process.argv.slice(2)) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!process.env.GITHUB_TOKEN || !repo) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY must be set; this runs in GitHub Actions.');
  }
  const event = process.env.GITHUB_EVENT_NAME;
  if (argv.includes('--sweep') || event === 'workflow_dispatch') return sweep(repo);
  const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const target = targetFor(event, payload, repo);
  if (!target) {
    console.log(`Nothing to check for a ${event} event.`);
    return;
  }
  try {
    if (!(await clean(target))) console.log(`No session link in ${target.kind}.`);
  } catch (err) {
    // Pull requests from forks get a read-only token. Nothing to do there.
    if (err.status === 403) console.log(`No write access for ${target.kind}; skipped.`);
    else throw err;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
