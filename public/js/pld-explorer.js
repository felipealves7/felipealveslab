// Brazil hourly power price (PLD): the live piece. Reads one saved file, /data/ccee-pld/results.json,
// written by pipelines/ccee-pld/run.mjs. No other network calls. Data: CCEE, CC BY 4.0.
// The daily price chart above it is an Altair chart (charts/pld_daily.py, src/lib/charts/).
(function () {
  var root = document.getElementById('pld-explorer');
  if (!root) return;
  var FRESH_DAYS = 7;
  var nf = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nInt = new Intl.NumberFormat('en-GB');
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function day(iso) { var p = iso.split('-'); return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + ' ' + p[0]; }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function section(title, intro) {
    var s = el('div', null, 'pld-block');
    s.appendChild(el('h3', title));
    if (intro) s.appendChild(el('p', intro, 'pld-intro'));
    root.appendChild(s);
    return s;
  }
  function table(head, rows, cls) {
    var wrap = el('div', null, 'pld-table-wrap');
    var t = el('table', null, cls || '');
    var tr = el('tr');
    head.forEach(function (h) { tr.appendChild(el('th', h)); });
    var th = el('thead'); th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr');
      r.forEach(function (c) { var td = el('td'); if (c instanceof Node) td.appendChild(c); else td.textContent = c; row.appendChild(td); });
      tb.appendChild(row);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }
  function badge(state, text) {
    var icons = { pass: '✓', fail: '✕', skip: '–', warn: '!' };
    var b = el('span', null, 'pld-badge pld-badge--' + state);
    b.appendChild(el('span', icons[state], 'pld-badge-icon'));
    b.appendChild(document.createTextNode(' ' + text));
    return b;
  }

  // 1. Freshness: worked out in the browser from the last passed real run.
  function freshness(data) {
    var passed = data.runs.filter(function (r) { return r.kind === 'real' && r.status === 'passed'; });
    var box = el('div', null, 'pld-fresh');
    if (!passed.length || !data.summary) { box.appendChild(badge('fail', 'No passed run saved')); root.appendChild(box); return; }
    var run = passed[passed.length - 1];
    var today = new Date().toISOString().slice(0, 10);
    var age = daysBetween(run.retrieved, today);
    var fresh = age <= FRESH_DAYS;
    box.appendChild(badge(fresh ? 'pass' : 'warn', fresh ? 'Fresh' : 'Refresh due'));
    box.appendChild(el('span', 'Files downloaded ' + day(run.retrieved) + ', ' + age + (age === 1 ? ' day' : ' days') + ' ago. Newest priced day ' + day(data.summary.last) + '. Contract checked ' + day(run.runDate) + ': passed, ' + run.checks.length + ' of ' + run.checks.length + ' checks.', 'pld-fresh-text'));
    box.appendChild(el('span', '"Refresh due" after ' + FRESH_DAYS + ' days: a refresh is a manual download, because CCEE refuses automated ones.', 'pld-fresh-note'));
    root.appendChild(box);
  }

  // 2. The contract, for the real run or the rehearsal.
  function contract(data) {
    var s = section('The contract, run by run', 'Each saved run with its 13 checks. The rehearsal renames one column in memory to show how a break is reported: one cause, with the checks it stopped.');
    var picker = el('div', null, 'pld-switch');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Saved run');
    var out = el('div');
    var buttons = [];
    data.runs.forEach(function (run, i) {
      var label = (run.kind === 'real' ? 'Real run' : 'Rehearsal') + ', ' + day(run.runDate) + ': ' + run.status;
      var b = el('button', label);
      b.type = 'button';
      b.addEventListener('click', function () { show(i); });
      buttons.push(b);
      picker.appendChild(b);
    });
    s.appendChild(picker);
    s.appendChild(out);
    function show(i) {
      var run = data.runs[i];
      buttons.forEach(function (b, j) { b.setAttribute('aria-pressed', String(i === j)); });
      out.textContent = '';
      var passed = run.checks.filter(function (k) { return k.status === 'pass'; }).length;
      var head = el('p', null, 'pld-run-head');
      head.appendChild(badge(run.status === 'passed' ? 'pass' : 'fail', run.status === 'passed' ? 'Passed' : 'Failed'));
      head.appendChild(document.createTextNode(' ' + passed + ' of ' + run.checks.length + ' checks passed on ' + nInt.format(run.files.reduce(function (n, f) { return n + f.rows; }, 0)) + ' rows in ' + run.files.length + ' files, downloaded ' + day(run.retrieved) + '.' + (run.change ? ' Change: ' + run.change + '.' : '')));
      out.appendChild(head);
      if (run.causes.length) {
        var ul = el('ul', null, 'pld-causes');
        run.causes.forEach(function (c) { ul.appendChild(el('li', c.cause + '. Checks affected: ' + c.checks.join(', ') + '.')); });
        out.appendChild(el('p', 'Causes', 'pld-label'));
        out.appendChild(ul);
      }
      out.appendChild(table(['Check', 'Rule', 'Result', 'Bad of looked at'], run.checks.map(function (k) {
        var st = k.status === 'pass' ? badge('pass', 'pass') : k.status === 'fail' ? badge('fail', 'fail') : badge('skip', 'not run, needs ' + k.blockedBy.join(', '));
        var cell = el('span', k.status === 'not run' ? '—' : nInt.format(k.bad) + ' of ' + nInt.format(k.total));
        if (k.examples.length) { cell.appendChild(el('br')); cell.appendChild(el('small', k.examples.join('; '))); }
        return [el('code', k.id), k.says, st, cell];
      }), 'pld-checks'));
    }
    var lastReal = 0;
    data.runs.forEach(function (r, i) { if (r.kind === 'real') lastReal = i; });
    show(lastReal);
  }

  // 3. Revisions between snapshots.
  function revisions(data) {
    var n = data.snapshots.length;
    var s = section('Restated or missing values', n + (n === 1 ? ' snapshot' : ' snapshots') + ' saved. Each real run fingerprints every month (SHA-256 of its rows), so the next download shows which months CCEE rewrote; with the older files at hand it lists each changed or missing hour.');
    s.appendChild(table(['Downloaded', 'Files', 'Rows', 'Months fingerprinted'], data.snapshots.map(function (sn) {
      return [day(sn.retrieved), String(sn.files.length), nInt.format(sn.files.reduce(function (a, f) { return a + f.rows; }, 0)), String(Object.keys(sn.months).length)];
    })));
    if (!data.comparisons.length) {
      s.appendChild(el('p', 'No comparison yet: one snapshot cannot be compared with anything. Restatements found so far: none looked for. The first comparison comes with the next download.', 'pld-empty'));
      return;
    }
    s.appendChild(table(['From', 'To', 'Months rewritten', 'Months added', 'Months gone', 'Hours changed'], data.comparisons.map(function (c) {
      return [day(c.from), day(c.to), c.months.changed.join(', ') || 'none', String(c.months.added.length), c.months.removed.join(', ') || 'none', c.rows ? nInt.format(c.rows.changedCount) : 'old files not kept'];
    })));
    var changed = [];
    data.comparisons.forEach(function (c) { if (c.rows) c.rows.changed.forEach(function (x) { changed.push([day(c.to), x.key.replace(/\|/g, ' '), nf.format(x.before), nf.format(x.after)]); }); });
    if (changed.length) s.appendChild(table(['Seen on', 'Month, submarket, day, hour', 'Before', 'After'], changed));
  }

  // 4. The table view: every year and submarket.
  function yearly(data) {
    var s = section('Year by year', 'Hourly PLD in R$/MWh from the last passed run. The minimum is often reached in many hours; the table shows the first. ' + data.summary.last.slice(0, 4) + ' runs to ' + day(data.summary.last) + '.');
    s.appendChild(table(['Year', 'Submarket', 'Hours', 'Mean', 'Min (first hour)', 'Max (first hour)'], data.summary.yearly.map(function (y) {
      return [String(y.year), y.submarket, nInt.format(y.hours), nf.format(y.mean), nf.format(y.min) + ' (' + y.minAt + ')', nf.format(y.max) + ' (' + y.maxAt + ')'];
    }), 'pld-years'));
  }

  fetch(root.getAttribute('data-src'))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      root.textContent = '';
      freshness(data);
      contract(data);
      if (data.summary) yearly(data);
      revisions(data);
    })
    .catch(function () {
      root.textContent = 'The saved results could not be loaded. They are in data/ccee-pld/results.json in the repository.';
    });
})();
