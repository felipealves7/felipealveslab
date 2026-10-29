// Ask the Ledger, live box and scorecard. The live box only runs if the page gives it an API address;
// otherwise, and whenever a cap is hit or the Worker cannot be reached, the recorded example session is shown.
(function () {
  var root = document.getElementById('ledger-live');
  var card = document.getElementById('ledger-scorecard');
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function table(rows) {
    var t = el('table');
    if (!rows.length) { t.appendChild(el('caption', 'No rows.')); return t; }
    var cols = Object.keys(rows[0]);
    var h = el('tr'); cols.forEach(function (c) { h.appendChild(el('th', c)); }); t.appendChild(h);
    rows.forEach(function (r) {
      var tr = el('tr');
      cols.forEach(function (c) { tr.appendChild(el('td', typeof r[c] === 'number' ? r[c].toLocaleString('en-GB') : String(r[c]))); });
      t.appendChild(tr);
    });
    return t;
  }
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }

  function showStep(out, step) {
    out.appendChild(el('p', step.question, 'q'));
    out.appendChild(el('strong', 'Query'));
    out.appendChild(el('pre', step.sql));
    out.appendChild(el('strong', 'Result'));
    out.appendChild(table(step.rows));
    if (step.explanation) { out.appendChild(el('strong', 'Explanation')); out.appendChild(el('p', step.explanation)); }
  }

  function showRecorded(box, url, why) {
    box.textContent = '';
    if (why) box.appendChild(el('p', why, 'small'));
    getJson(url).then(function (s) {
      box.appendChild(el('p', 'Recorded example session (synthetic ledger). ' + s.note, 'small'));
      s.steps.forEach(function (st) { showStep(box, st); });
    }).catch(function () {
      box.appendChild(el('p', 'The recorded session could not be loaded. It is in data/ask-the-ledger/recorded-session.json in the repository.', 'small'));
    });
  }

  if (root) {
    var api = root.getAttribute('data-api');
    var recordedUrl = root.getAttribute('data-recorded');
    var recorded = el('div'); recorded.id = 'recorded-session';
    root.textContent = '';
    if (!api) {
      root.appendChild(el('p', 'The live box is switched off. This page shows a recorded example instead.', 'small'));
      root.appendChild(recorded);
      showRecorded(recorded, recordedUrl);
    } else {
      var label = el('label', 'Ask a question about the synthetic ledger (up to 300 characters, 2 a day)'); label.setAttribute('for', 'ledger-ask');
      var input = el('input'); input.id = 'ledger-ask'; input.type = 'text'; input.maxLength = 300;
      input.placeholder = 'Revenue by entity in 2025';
      var btn = el('button', 'Ask'); btn.type = 'button';
      var out = el('div'); out.setAttribute('aria-live', 'polite');
      root.appendChild(label); root.appendChild(input); root.appendChild(btn); root.appendChild(out); root.appendChild(recorded);
      showRecorded(recorded, recordedUrl, 'Recorded example session, for reference:');
      btn.addEventListener('click', function () {
        var q = input.value.trim();
        if (!q) return;
        btn.disabled = true; out.textContent = 'Asking…';
        fetch(api.replace(/\/$/, '') + '/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) })
          .then(function (r) { return r.json(); })
          .then(function (b) {
            out.textContent = '';
            if (b.ok && b.declined) { out.appendChild(el('p', 'The model declined to write a query.', 'small')); out.appendChild(el('p', b.explanation)); return; }
            if (b.ok) { showStep(out, { question: q, sql: b.sql, rows: b.rows, explanation: b.explanation }); return; }
            out.appendChild(el('p', b.message || 'The live box could not answer.'));
          })
          .catch(function () { out.textContent = 'The live box could not be reached. The recorded example below shows what a run looks like.'; })
          .then(function () { btn.disabled = false; });
      });
    }
  }

  if (card) {
    getJson(card.getAttribute('data-src')).then(function (c) {
      card.textContent = '';
      if (!c.run) {
        card.appendChild(el('p', 'Not run yet. No model has been scored, so there is no accuracy figure. The ' + c.total + ' questions and the expected answers are below.', 'small'));
      } else {
        card.appendChild(el('p', c.correct + ' of ' + c.run + ' correct (' + c.accuracy + '%). Model: ' + c.model + '. Collected ' + c.collectedAt + '.', 'small'));
      }
      var t = el('table');
      var h = el('tr'); ['#', 'Question', 'Expected', 'Generated query', 'Result'].forEach(function (x) { h.appendChild(el('th', x)); }); t.appendChild(h);
      c.entries.forEach(function (e) {
        var tr = el('tr');
        tr.appendChild(el('td', String(e.id)));
        tr.appendChild(el('td', e.text));
        tr.appendChild(el('td', e.expected.outcome === 'decline' ? 'Decline' : JSON.stringify(e.expected.result.kind === 'scalar' ? e.expected.result.value : e.expected.result.rows.map(function (r) { return r.label + ': ' + r.value; }))));
        var q = el('td'); q.appendChild(e.sql ? el('code', e.sql) : el('span', e.status === 'not_run' ? '—' : 'declined')); tr.appendChild(q);
        tr.appendChild(el('td', e.status === 'not_run' ? 'not run' : e.status === 'correct' ? 'Matched' : 'Wrong' + (e.note ? ': ' + e.note : '')));
        t.appendChild(tr);
      });
      card.appendChild(t);
    }).catch(function () {
      card.textContent = 'The scorecard could not be loaded. It is in data/ask-the-ledger/scorecard.json in the repository.';
    });
  }
})();
