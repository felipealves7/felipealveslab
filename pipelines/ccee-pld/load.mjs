// Reads one CCEE PLD_HORARIO yearly file exactly as downloaded. Zero dependencies.
// The files come in two shapes (see data/ccee-pld-horario/README.md): 2021 to 2024 quote every text
// field and use CRLF line endings; 2025 and 2026 use no quotes and LF. Row order also differs.
// This reader accepts both and reports which shape it saw, so a third shape shows up in the run record.

/** Split one semicolon-separated line. Fields may be wrapped in double quotes; "" inside is a quote. */
export function splitLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

/**
 * Parse a file's text. Returns the header, the rows as objects of raw strings (nothing coerced yet,
 * so the contract sees what CCEE wrote), and the shape: quoting, line endings and row order.
 */
export function parsePldFile(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lineEnding = text.includes('\r\n') ? 'CRLF' : 'LF';
  const lines = text.split(/\r?\n/).filter((l) => l !== '');
  const [headerLine = '', ...body] = lines;
  const columns = splitLine(headerLine);
  const rows = body.map((l) => {
    const f = splitLine(l);
    return Object.fromEntries(columns.map((c, i) => [c, f[i] ?? '']));
  });
  return {
    columns,
    rows,
    shape: {
      quoted: headerLine.startsWith('"'),
      lineEnding,
      order: dayOrder(rows),
      // Unquoted rows whose DIA is written with a leading zero ("07"). Quoted files pad every day.
      zeroPaddedDays: headerLine.startsWith('"') ? null : rows.filter((r) => /^0\d/.test(r.DIA ?? '')).length,
    },
  };
}

// Order of the days: "oldest first", "newest first" or "mixed", judged by MES_REFERENCIA and DIA.
// Hours within a day can run either way; only the days are judged.
function dayOrder(rows) {
  let up = 0;
  let down = 0;
  let prev = null;
  for (const r of rows) {
    const t = `${r.MES_REFERENCIA}|${String(Number(r.DIA)).padStart(2, '0')}`;
    if (prev !== null && t > prev) up++;
    if (prev !== null && t < prev) down++;
    prev = t;
  }
  if (down === 0) return 'oldest first';
  if (up === 0) return 'newest first';
  return 'mixed';
}

/** The key that identifies one hourly price: month, submarket, day and hour, numbers unpadded. */
export function rowKey(r) {
  return `${r.MES_REFERENCIA}|${r.SUBMERCADO}|${Number(r.DIA)}|${Number(r.HORA)}`;
}

/** ISO date (YYYY-MM-DD) for a row, or null if the month or day cannot be read. */
export function rowDate(r) {
  const m = /^(\d{4})(\d{2})$/.exec(r.MES_REFERENCIA ?? '');
  const d = Number(r.DIA);
  if (!m || !Number.isInteger(d)) return null;
  return `${m[1]}-${m[2]}-${String(d).padStart(2, '0')}`;
}
