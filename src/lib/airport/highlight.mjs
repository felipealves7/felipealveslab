// A small JavaScript highlighter for the code cells on the Lab page. It splits code into tokens
// (comment, string, regex, number, keyword, plain) and never builds HTML: the page turns each token
// into a text node, so code is shown, never run. Pure; tested in scripts/airport-page.test.mjs.

const KEYWORDS = new Set([
  'await', 'async', 'break', 'case', 'catch', 'const', 'continue', 'default', 'else', 'export',
  'false', 'for', 'function', 'if', 'import', 'in', 'let', 'new', 'null', 'of', 'return', 'throw',
  'true', 'try', 'typeof', 'undefined', 'while',
]);

// A slash starts a regex literal when the previous meaningful character cannot end an expression.
const REGEX_CAN_FOLLOW = /[(,=:[!&|?{};+\-*%<>~^]$|^$|\b(return|typeof|of|in)$/;

export function tokens(code) {
  const out = [];
  let plain = '';
  const flush = () => { if (plain) { out.push({ t: 'plain', s: plain }); plain = ''; } };
  const push = (t, s) => { flush(); out.push({ t, s }); };
  const before = () => (out.map((x) => x.s).join('') + plain).replace(/\s+$/, '');
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    let m;
    if ((m = /^\/\/[^\n]*/.exec(rest))) push('comment', m[0]);
    else if ((m = /^\/\*[\s\S]*?\*\//.exec(rest))) push('comment', m[0]);
    else if ((m = /^(['"])(?:\\.|(?!\1)[^\\\n])*\1/.exec(rest))) push('string', m[0]);
    else if ((m = /^`(?:\\.|[^\\`])*`/.exec(rest))) push('string', m[0]);
    else if (rest[0] === '/' && REGEX_CAN_FOLLOW.test(before()) && (m = /^\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/.exec(rest))) push('regex', m[0]);
    else if ((m = /^\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(rest)) && !/[\w$]$/.test(plain)) push('number', m[0]);
    else if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      if (KEYWORDS.has(m[0])) push('keyword', m[0]);
      else plain += m[0];
    } else { plain += rest[0]; i += 1; continue; }
    i += m[0].length;
  }
  flush();
  return out;
}
