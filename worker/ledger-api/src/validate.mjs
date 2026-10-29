// Validates model-written SQL before it reaches D1. Rules from the issue:
// one statement, starts with SELECT or WITH, no write or admin keywords, only schema tables, LIMIT 100.
// The database is synthetic, so a bypass would expose nothing real, but the rules still have to hold.

import { TABLES } from './schema.mjs';

export const MAX_ROWS = 100;
const FORBIDDEN = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'ATTACH', 'DETACH', 'PRAGMA', 'REPLACE', 'VACUUM', 'REINDEX'];
const NOT_ALIAS = new Set(['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'ON', 'USING', 'UNION', 'EXCEPT', 'INTERSECT', 'SELECT', 'OFFSET', 'WINDOW']);

/** Replaces '...' string literals and comments with blanks so keywords inside them are not read as SQL. */
function strip(sql) {
  let out = '';
  for (let i = 0; i < sql.length; ) {
    const c = sql[i];
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      if (j >= sql.length) return null; // unterminated literal
      out += "''";
      i = j + 1;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += ' ';
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 2;
      out += ' ';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** @returns {{ok: true, sql: string} | {ok: false, reason: string}} */
export function validateSql(input) {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, reason: 'empty query' };
  let sql = input.trim();
  const clean = strip(sql);
  if (clean === null) return { ok: false, reason: 'unterminated string or comment' };
  if (/["`\[\]]/.test(clean)) return { ok: false, reason: 'quoted identifiers are not allowed' };
  const body = clean.replace(/;\s*$/, '');
  if (body.includes(';')) return { ok: false, reason: 'more than one statement' };
  if (!/^\s*(SELECT|WITH)\b/i.test(body)) return { ok: false, reason: 'must start with SELECT or WITH' };
  const upper = body.toUpperCase();
  for (const kw of FORBIDDEN) {
    if (new RegExp(`\\b${kw}\\b`).test(upper)) return { ok: false, reason: `${kw} is not allowed` };
  }
  if (/\bLOAD_EXTENSION\b|\bSQLITE_[A-Z_]*/i.test(body)) return { ok: false, reason: 'system objects are not allowed' };

  // CTE names are allowed as table names.
  const ctes = new Set();
  for (const m of body.matchAll(/(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([A-Za-z_]\w*)\s*(?:\([^)]*\)\s*)?AS\s*\(/gi)) ctes.add(m[1].toLowerCase());

  const tokens = body.match(/[A-Za-z_]\w*|[(),.]|\S/g) || [];
  const allowed = new Set(TABLES);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toUpperCase();
    if (t !== 'FROM' && t !== 'JOIN') continue;
    let j = i + 1;
    for (;;) {
      const name = tokens[j];
      if (name === '(') break; // subquery: its own FROM is checked on its own turn
      if (!name || !/^[A-Za-z_]\w*$/.test(name)) return { ok: false, reason: 'could not read a table name' };
      if (tokens[j + 1] === '.') return { ok: false, reason: 'schema-qualified names are not allowed' };
      const lower = name.toLowerCase();
      if (!allowed.has(lower) && !ctes.has(lower)) return { ok: false, reason: `table "${name}" is not in the ledger` };
      j++;
      if (tokens[j] && tokens[j].toUpperCase() === 'AS') j++;
      if (tokens[j] && /^[A-Za-z_]\w*$/.test(tokens[j]) && !NOT_ALIAS.has(tokens[j].toUpperCase())) j++;
      if (tokens[j] === ',') {
        j++;
        continue;
      }
      break;
    }
  }

  sql = sql.replace(/;\s*$/, '');
  if (!/\bLIMIT\b/i.test(body)) sql += ` LIMIT ${MAX_ROWS}`;
  return { ok: true, sql };
}
