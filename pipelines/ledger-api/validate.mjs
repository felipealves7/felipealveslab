// Checks model-written SQL before it gets near the database.
// The database holds synthetic data only, so this is a seat belt, not the only defence.

import { TABLES } from './schema.mjs';

export const ROW_LIMIT = 100;

const BANNED = ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'attach', 'detach', 'pragma', 'replace', 'vacuum', 'reindex'];
const NOT_ALIAS = new Set(['where', 'group', 'order', 'having', 'limit', 'union', 'intersect', 'except', 'on', 'using', 'join', 'left', 'right', 'inner', 'cross', 'outer', 'natural', 'window']);

/** Replace string literals with '' so words inside them are not mistaken for SQL. */
function blankStrings(sql) {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

/**
 * Returns { ok: true, sql } with a row limit applied, or { ok: false, reason }.
 */
export function validateSql(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'no query' };
  let sql = input.trim();
  if (sql.endsWith(';')) sql = sql.slice(0, -1).trimEnd();
  if (!sql) return { ok: false, reason: 'empty query' };

  const bare = blankStrings(sql);
  if (/["`\[\]]/.test(bare)) return { ok: false, reason: 'quoted identifiers are not allowed' };
  if (/--|\/\*/.test(bare)) return { ok: false, reason: 'comments are not allowed' };
  if (bare.includes(';')) return { ok: false, reason: 'more than one statement' };
  if (/sqlite_/i.test(bare)) return { ok: false, reason: 'system tables are not allowed' };

  const tokens = bare.toLowerCase().match(/[a-z_][a-z0-9_]*|\d+(?:\.\d+)?|[(),.*=<>!+\-/%|]/g) ?? [];
  if (tokens[0] !== 'select' && tokens[0] !== 'with') return { ok: false, reason: 'must start with SELECT or WITH' };
  const banned = tokens.find((t) => BANNED.includes(t));
  if (banned) return { ok: false, reason: `${banned.toUpperCase()} is not allowed` };

  const ctes = new Set();
  for (const m of bare.matchAll(/(?:\bwith(?:\s+recursive)?|,)\s*([a-z_]\w*)\s*(?:\([^)]*\))?\s*as\s*\(/gi)) ctes.add(m[1].toLowerCase());
  const allowed = new Set([...TABLES, ...ctes]);

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'from' && tokens[i] !== 'join') continue;
    let j = i + 1;
    for (;;) {
      if (tokens[j] === '(') break; // subquery: its own FROM is checked on its own
      const name = tokens[j];
      if (!name || !/^[a-z_]/.test(name)) return { ok: false, reason: 'could not read a table name' };
      if (tokens[j + 1] === '.') return { ok: false, reason: 'schema-qualified names are not allowed' };
      if (!allowed.has(name)) return { ok: false, reason: `table "${name}" is not in the ledger schema` };
      j += 1;
      if (tokens[j] === 'as') j += 2;
      else if (/^[a-z_]/.test(tokens[j] ?? '') && !NOT_ALIAS.has(tokens[j])) j += 1;
      if (tokens[j] === ',') j += 1;
      else break;
    }
  }

  if (!/\blimit\b/i.test(bare)) sql += ` LIMIT ${ROW_LIMIT}`;
  return { ok: true, sql };
}
