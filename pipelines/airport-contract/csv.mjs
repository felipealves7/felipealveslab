// Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, newlines inside quotes). Zero dependencies.
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  // #region scan
  // One pass over the text: commas end fields, line breaks end rows, quotes protect both.
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  // #endregion
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header = [], ...body] = rows;
  return { columns: header, rows: body.filter((r) => !(r.length === 1 && r[0] === '')).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}
