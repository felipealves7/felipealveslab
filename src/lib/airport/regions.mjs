// Code regions for the Lab page. The pipeline files mark the lines the page shows with
// "// #region name" and "// #endregion". The page reads the files themselves at build time, so what
// a visitor sees is the code that runs, never a copy that could drift. Pure; tested in
// scripts/airport-page.test.mjs.

const OPEN = /^\s*\/\/\s*#region\s+([\w-]+)/;
const CLOSE = /^\s*\/\/\s*#endregion\b/;

// Remove the indentation every non-empty line shares.
export function dedent(lines) {
  const indents = lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)[0].length);
  const cut = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(cut)).join('\n').replace(/\s+$/, '');
}

// Returns { name: { code, from, to } }, where from and to are 1-based line numbers in the file.
// Regions may nest; marker lines are never part of any region's code.
export function regions(source) {
  const out = {};
  const open = [];
  source.split(/\r?\n/).forEach((line, i) => {
    const start = OPEN.exec(line);
    if (start) {
      open.push({ name: start[1], lines: [], from: null, to: null });
      return;
    }
    if (CLOSE.test(line)) {
      const r = open.pop();
      if (r) out[r.name] = { code: dedent(r.lines), from: r.from, to: r.to };
      return;
    }
    for (const r of open) {
      r.lines.push(line);
      if (r.from === null) r.from = i + 1;
      r.to = i + 1;
    }
  });
  return out;
}
