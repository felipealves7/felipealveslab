// Ask the Ledger: shows the saved results of the test run. No network calls except one read of a local JSON file.
(function () {
  var root = document.getElementById('ledger-demo');
  if (!root) return;
  var VERDICTS = {
    correct_answer: ['Right answer', true],
    correct_refusal: ['Right: it asked back or declined', true],
    wrong_answer: ['Wrong answer, given confidently', false],
    wrongly_refused: ['Wrongly declined', false],
  };
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function fmt(r) {
    if (!r) return 'none';
    if (r.kind === 'scalar') return r.value.toLocaleString('en-GB');
    if (r.kind === 'table') return r.rows.map(function (x) { return x.label + ': ' + x.value.toLocaleString('en-GB'); }).join('\n');
    return 'no data';
  }
  function show(q, out, unit) {
    out.textContent = '';
    var badge = VERDICTS[q.verdict];
    out.appendChild(el('p', badge[0], 'badge ' + (badge[1] ? 'ok' : 'bad')));
    var row = el('div', undefined, 'row');
    var a = el('div'); a.appendChild(el('strong', 'What the translator did'));
    a.appendChild(el('pre', q.got.outcome === 'refuse' ? 'Declined. Reason: ' + q.got.reason.replace('_', ' ') : JSON.stringify(q.got.spec, null, 2)));
    var b = el('div'); b.appendChild(el('strong', 'Figure it returned'));
    b.appendChild(el('pre', q.got.outcome === 'refuse' ? 'none' : fmt(q.result)));
    var c = el('div'); c.appendChild(el('strong', 'Right answer (' + unit + ' unless a %)'));
    c.appendChild(el('pre', q.want.outcome === 'refuse' ? 'None: the right move is to ask back or say the ledger cannot tell' : fmt(q.want.result)));
    row.appendChild(a); row.appendChild(b); row.appendChild(c);
    out.appendChild(row);
  }
  fetch(root.getAttribute('data-src'))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      root.textContent = '';
      var s = data.summary;
      root.appendChild(el('p', (s.correct_answer + s.correct_refusal) + ' of ' + s.total + ' right. ' + s.wrong_answer + ' wrong answers, ' + s.wrongly_refused + ' wrongly declined.', 'small'));
      var label = el('label', 'Pick a question from the test set'); label.setAttribute('for', 'ledger-q');
      var sel = el('select'); sel.id = 'ledger-q';
      var filter = el('select'); filter.id = 'ledger-f';
      var fl = el('label', 'Show'); fl.setAttribute('for', 'ledger-f');
      [['all', 'All questions'], ['bad', 'Only the ones it got wrong'], ['ok', 'Only the ones it got right']].forEach(function (o) {
        var opt = el('option', o[1]); opt.value = o[0]; filter.appendChild(opt);
      });
      var out = el('div');
      function fill() {
        sel.textContent = '';
        data.questions.filter(function (q) {
          var good = VERDICTS[q.verdict][1];
          return filter.value === 'all' || (filter.value === 'ok') === good;
        }).forEach(function (q) {
          var opt = el('option', q.id + '. ' + q.text); opt.value = q.id; sel.appendChild(opt);
        });
        draw();
      }
      function draw() {
        var q = data.questions.filter(function (x) { return String(x.id) === sel.value; })[0];
        if (q) show(q, out, data.ledger.unit); else out.textContent = 'No questions match.';
      }
      filter.addEventListener('change', fill);
      sel.addEventListener('change', draw);
      root.appendChild(fl); root.appendChild(filter);
      root.appendChild(label); root.appendChild(sel);
      root.appendChild(out);
      fill();
    })
    .catch(function () {
      root.textContent = 'The saved results could not be loaded. The numbers are in the tables below and in data/ask-the-ledger/results.json in the repository.';
    });
})();
