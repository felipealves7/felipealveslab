// Validates model-written SQL before it can reach D1. Pure function, no dependencies.
// Rules (issue #12): one statement, SELECT or WITH only, no write/admin keywords,
// only tables from the ledger schema, LIMIT 100 appended when none is present.

export const ALLOWED_TABLES = ['ledger'];
export const MAX_ROWS = 100;

const FORBIDDEN = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'ATTACH', 'DETACH', 'PRAGMA', 'REPLACE', 'VACUUM', 'REINDEX', 'LOAD_EXTENSION'];
const ENDS_FROM = new Set(['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'UNION', 'INTERSECT', 'EXCEPT', 'WINDOW', 'ON', 'USING']);

const fail = (reason) => ({ ok: false, reason });

/** Returns { ok: true, sql } with the query to run, or { ok: false, reason }. */
export function validateSql(input, allowedTables = ALLOWED_TABLES) {
  if (typeof input !== 'string' || !input.trim()) return fail('empty query');
  let sql = input.trim();
  if (sql.endsWith(';')) sql = sql.slice(0, -1).trim();
  if (/--|\/\*|\*\/|"|`|\[|\]/.test(sql.replace(/'(?:[^']|'')*'/g, ' 0 '))) {
    return fail('comments and quoted identifiers are not allowed');
  }
  const bare = sql.replace(/'(?:[^']|'')*'/g, ' 0 ');
  if (bare.includes("'")) return fail('unbalanced quote');
  if (bare.includes(';')) return fail('more than one statement');

  const tokens = bare.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|\S/g) ?? [];
  const up = tokens.map((t) => t.toUpperCase());
  if (up[0] !== 'SELECT' && up[0] !== 'WITH') return fail('must start with SELECT or WITH');
  const bad = up.find((t) => FORBIDDEN.includes(t));
  if (bad) return fail(`${bad} is not allowed`);

  const allowed = new Set(allowedTables.map((t) => t.toLowerCase()));
  const frames = [{ fromList: false }];
  let expectTable = false;
  let hasLimit = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = up[i];
    const frame = frames[frames.length - 1];
    if (t === '(') {
      expectTable = false; // a subquery after FROM is checked on its own tokens
      frames.push({ fromList: false });
      continue;
    }
    if (t === ')') {
      if (frames.length === 1) return fail('unbalanced parentheses');
      frames.pop();
      continue;
    }
    if (expectTable) {
      expectTable = false;
      if (!/^[A-Z_]/.test(t)) return fail('expected a table name');
      if (up[i + 1] === '.' || up[i + 1] === '(') return fail('only plain table names are allowed');
      if (!allowed.has(tokens[i].toLowerCase())) return fail(`table "${tokens[i]}" is not in the ledger schema`);
      continue;
    }
    // CTE names: WITH name AS ( ... ) [, name AS ( ... )]
    if (frames.length === 1 && (up[i - 1] === 'WITH' || up[i - 1] === ',' || up[i - 1] === 'RECURSIVE') && up[i + 1] === 'AS' && up[i + 2] === '(' && !frame.fromList) {
      allowed.add(tokens[i].toLowerCase());
      continue;
    }
    if (t === 'FROM') {
      frame.fromList = true;
      expectTable = true;
    } else if (t === 'JOIN') {
      expectTable = true;
    } else if (t === ',' && frame.fromList) {
      expectTable = true;
    } else if (ENDS_FROM.has(t)) {
      frame.fromList = false;
    }
    if (t === 'LIMIT' && frames.length === 1) hasLimit = true;
  }
  if (frames.length !== 1) return fail('unbalanced parentheses');
  if (expectTable) return fail('expected a table name');

  return { ok: true, sql: hasLimit ? sql : `${sql} LIMIT ${MAX_ROWS}` };
}
