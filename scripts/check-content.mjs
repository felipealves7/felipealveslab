// Repository checks run by CI (job "test"). Zero dependencies.
// 1. Lab pages, data and pipelines must not mention employer names.
// 2. No tracked file may contain something that looks like a secret.
// 3. Every Lab page must contain the required headings, in order.
// 4. No element id on a Lab page may repeat or equal a heading's anchor.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EMPLOYER_TERMS = [/emirates/i, /dnata/i];

export const SECRET_PATTERNS = [
  { name: 'Anthropic key', re: /sk-ant-[A-Za-z0-9_-]{10,}/ },
  { name: 'GitHub token', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
  { name: 'GitHub fine-grained token', re: /github_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Private key block', re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
];

export const REQUIRED_HEADINGS = [
  '## The question',
  '## The live piece',
  '## Method and results',
  '## Known limits and running cost',
  '## How it was built',
  '## My take',
];

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.astro']);

export function findEmployerTerms(text) {
  return EMPLOYER_TERMS.filter((re) => re.test(text)).map((re) => re.source);
}

export function findSecrets(text) {
  return SECRET_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

// Lines outside fenced code blocks, so a "#" comment inside code is not read as a heading.
function proseLines(markdown) {
  const out = [];
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (!fenced) out.push(line);
  }
  return out;
}

// The anchor Astro gives a heading: github-slugger's rules for ASCII text. Lower case, punctuation
// removed, each space turned into a hyphen; a repeated anchor gets -1, -2 and so on.
export function headingSlugs(markdown) {
  const occurrences = new Map();
  const slugs = [];
  for (const line of proseLines(markdown)) {
    const md = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    const html = /<h[1-6](?![^>]*\bid=)[^>]*>(.*?)<\/h[1-6]>/i.exec(line);
    const raw = md ? md[1] : html ? html[1].replace(/<[^>]+>/g, '') : null;
    if (raw === null) continue;
    const text = raw.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '');
    const base = text.toLowerCase().replace(/[\0-\x1F!-,./:-@[-^`{-~]/g, '').replace(/ /g, '-');
    let slug = base;
    while (occurrences.has(slug)) {
      occurrences.set(base, occurrences.get(base) + 1);
      slug = `${base}-${occurrences.get(base)}`;
    }
    occurrences.set(slug, 0);
    slugs.push(slug);
  }
  return slugs;
}

// Element ids written on the page that clash with a heading's anchor or with each other.
// document.getElementById returns the first match, so a clash makes a script fill the wrong element.
export function idClashes(markdown) {
  const anchors = new Set(headingSlugs(markdown));
  const seen = new Set();
  const clashes = [];
  for (const line of proseLines(markdown)) {
    for (const m of line.matchAll(/\bid=["']([^"']+)["']/g)) {
      const id = m[1];
      if (anchors.has(id)) clashes.push(`id "${id}" is also a heading's anchor`);
      else if (seen.has(id)) clashes.push(`id "${id}" is used twice`);
      seen.add(id);
    }
  }
  return clashes;
}

export function missingHeadings(markdown) {
  const lines = markdown.split(/\r?\n/).map((l) => l.trimEnd());
  const missing = [];
  let from = 0;
  for (const heading of REQUIRED_HEADINGS) {
    const idx = lines.indexOf(heading, from);
    if (idx === -1) missing.push(heading);
    else from = idx + 1;
  }
  return missing;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function run(root) {
  const problems = [];
  const files = walk(root);
  const guarded = ['src/content/lab/', 'data/', 'pipelines/'];
  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/');
    if (!/\.(md|mdx|astro|ts|js|mjs|json|ya?ml|csv|txt|py|sql|toml|html|css)$/i.test(rel)) continue;
    const text = readFileSync(file, 'utf8');
    if (rel !== 'scripts/check-content.mjs' && !rel.startsWith('scripts/')) {
      for (const s of findSecrets(text)) problems.push(`${rel}: looks like a secret (${s})`);
    }
    if (guarded.some((g) => rel.startsWith(g)) && !rel.endsWith('_template.md')) {
      for (const t of findEmployerTerms(text)) problems.push(`${rel}: mentions an employer term (${t})`);
    }
    if (rel.startsWith('src/content/lab/') && rel.endsWith('.md') && !rel.split('/').pop().startsWith('_')) {
      for (const h of missingHeadings(text)) problems.push(`${rel}: missing or out-of-order heading "${h}"`);
      for (const c of idClashes(text)) problems.push(`${rel}: ${c}; rename the element's id`);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = run(process.cwd());
  if (problems.length) {
    console.error('Repository checks failed:\n' + problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('Repository checks passed.');
}
