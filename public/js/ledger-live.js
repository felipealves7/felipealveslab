// Ask the Ledger, live box and scorecard. The page works without the Worker: whenever the Worker is
// not configured, unreachable or out of budget, the recorded session below is shown instead.
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
  function getJson(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function table(rows) {
    var t = el('table');
    if (!rows.length) return el('p', 'No rows.', 'small');
    var cols = Object.keys(rows[0]);
    var head = el('tr');
    cols.forEach(function (c) { head.appendChild(el('th', c)); });
    t.appendChild(head);
    rows.forEach(function (r) {
      var tr = el('tr');
      cols.forEach(function (c) { tr.appendChild(el('td', typeof r[c] === 'number' ? r[c].toLocaleString('en-GB') : String(r[c]))); });
      t.appendChild(tr);
    });
    return t;
  }
  function answer(out, d) {
    out.appendChild(el('strong', 'Query'));
    out.appendChild(el('pre', d.sql || 'None: the model declined to write a query.'));
    out.appendChild(el('strong', 'Result'));
    out.appendChild(table(d.rows || []));
    if (d.explanation) { out.appendChild(el('strong', 'Explanation')); out.appendChild(el('p', d.explanation)); }
  }

  var form = el('form');
  var label = el('label', 'Ask a question about the synthetic ledger (300 characters, 2 questions a day)');
  label.setAttribute('for', 'ledger-live-q');
  var input = el('input'); input.id = 'ledger-live-q'; input.maxLength = 300; input.type = 'text';
  var btn = el('button', 'Ask'); btn.type = 'submit';
  var live = el('div'); live.setAttribute('aria-live', 'polite');
  form.appendChild(label); form.appendChild(input); form.appendChild(btn);
  root.textContent = '';
  if (api) { root.appendChild(form); } else { root.appendChild(el('p', 'The live box is switched off. The recorded session below shows what an answer looks like.', 'small')); }
  root.appendChild(live);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    live.textContent = 'Asking…';
    btn.disabled = true;
    fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) })
      .then(function (r) { return r.json().then(function (d) { return [r.status, d]; }); })
      .then(function (res) {
        live.textContent = '';
        if (res[0] === 200) { answer(live, res[1]); return; }
        live.appendChild(el('p', res[1].message || 'The live box could not answer. See the recorded session below.'));
      })
      .catch(function () { live.textContent = 'The live box is unreachable. See the recorded session below.'; })
      .then(function () { btn.disabled = false; });
  });

  var rec = document.getElementById('recorded-session-box');
  if (rec) {
    getJson(rec.getAttribute('data-src')).then(function (s) {
      rec.textContent = '';
      rec.appendChild(el('p', s.note, 'small'));
      s.examples.forEach(function (ex) {
        rec.appendChild(el('h4', ex.question));
        answer(rec, ex);
      });
    }).catch(function () { rec.textContent = 'The recorded session could not be loaded. It is in data/ledger-api/recorded-session.json in the repository.'; });
  }

  var card = document.getElementById('model-scorecard-box');
  if (card) {
    getJson(card.getAttribute('data-src')).then(function (c) {
      card.textContent = '';
      if (c.status !== 'scored') {
        card.appendChild(el('p', 'Not scored yet. No model has written queries for these ' + c.summary.total + ' questions, so there is no accuracy figure. ' + c.note));
        return;
      }
      var s = c.summary;
      card.appendChild(el('p', s.right + ' of ' + s.total + ' right (' + s.accuracy_percent + '%). ' + s.wrong_answer + ' wrong answers, ' + s.wrongly_refused + ' wrongly declined, ' + s.rejected_sql + ' queries rejected by the validator, ' + s.query_error + ' failed to run, ' + s.model_error + ' with no model reply. Model: ' + (c.model || 'not recorded') + '. Scored ' + c.generatedAt + '.'));
      var t = el('table'); var h = el('tr');
      ['#', 'Question', 'Generated query', 'Result'].forEach(function (x) { h.appendChild(el('th', x)); });
      t.appendChild(h);
      c.questions.forEach(function (q) {
        var tr = el('tr');
        tr.appendChild(el('td', String(q.id))); tr.appendChild(el('td', q.text));
        tr.appendChild(el('td', q.sql === null ? '(declined)' : q.sql));
        tr.appendChild(el('td', q.verdict.replace(/_/g, ' ')));
        t.appendChild(tr);
      });
      card.appendChild(t);
    }).catch(function () { card.textContent = 'The scorecard could not be loaded. It is in data/ledger-api/scorecard.json in the repository.'; });
  }
})();
