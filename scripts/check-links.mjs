// Checks that every internal link, asset and stylesheet the site refers to exists.
// Runs without building the site, so it works in `npm test` and on machines with no network.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

/** Does an internal path such as "/milestones" or "/assets/felipe.jpg" exist in the repo? */
export function targetExists(root, path) {
  const clean = path.split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') return existsSync(join(root, 'src/pages/index.astro'));
  const rel = clean.replace(/^\//, '');
  return (
    existsSync(join(root, 'public', rel)) ||
    existsSync(join(root, 'src/pages', `${rel}.astro`)) ||
    existsSync(join(root, 'src/pages', rel, 'index.astro')) ||
    // Lab pages are generated from src/content/lab/<slug>.md by src/pages/lab/[slug].astro
    (/^lab\/[^/]+$/.test(rel) && existsSync(join(root, 'src/content/lab', `${rel.slice(4)}.md`)))
  );
}

/** Internal references found in a file's text: href="/x", src="/x", poster="/x", url('/x'). */
export function internalRefs(text) {
  const refs = [];
  for (const m of text.matchAll(/\b(?:href|src|poster)="(\/[^"]*)"/g)) refs.push(m[1]);
  for (const m of text.matchAll(/url\(['"]?(\/[^'")]+)['"]?\)/g)) refs.push(m[1]);
  return refs;
}

/** Stylesheets and scripts that pages hand to the layout by name. */
export function layoutAssets(text) {
  const out = [];
  const css = text.match(/css=\{\[([^\]]*)\]\}/);
  if (css) for (const m of css[1].matchAll(/'([^']+)'/g)) out.push(`/css/${m[1]}.css`);
  const script = text.match(/\bscript="([^"]+)"/);
  if (script) out.push(`/js/${script[1]}.js`);
  return out;
}

export function checkLinks(root) {
  const problems = [];
  const sources = [
    ...walk(join(root, 'src'), ['.astro']),
    ...walk(join(root, 'public/css'), ['.css']),
  ];
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    const refs = [...internalRefs(text), ...layoutAssets(text)];
    for (const ref of refs) {
      if (!targetExists(root, ref)) problems.push(`${relative(root, file)}: ${ref}`);
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkLinks(process.cwd());
  if (problems.length) {
    console.error('Broken internal references:\n' + problems.map((p) => `  ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('All internal references resolve.');
}
