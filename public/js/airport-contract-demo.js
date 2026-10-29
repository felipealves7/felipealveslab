// Airport data contract: shows the saved runs. No network calls except one read of a local JSON file.
(function () {
  var root = document.getElementById('airport-demo');
  if (!root) return;
  var STALE_AFTER_DAYS = 8; // a weekly run plus one day of slack
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function day(iso) { return iso.slice(0, 10); }
  fetch(root.getAttribute('data-src'))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      root.textContent = '';
      var real = data.runs.filter(function (r) { return !r.deliberate; });
      var lastPass = real.filter(function (r) { return r.status === 'pass'; }).pop();
      if (lastPass) {
        var age = Math.floor((Date.now() - Date.parse(lastPass.runDate)) / 86400000);
        var stale = age > STALE_AFTER_DAYS;
        root.appendChild(el('p', (stale ? 'Stale: ' : 'Fresh: ') + 'last successful run ' + day(lastPass.runDate) + ', ' + age + ' days ago.', 'badge ' + (stale ? 'bad' : 'ok')));
        root.appendChild(el('p', 'Worked out in your browser from the saved run date. The saved file has no live connection, so this badge turns stale on its own if nobody refreshes the file for ' + STALE_AFTER_DAYS + ' days.', 'small'));
      } else root.appendChild(el('p', 'No successful run is saved.', 'badge bad'));

      var label = el('label', 'Pick a saved run'); label.setAttribute('for', 'airport-run');
      var sel = el('select'); sel.id = 'airport-run';
      data.runs.forEach(function (r, i) {
        var failed = r.checks.filter(function (c) { return !c.passed; }).length;
        var o = el('option', day(r.runDate) + ' · ' + r.status.toUpperCase() + (r.deliberate ? ' · deliberate break' : '') + ' · ' + failed + ' failed');
        o.value = String(i); sel.appendChild(o);
      });
      sel.value = String(data.runs.length - 1);
      var out = el('div');
      function show() {
        var r = data.runs[Number(sel.value)];
        out.textContent = '';
        out.appendChild(el('p', r.status === 'pass' ? 'Passed' : 'Failed', 'badge ' + (r.status === 'pass' ? 'ok' : 'bad')));
        if (r.note) out.appendChild(el('p', r.note, 'small'));
        out.appendChild(el('p', 'Rows: airports ' + r.rows.airports.toLocaleString('en-GB') + ', runways ' + r.rows.runways.toLocaleString('en-GB') + ', countries ' + r.rows.countries.toLocaleString('en-GB') + '. Upstream file last modified ' + day(r.freshness.upstreamLastModified) + ' (' + r.freshness.ageDays + ' days before the run).', 'small'));
        var table = el('table'); var head = el('tr');
        ['Check', 'Result', 'Rows failing', 'Example'].forEach(function (h) { head.appendChild(el('th', h)); });
        table.appendChild(head);
        r.checks.slice().sort(function (a, b) { return Number(a.passed) - Number(b.passed); }).forEach(function (c) {
          var tr = el('tr');
          tr.appendChild(el('td', c.says));
          tr.appendChild(el('td', c.passed ? (c.failed ? 'Pass, within tolerance' : 'Pass') : 'FAIL'));
          tr.appendChild(el('td', c.level === 'row' ? c.failed.toLocaleString('en-GB') + ' of ' + c.checked.toLocaleString('en-GB') : (c.failed ? 'file-level' : '0')));
          tr.appendChild(el('td', c.samples[0] || ''));
          table.appendChild(tr);
        });
        out.appendChild(table);
      }
      sel.addEventListener('change', show);
      root.appendChild(label); root.appendChild(sel); root.appendChild(out);
      show();
    })
    .catch(function () { root.textContent = 'The saved results could not be loaded. They are in data/airport-contract/results.json in the repository.'; });
})();
