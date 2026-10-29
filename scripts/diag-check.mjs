// Temporary diagnostic: runs `astro check` and copies each error into a GitHub annotation so it can be read without log access. Remove after use.
import { spawnSync } from 'node:child_process';
const r = spawnSync('npx', ['astro', 'check'], { encoding: 'utf8' });
const out = `${r.stdout}\n${r.stderr}`;
console.log(out);
const lines = out.split('\n').filter((l) => /error|Error|✘|\.astro:|\.mjs:|\.ts:/.test(l)).slice(0, 25);
lines.forEach((l, i) => console.log(`::error title=check ${i}::${l.replace(/[\r\n%]/g, ' ').slice(0, 400)}`));
console.log(`::error title=check exit::code ${r.status}, signal ${r.signal}, err ${r.error}`);
process.exit(r.status ?? 1);
