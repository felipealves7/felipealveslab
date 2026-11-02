// Validates model-written SQL before it can reach D1. Pure function, no dependencies.
// Rules (issue #12): one statement, SELECT or WITH only, no write/admin keywords,
// only tables from the ledger schema, LIMIT 100 appended when none is present.
// Added 2026-11-02 after an external review of the evaluation:
// - every LIMIT is a whole number (LIMIT -1 used to pass and return all 1,008 rows);
// - no recursive queries, set operations or blob-allocating functions;
// - the ledger is never joined, not even with itself, and no FROM list names a table twice,
//   so one question cannot multiply 1,008 rows into a billion-row scan.
// A rule check cannot bound every slow query (correlated subqueries still can); see the page's limits.

export const ALLOWED_TABLES = ['ledger'];
export const MAX_ROWS = 100;
export const MAX_SQL_CHARS = 4000;

const FORBIDDEN = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'ATTACH', 'DETACH', 'PRAGMA', 'REPLACE', 'VACUUM', 'REINDEX', 'LOAD_EXTENSION'];
const OUT_OF_SCOPE = ['RECURSIVE', 'UNION', 'INTERSECT', 'EXCEPT'];
const ALLOCATING = ['RANDOMBLOB', 'ZEROBLOB', 'PRINTF', 'FORMAT'];
const ENDS_FROM = new Set(['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'UNION', 'INTERSECT', 'EXCEPT', 'WINDOW', 'ON', 'USING']);
const WHOLE = /^\d+$/;

const fail = (reason) => ({ ok: false, reason });

/** Why a FROM list with these sources may not run, or null when it may. */
function joinProblem(sources) {
  if (sources.length < 2) return null;
  if (sources.includes('ledger')) return 'the ledger table cannot be joined, not even with itself';
  if (new Set(sources).size !== sources.length) return 'a table can appear only once in a FROM list';
  return null;
}

/** "LIMIT n" or "LIMIT n OFFSET m", whole numbers only, then the end of the query or a ")". */
function limitProblem(up, i) {
  if (!WHOLE.test(up[i + 1] ?? '')) return 'LIMIT must be a whole number';
  let next = i + 2;
  if (up[next] === 'OFFSET') {
    if (!WHOLE.test(up[next + 1] ?? '')) return 'OFFSET must be a whole number';
    next += 2;
  }
  if (up[next] !== undefined && up[next] !== ')') return 'LIMIT must be a single whole number, with no expression or comma';
  return null;
}

/** Returns { ok: true, sql } with the query to run, or { ok: false, reason }. */
export function validateSql(input, allowedTables = ALLOWED_TABLES) {
  if (typeof input !== 'string' || !input.trim()) return fail('empty query');
  if (input.length > MAX_SQL_CHARS) return fail(`query longer than ${MAX_SQL_CHARS} characters`);
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
  const scope = up.find((t) => OUT_OF_SCOPE.includes(t));
  if (scope) return fail(`${scope} is outside this demo's scope`);
  const alloc = up.findIndex((t, k) => ALLOCATING.includes(t) && up[k + 1] === '(');
  if (alloc !== -1) return fail(`${up[alloc]}() is not allowed`);

  const allowed = new Set(allowedTables.map((t) => t.toLowerCase()));
  const frames = [{ fromList: false, sources: [] }];
  let expectTable = false;
  let hasLimit = false;
  let readsLedger = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = up[i];
    const frame = frames[frames.length - 1];
    if (t === '(') {
      if (expectTable) frame.sources.push(`(subquery ${i})`); // checked on its own tokens
      expectTable = false;
      frames.push({ fromList: false, sources: [] });
      continue;
    }
    if (t === ')') {
      if (frames.length === 1) return fail('unbalanced parentheses');
      const problem = joinProblem(frames.pop().sources);
      if (problem) return fail(problem);
      continue;
    }
    if (expectTable) {
      expectTable = false;
      if (!/^[A-Z_]/.test(t)) return fail('expected a table name');
      if (up[i + 1] === '.' || up[i + 1] === '(') return fail('only plain table names are allowed');
      const name = tokens[i].toLowerCase();
      if (!allowed.has(name)) return fail(`table "${tokens[i]}" is not in the ledger schema`);
      frame.sources.push(name);
      if (name === 'ledger') readsLedger = true;
      continue;
    }
    // CTE names: WITH name AS ( ... ) [, name AS ( ... )]
    if (frames.length === 1 && (up[i - 1] === 'WITH' || up[i - 1] === ',') && up[i + 1] === 'AS' && up[i + 2] === '(' && !frame.fromList) {
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
    if (t === 'LIMIT') {
      const problem = limitProblem(up, i);
      if (problem) return fail(problem);
      if (frames.length === 1) hasLimit = true;
    }
  }
  if (frames.length !== 1) return fail('unbalanced parentheses');
  if (expectTable) return fail('expected a table name');
  const problem = joinProblem(frames[0].sources);
  if (problem) return fail(problem);
  if (!readsLedger) return fail('the query must read the ledger table');

  if (!hasLimit) return { ok: true, sql: `${sql} LIMIT ${MAX_ROWS}` };
  // The outer LIMIT is last (checked above); one above the row cap is lowered to it.
  return { ok: true, sql: sql.replace(/\bLIMIT\s+(\d+)(\s+OFFSET\s+\d+)?$/i, (m, n, off = '') => (Number(n) > MAX_ROWS ? `LIMIT ${MAX_ROWS}${off}` : m)) };
}
