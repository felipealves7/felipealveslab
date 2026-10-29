// Ask the Ledger (live): recorded session, scorecard, and an optional live box.
// The recorded session and scorecard load from local JSON. The live box only appears if the Worker address is set,
// and any failure falls back to the recorded session. No error wall.
(function () {
  var root = document.getElementById('ledger-live');
  if (!root) return;
  var api = root.getAttribute('data-api');
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function table(columns, rows) {
    var t = el('table'), h = el('tr');
    columns.forEach(function (c) { h.appendChild(el('th', c)); });
    t.appendChild(h);
    rows.forEach(function (r) {
      var tr = el('tr');
      columns.forEach(function (c) { tr.appendChild(el('td', r[c] === null || r[c] === undefined ? '' : typeof r[c] === 'number' ? r[c].toLocaleString('en-GB') : String(r[c]))); });
      t.appendChild(tr);
    });
    return t;
  }
  function turn(t) {
    var d = el('div', undefined, 'turn');
    d.appendChild(el('strong', 'Q: ' + t.question));
    d.appendChild(el('pre', t.sql));
    if (t.rows && t.rows.length) d.appendChild(table(t.columns, t.rows));
    d.appendChild(el('p', t.explanation, 'small'));
    return d;
  }
  function loadJson(id) {
    return fetch(document.getElementById(id).getAttribute('data-src')).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  var recorded = document.getElementById('ledger-recorded');
  var showRecorded = function () {
    loadJson('ledger-recorded').then(function (d) {
      recorded.textContent = '';
      recorded.appendChild(el('p', d.note, 'small'));
      d.turns.forEach(function (t) { recorded.appendChild(turn(t)); });
    }).catch(function () { recorded.textContent = 'The recorded session could not be loaded. It is in data/ledger-api/recorded.json in the repository.'; });
  };
  showRecorded();

  var card = document.getElementById('ledger-scorecard');
  loadJson('ledger-scorecard').then(function (d) {
    card.textContent = '';
    card.appendChild(el('p', d.ran === 0
      ? 'Not yet measured: 0 of ' + d.total + ' questions have been run through a model. The reference queries and answers are in data/ledger-api/scorecard.json.'
      : d.right + ' of ' + d.ran + ' scored questions matched the reference answer (' + Math.round(d.accuracy * 100) + '%).', 'small'));
    var t = el('table'), h = el('tr');
    ['#', 'Question', 'Generated query', 'Result'].forEach(function (c) { h.appendChild(el('th', c)); });
    t.appendChild(h);
    var LABEL = { right: 'Matched', wrong: 'Did not match', rejected: 'Rejected by validator', error: 'Database error', not_run: 'Not run' };
    d.questions.forEach(function (q) {
      var tr = el('tr');
      tr.appendChild(el('td', String(q.id)));
      tr.appendChild(el('td', q.text));
      tr.appendChild(el('td', q.generatedSql || 'none yet'));
      tr.appendChild(el('td', LABEL[q.verdict] || q.verdict));
      t.appendChild(tr);
    });
    card.appendChild(t);
  }).catch(function () { card.textContent = 'The scorecard could not be loaded. It is in data/ledger-api/scorecard.json in the repository.'; });

  var live = document.getElementById('ledger-ask');
  if (!api) {
    live.textContent = 'The live box is switched off. Read the recorded session above.';
    return;
  }
  var input = el('textarea'); input.id = 'ledger-question'; input.maxLength = 300; input.rows = 2;
  var label = el('label', 'Ask a question about the synthetic ledger (300 characters, 2 questions a day)'); label.setAttribute('for', 'ledger-question');
  var btn = el('button', 'Ask'); btn.type = 'button';
  var out = el('div'); out.setAttribute('aria-live', 'polite');
  btn.addEventListener('click', function () {
    var q = input.value.trim();
    if (!q) return;
    btn.disabled = true; out.textContent = 'Asking...';
    fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        out.textContent = '';
        if (!b.ok) {
          out.appendChild(el('p', b.message || 'No answer this time.'));
          if (b.rejectedSql) out.appendChild(el('pre', b.rejectedSql));
          if (b.recordedSession) out.appendChild(el('p', 'The recorded session above shows what an answer looks like.', 'small'));
          return;
        }
        if (b.sql) { out.appendChild(el('pre', b.sql)); out.appendChild(table(b.columns, b.rows)); }
        out.appendChild(el('p', b.explanation || b.note || '', 'small'));
      })
      .catch(function () { out.textContent = 'The live box could not be reached. The recorded session above shows what an answer looks like.'; })
      .then(function () { btn.disabled = false; });
  });
  live.appendChild(label); live.appendChild(input); live.appendChild(btn); live.appendChild(out);
})();
