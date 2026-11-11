// Page tests for the extension, run in a browser by harness.html (node tests/run.mjs opens it for you).
// The extension's real files run against fake X and Bluesky pages (frame.html), so this checks the
// extension's behavior, not X's or Bluesky's current markup.

window.__store = { data: {}, listeners: [] };

var NEG = 'I hate this terrible awful war';      // HAN
var POS = 'I love this wonderful day';           // HAP
var NEU = 'The meeting is at noon';              // NEU

var wait = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
function ok(cond, msg) { if (!cond) throw new Error(msg || 'expected true'); }
function eq(actual, expected, msg) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
  }
}
async function until(fn, ms) {
  var end = Date.now() + (ms || 5000);
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await wait(10);
  }
}

function resetStore(seed) {
  window.__store.data = JSON.parse(JSON.stringify(seed || {}));
  window.__store.listeners = [];
}

// ---- a fake page (one browser tab) ----
async function openPage(site, opts) {
  opts = opts || {};
  var frame = document.createElement('iframe');
  frame.style.cssText = 'width:900px;height:500px;border:1px solid #ccc;';
  frame.src = 'frame.html?site=' + site + (opts.nav ? '&nav=' + opts.nav : '');
  document.getElementById('frames').appendChild(frame);
  await until(function() { return frame.contentWindow && frame.contentWindow.ready; });
  var w = frame.contentWindow;
  if (w.loadError) throw new Error(w.loadError);
  await wait(30);   // let the stored counters load
  var page = {
    w: w,
    doc: w.document,
    box: function() { return w.document.getElementById('box_chart_id'); },
    btn: function(titleStart) { return page.box().querySelector('button[title^="' + titleStart + '"]'); },
    title: function() { return page.box().querySelector('#box_chart_title').textContent.replace(/\s+/g, ' ').trim(); },
    counters: function() { return w.counters; },
    posts: function() { return w.postElements(); },
    add: function(id, text) { return w.addPost(id, text); },
    // add posts and wait for the extension to notice
    feed: async function(list) {
      list.forEach(function(p) { w.addPost(p[0], p[1]); });
      await wait(60);
    },
    save: async function() { w.saveCounters(); await wait(40); },
    // the stored settings changed, like the popup's switches
    setSetting: async function(obj) { w.chrome.storage.local.set(obj); await wait(60); },
    switchTo: async function(index) {
      var select = page.box().querySelector('select');
      select.value = w.counters[index].id;
      select.dispatchEvent(new w.Event('change'));
      await wait(40);
    },
    click: async function(titleStart) { page.btn(titleStart).click(); await wait(40); },
    // type a new name into the rename box and finish with Enter (or cancel with Escape)
    rename: async function(text, key) {
      var span = page.box().querySelector('#box_chart_title span');
      span.dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
      var input = page.box().querySelector('#box_chart_title input');
      if (!input) throw new Error('rename box did not open');
      input.value = text;
      input.dispatchEvent(new w.KeyboardEvent('keydown', { key: key || 'Enter', bubbles: true }));
      input.dispatchEvent(new w.FocusEvent('blur'));   // a hidden test frame may not really lose focus
      await wait(40);
    },
    close: function() {
      var win = frame.contentWindow;
      frame.remove();
      window.__store.listeners = window.__store.listeners.filter(function(l) { return l.win !== win; });
    }
  };
  return page;
}

// ---- results ----
// test() only describes a test; runAll() runs them one at a time, each starting from empty storage.
var results = [];
function test(group, name, fn) { return { group: group, name: name, fn: fn }; }
async function runOne(t) {
  resetStore();
  try {
    await t.fn();
    results.push({ group: t.group, name: t.name, ok: true });
  } catch (e) {
    results.push({ group: t.group, name: t.name, ok: false, error: String(e && e.message || e) });
  }
  document.getElementById('frames').textContent = '';   // drop the frames this test opened
  var done = results.filter(function(r) { return r.ok; }).length;
  document.getElementById('summary').textContent = done + ' of ' + results.length + ' passed so far';
}

// The same tests run once for X and once for Bluesky.
function pageTests(site) {
  var T = function(name, fn) { return test(site, name, fn); };
  return [

    // ---- loading and placement ----
    T('manifest scripts load without errors', async function() {
      var p = await openPage(site);
      eq(p.w.errors, [], 'script errors');
      ok(typeof p.w.SentiStrength === 'object' && typeof p.w.CALM_CATEGORIES === 'object' && typeof p.w.CalmFilterSite === 'object', 'globals missing');
    }),
    T('chart appears under the post button once posts show up', async function() {
      var p = await openPage(site);
      ok(!p.box(), 'no chart before any post');
      await p.feed([[1, POS]]);
      ok(p.box(), 'chart created');
      ok(p.box().parentElement === p.doc.getElementById('col'), 'chart is in the navigation column');
      ok(p.box().previousElementSibling === p.doc.getElementById('anchor'), 'chart follows the post button');
      eq(p.w.errors, [], 'script errors');
    }),
    T('chart moves to the bottom-right corner when the nav is too narrow', async function() {
      var p = await openPage(site, { nav: 'narrow' });
      await p.feed([[1, POS]]);
      eq(p.box().style.position, 'fixed');
      ok(p.box().parentElement === p.doc.body, 'chart is on the body');
    }),

    // ---- scoring, borders, hiding ----
    T('posts are scored into the right categories', async function() {
      var p = await openPage(site);
      await p.feed([[1, NEG], [2, POS], [3, NEU]]);
      var c = p.counters()[0];
      eq(c.n, 3, 'n');
      eq([c.counts.HAN, c.counts.HAP, c.counts.NEU], [1, 1, 1], 'HAN, HAP, NEU');
    }),
    T('HAN post is hidden and borders are colored', async function() {
      var p = await openPage(site);
      await p.feed([[1, NEG], [2, POS], [3, NEU]]);
      var posts = p.posts();
      eq(posts[0].style.display, 'none', 'HAN hidden');
      ok(posts[1].style.border.indexOf('yellow') !== -1, 'HAP yellow, got ' + posts[1].style.border);
      ok(posts[2].style.border.indexOf('gray') !== -1, 'NEU gray, got ' + posts[2].style.border);
    }),
    T('popup switches: show HAN, hide colors, hide chart', async function() {
      var p = await openPage(site);
      await p.feed([[1, NEG], [2, POS]]);
      await p.setSetting({ filterHan: false });
      eq(p.posts()[0].style.display, '', 'HAN shown again');
      ok(p.posts()[0].style.border.indexOf('red') !== -1, 'HAN border red');
      await p.setSetting({ showColors: false });
      eq(p.posts()[1].style.border, '', 'border removed');
      await p.setSetting({ showChart: false });
      eq(p.box().style.display, 'none', 'chart hidden');
      await p.feed([[3, POS]]);
      eq(p.counters()[0].n, 3, 'still counting while the chart is hidden');
      await p.setSetting({ showChart: true });
      eq(p.box().style.display, '', 'chart shown');
    }),
    T('repeated, textless and re-rendered posts are handled', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS], [1, POS], [2, null]]);
      eq(p.counters()[0].n, 1, 'same id counted once, textless skipped');
      p.posts()[0].remove();                    // the page re-renders the post
      var again = p.add(1, POS);
      await wait(60);
      eq(p.counters()[0].n, 1, 'still one');
      ok(again.style.border !== '', 'border put back on the new element');
    }),
    T('posts that load later (infinite scroll) are counted', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS], [2, NEU], [3, NEG]]);
      await p.feed([[4, POS], [5, POS]]);
      await wait(100);
      await p.feed([[6, NEU]]);
      eq(p.counters()[0].n, 6);
      ok(/\(n=6\)/.test(p.title()), 'title shows n=6, got ' + p.title());
    }),

    // ---- the distributions ----
    T('first run starts with My Browsing Affect Distribution', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      eq(p.counters().map(function(c) { return c.name; }), ['My Browsing Affect Distribution']);
      ok(p.title().indexOf('My Browsing Affect Distribution') === 0 && /\(n=1\)/.test(p.title()), p.title());
      eq(p.counters()[0].running, true, 'running');
      eq(p.box().children[0].style.display, 'none', 'switcher hidden with one');
    }),
    T('Add makes Distribution 2 and 3, then the button goes', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS], [2, NEU]]);
      await p.click('Start');
      await p.click('Start');
      eq(p.counters().map(function(c) { return c.name; }), ['My Browsing Affect Distribution', 'Affect Distribution 2', 'Affect Distribution 3']);
      eq(p.btn('Start').style.display, 'none', 'Add hidden at 3');
      eq(p.counters().map(function(c) { return c.n; }), [2, 2, 2], 'new ones pick up what is on screen');
    }),
    T('a freed slot gets its own default name back', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      await p.click('Start'); await p.click('Start');
      await p.switchTo(1);
      await p.click('Delete');                                   // delete Affect Distribution 2
      ok(p.btn('Start').style.display !== 'none', 'Add is back');
      await p.click('Start');
      eq(p.counters().map(function(c) { return c.name; }), ['My Browsing Affect Distribution', 'Affect Distribution 3', 'Affect Distribution 2']);
    }),
    T('every running distribution counts, whichever one is showing', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      await p.click('Start');
      await p.feed([[2, NEG], [3, NEU]]);
      eq(p.counters().map(function(c) { return c.n; }), [3, 3]);
      await p.switchTo(0);
      await p.feed([[4, POS]]);
      eq(p.counters().map(function(c) { return c.n; }), [4, 4], 'switching the view does not change counting');
    }),
    T('pause stops one distribution, resume picks up the screen', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      await p.click('Start');
      await p.switchTo(1);
      await p.click('Pause');
      eq(p.counters()[1].running, false);
      ok(/paused/.test(p.title()), 'title says paused: ' + p.title());
      ok(p.box().querySelectorAll('option')[1].textContent.indexOf('⏸') === 0, 'switcher marks it paused');
      await p.feed([[2, POS], [3, NEG]]);
      eq(p.counters().map(function(c) { return c.n; }), [3, 1], 'only the running one counts');
      await p.switchTo(0);
      await p.feed([[4, NEU]]);
      eq(p.counters().map(function(c) { return c.n; }), [4, 1], 'viewing another does not resume it');
      await p.switchTo(1);
      await p.click('Resume');
      eq(p.counters()[1].running, true);
      eq(p.counters()[1].n, 4, 'picked up the posts on screen');
    }),
    T('delete is immediate; deleting the last leaves only Add', async function() {
      var p = await openPage(site);
      await p.feed([[1, NEG], [2, POS]]);
      await p.click('Start');
      await p.click('Delete');
      eq(p.counters().length, 1, 'one click deleted it');
      await p.click('Delete');
      eq(p.counters().length, 0, 'none left');
      eq(p.box().querySelector('canvas').style.display, 'none', 'chart hidden');
      eq(p.btn('Start').textContent, 'Add affect distribution');
      await p.feed([[3, NEG]]);
      eq(p.counters().length, 0, 'nothing counts with no distribution');
      eq(p.posts()[2].style.display, 'none', 'HAN hiding still works');
      await p.click('Start');
      eq(p.counters()[0].name, 'My Browsing Affect Distribution');
      eq(p.counters()[0].n, 3, 'the new one counts what is on screen');
    }),
    T('rename: save, cancel, empty, odd text', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      await p.rename('  x.com/FoxNews  ');
      eq(p.counters()[0].name, 'x.com/FoxNews', 'trimmed and saved');
      ok(/^x\.com\/FoxNews ?\(n=1\)$/.test(p.title()), p.title());
      await p.rename('zzz', 'Escape');
      eq(p.counters()[0].name, 'x.com/FoxNews', 'Escape cancels');
      await p.rename('   ');
      eq(p.counters()[0].name, 'x.com/FoxNews', 'empty keeps the old name');
      var evil = '<img src=x onerror="window.pwned=1">';
      await p.rename(evil);
      eq(p.counters()[0].name, evil);
      ok(!p.box().querySelector('img') && !p.w.pwned, 'shown as text, not as HTML');
    }),
    T('typing a name does not trigger the site shortcuts', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      var leaked = 0;
      ['keydown', 'keyup', 'keypress'].forEach(function(type) { p.doc.addEventListener(type, function() { leaked++; }); });
      var span = p.box().querySelector('#box_chart_title span');
      span.dispatchEvent(new p.w.MouseEvent('dblclick', { bubbles: true }));
      var input = p.box().querySelector('#box_chart_title input');
      ['keydown', 'keyup', 'keypress'].forEach(function(type) {
        input.dispatchEvent(new p.w.KeyboardEvent(type, { key: 'j', bubbles: true }));
      });
      eq(leaked, 0);
    }),
    T('switcher lists names with live n and changes the chart', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      await p.click('Start');
      var options = function() { return Array.prototype.map.call(p.box().querySelectorAll('option'), function(o) { return o.textContent; }); };
      eq(options(), ['My Browsing Affect Distribution (n=1)', 'Affect Distribution 2 (n=1)']);
      await p.feed([[2, NEG], [3, NEU]]);
      eq(options(), ['My Browsing Affect Distribution (n=3)', 'Affect Distribution 2 (n=3)'], 'n stays current');
      await p.switchTo(0);
      ok(p.title().indexOf('My Browsing') === 0, p.title());
      await p.rename('Home');
      ok(options()[0] === 'Home (n=3)', 'rename shows in the list: ' + options()[0]);
    }),
    T('chart percentages match the counts', async function() {
      var p = await openPage(site);
      await p.feed([[1, NEG], [2, POS], [3, POS], [4, NEU]]);
      var c = p.counters()[0];
      var total = c.counts.HAN + c.counts.LAN + c.counts.NEU + c.counts.LAP + c.counts.HAP;
      eq(p.w.affectPercent(c.counts, 'HAP'), Math.round(c.counts.HAP / total * 100));
      eq(c.n, 4);
      ok(total >= c.n, 'category counts add up to at least n');
    }),

    // ---- saved data ----
    T('a reload keeps distributions, pauses and counts without double counting', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS], [2, NEG], [3, NEU]]);
      await p.click('Start');
      await p.switchTo(1);
      await p.click('Pause');
      await p.rename('BBC');
      await p.save();
      p.close();

      var q = await openPage(site);
      await q.feed([[1, POS], [2, NEG], [3, NEU]]);   // the same posts are on screen again
      eq(q.counters().map(function(c) { return [c.name, c.n, c.running]; }),
         [['My Browsing Affect Distribution', 3, true], ['BBC', 3, false]]);
      ok(/BBC/.test(q.title()) && /paused/.test(q.title()), 'showing the paused one: ' + q.title());
      await q.feed([[4, POS]]);
      eq(q.counters().map(function(c) { return c.n; }), [4, 3], 'paused stays paused after reload');
    }),
    T('deleting everything is remembered across a reload', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      await p.click('Delete');
      await p.save();
      p.close();
      var q = await openPage(site);
      await q.feed([[1, POS]]);
      eq(q.counters().length, 0, 'still empty');
      eq(q.btn('Start').textContent, 'Add affect distribution');
    }),
    T('the real save timer writes to storage, under this site only', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      ok(!window.__store.data['counters:' + site], 'nothing saved yet');
      await wait(2300);
      var saved = window.__store.data['counters:' + site];
      ok(saved && saved[0].n === 1, 'saved after the delay');
      var other = site === 'x' ? 'bluesky' : 'x';
      eq(Object.keys(window.__store.data).filter(function(k) { return k.slice(-(other.length + 1)) === ':' + other; }), [], 'nothing under the other site');
    }),
    T('old saved data is migrated; bad data cannot break it', async function() {
      var old = { id: 'o1', name: 'Affect Distribution 1', n: 5, counts: { HAN: 1, LAN: 0, NEU: 4, LAP: 0, HAP: 0 }, ids: {} };
      var seed = {};
      seed['counters:' + site] = [old, { id: 'o2', name: 'x.com/FoxNews', n: 2, counts: { NEU: 2 }, ids: {} }];
      seed['activeCounter:' + site] = 'o1';
      resetStore(seed);
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      eq(p.counters().map(function(c) { return c.name; }), ['My Browsing Affect Distribution', 'x.com/FoxNews'], 'old default renamed, custom kept');
      p.close();

      var junk = [null, 5, 'x', { id: 1 }, { id: 'a', name: 'n', counts: null },
        { id: 'b', name: new Array(80).join('x'), n: 'lots', counts: { HAN: -3, LAN: 'NaN' }, ids: null },
        { id: 'c', name: 'c', counts: {}, ids: {} }, { id: 'd', name: 'd', counts: {}, ids: {} }, { id: 'e', name: 'e', counts: {}, ids: {} }];
      seed = {};
      seed['counters:' + site] = junk;
      seed['activeCounter:' + site] = 'nope';
      resetStore(seed);
      var q = await openPage(site);
      await q.feed([[1, POS]]);
      eq(q.w.errors, [], 'no script errors');
      ok(q.counters().length <= 3, 'at most 3');
      ok(q.counters().every(function(c) { return c.name.length <= 40 && typeof c.n === 'number'; }), 'names and counts cleaned');

      seed = {};
      seed['counters:' + site] = 'garbage';
      seed['activeCounter:' + site] = 7;
      resetStore(seed);
      var r = await openPage(site);
      await r.feed([[1, POS]]);
      eq(r.counters().length, 1, 'unreadable data starts fresh');
      eq(r.w.errors, [], 'no script errors');
    }),
    T('two tabs stay in sync', async function() {
      var a = await openPage(site);
      var b = await openPage(site);
      await a.feed([[1, POS], [2, NEG]]);
      var mine = a.counters();
      await a.save();
      await wait(40);
      ok(a.counters() === mine, 'a tab does not reload its own save');
      eq(b.counters().map(function(c) { return c.n; }), [2], 'the other tab adopted it');
      await b.click('Start');
      await b.save();
      await wait(40);
      eq(a.counters().length, 2, 'and the other way round');
    }),
    T('a reloaded extension or a failing save does not break the page', async function() {
      var p = await openPage(site);
      await p.feed([[1, POS]]);
      p.w.failStorage = true;
      await p.save();
      await p.feed([[2, POS]]);
      p.w.failStorage = false;
      p.w.chrome.runtime.id = undefined;    // what a page sees after the extension is reloaded
      await p.feed([[3, POS]]);
      await p.save();
      eq(p.w.errors, [], 'no script errors');
      eq(p.counters()[0].n, 3, 'still counting');
    })
  ];
}

// ---- the popup (same for both sites) ----
async function openPopup(seed) {
  resetStore(seed);
  var html = await (await fetch('../chrome_extension/settings.html')).text();
  var stub = '<script src="' + new URL('chrome-stub.js', location.href).href + '"><\/script>';
  html = html.replace('<script src="chart.js">', stub + '<script src="chart.js">');
  var frame = document.createElement('iframe');
  frame.style.cssText = 'width:260px;height:420px;border:1px solid #ccc;';
  frame.srcdoc = '<base href="' + new URL('../chrome_extension/', location.href).href + '">' + html;
  document.getElementById('frames').appendChild(frame);
  await until(function() { return frame.contentDocument && frame.contentDocument.getElementById('counterList') && frame.contentWindow.chrome; });
  await wait(80);
  var w = frame.contentWindow;
  var downloads = [], blobs = {}, copied = [];
  var n = 0;
  w.URL.createObjectURL = function(blob) { var u = 'blob:test' + (++n); blobs[u] = blob; return u; };
  w.HTMLAnchorElement.prototype.click = function() { downloads.push({ name: this.download, blob: blobs[this.getAttribute('href')] }); };
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: function(t) { copied.push(t); return Promise.resolve(); } } });
  var d = w.document;
  return {
    w: w, d: d, downloads: downloads, copied: copied,
    rows: function() { return Array.prototype.map.call(d.querySelectorAll('#counterList label'), function(l) { return l.textContent.replace(/\s+/g, ' ').trim(); }); },
    boxes: function() { return d.querySelectorAll('#counterList input'); },
    click: async function(id) { d.getElementById(id).click(); await wait(300); }
  };
}

var SEED = [
  { id: 'a', name: 'My Browsing Affect Distribution', startedOn: 'https://x.com/home', n: 10, counts: { HAN: 2, LAN: 1, NEU: 3, LAP: 1, HAP: 3 } },
  { id: 'b', name: 'x.com/FoxNews', startedOn: 'https://x.com/FoxNews', n: 4, counts: { HAN: 4, LAN: 0, NEU: 0, LAP: 0, HAP: 0 } },
  { id: 'c', name: 'x.com/FoxNews', startedOn: 'https://x.com/FoxNews', n: 1, counts: { HAN: 0, LAN: 0, NEU: 1, LAP: 0, HAP: 0 } }
];
var SEED_BSKY = [
  { id: 'd', name: 'My Browsing Affect Distribution', startedOn: 'https://bsky.app/', n: 6, counts: { HAN: 0, LAN: 0, NEU: 0, LAP: 2, HAP: 4 } }
];
var BOTH = { 'counters:x': SEED, 'counters:bluesky': SEED_BSKY };

function popupTests() {
  var T = function(name, fn) { return test('popup', name, fn); };
  return [
    T('lists every distribution with its n', async function() {
      var pop = await openPopup(BOTH);
      eq(pop.rows().map(function(r) { return r.replace(/\s+/g, ''); }),
         ['MyBrowsingAffectDistributionX\u00B7n=10', 'x.com/FoxNewsX\u00B7n=4', 'x.com/FoxNewsX\u00B7n=1',
          'MyBrowsingAffectDistributionBluesky\u00B7n=6'], 'X first, then Bluesky, each tagged');
      ok(Array.prototype.every.call(pop.boxes(), function(b) { return b.checked; }), 'all ticked');
    }),
    T('with nothing saved it says so and disables the buttons', async function() {
      var pop = await openPopup({});
      ok(/No distributions yet/.test(pop.d.getElementById('counterList').textContent), 'message');
      ok(['downloadPng', 'downloadJson', 'copyJson'].every(function(id) { return pop.d.getElementById(id).disabled; }), 'buttons disabled');
    }),
    T('unticking everything disables the buttons', async function() {
      var pop = await openPopup(BOTH);
      Array.prototype.forEach.call(pop.boxes(), function(b) { b.click(); });
      ok(['downloadPng', 'downloadJson', 'copyJson'].every(function(id) { return pop.d.getElementById(id).disabled; }), 'disabled');
    }),
    T('JSON download has the selected distributions', async function() {
      var pop = await openPopup(BOTH);
      pop.boxes()[2].click();                       // untick the last one
      await pop.click('downloadJson');
      eq(pop.downloads.length, 1);
      eq(pop.downloads[0].name, 'affect-distribution.json');
      var data = JSON.parse(await pop.downloads[0].blob.text());
      eq(data.map(function(e) { return e.site + ':' + e.name; }),
         ['x:My Browsing Affect Distribution', 'x:x.com/FoxNews', 'bluesky:My Browsing Affect Distribution']);
      eq(data[0].started_on, 'https://x.com/home');
      eq(data[0].n, 10);
      eq(data[0].HAN, { count: 2, pct: 20 });
      eq(data[0].HAP, { count: 3, pct: 30 });
      eq(data[1].HAN, { count: 4, pct: 100 });
    }),
    T('Copy JSON puts the same JSON on the clipboard', async function() {
      var pop = await openPopup(BOTH);
      await pop.click('copyJson');
      eq(pop.copied.length, 1);
      var data = JSON.parse(pop.copied[0]);
      eq(data.length, 4);
      eq(data[0].name, 'My Browsing Affect Distribution');
      ok(/Copied/.test(pop.d.getElementById('status').textContent), 'status says copied');
    }),
    T('PNG download: one file each, safe names, a real image', async function() {
      var pop = await openPopup(BOTH);
      pop.d.getElementById('downloadPng').click();
      await until(function() { return pop.downloads.length >= 4; });   // images are encoded asynchronously
      eq(pop.downloads.map(function(d) { return d.name; }),
         ['My Browsing Affect Distribution.png', 'x.com_FoxNews.png', 'x.com_FoxNews (2).png', 'My Browsing Affect Distribution (2).png']);
      var bmp = await createImageBitmap(pop.downloads[1].blob);
      eq([bmp.width, bmp.height], [600, 220]);
      var canvas = document.createElement('canvas');
      canvas.width = 600; canvas.height = 220;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      var px = ctx.getImageData(300, 93, 1, 1).data;      // middle of the bar: all HAN, so red
      ok(px[0] > 200 && px[1] < 60 && px[2] < 60, 'bar is red, got ' + Array.prototype.join.call(px, ','));
      var corner = ctx.getImageData(3, 3, 1, 1).data;      // white background
      ok(corner[0] > 250 && corner[1] > 250 && corner[2] > 250, 'white background');
    }),
    T('the switches write to storage and change the page', async function() {
      var pop = await openPopup({});
      var p = await openPage('x');
      await p.feed([[1, NEG], [2, POS]]);
      eq(p.posts()[0].style.display, 'none');
      var box = pop.d.getElementById('filterHan');
      ok(box.checked, 'on by default');
      box.click();                                          // switch it off in the popup
      await wait(100);
      eq(window.__store.data.filterHan, false);
      eq(p.posts()[0].style.display, '', 'HAN post is back on the page');
    })
  ];
}

// ---- X and Bluesky never mix ----
function separationTests() {
  var T = function(name, fn) { return test('x vs bluesky', name, fn); };
  return [
    T('each site counts only its own posts and keeps its own distributions', async function() {
      var x = await openPage('x');
      var b = await openPage('bluesky');
      await x.feed([[1, POS], [2, NEG]]);
      await b.feed([[1, NEU]]);
      await x.click('Start');                         // a second distribution on X only
      await x.rename('x.com/FoxNews');
      await b.click('Pause');                         // and a pause on Bluesky only
      await x.save(); await b.save();
      eq(x.counters().map(function(c) { return [c.name, c.n, c.running]; }),
         [['My Browsing Affect Distribution', 2, true], ['x.com/FoxNews', 2, true]], 'X');
      eq(b.counters().map(function(c) { return [c.name, c.n, c.running]; }),
         [['My Browsing Affect Distribution', 1, false]], 'Bluesky');
      ok(window.__store.data['counters:x'] && window.__store.data['counters:bluesky'], 'saved separately');
      eq(window.__store.data['counters:x'].length, 2);
      eq(window.__store.data['counters:bluesky'].length, 1);
    }),
    T('changes on one site are never adopted by the other', async function() {
      var x = await openPage('x');
      var b = await openPage('bluesky');
      await b.feed([[1, POS]]);
      var before = JSON.stringify(b.counters());
      await x.feed([[1, NEG], [2, NEG], [3, POS]]);
      await x.click('Start');
      await x.click('Delete'); await x.click('Delete');   // delete everything on X
      await x.save();
      await wait(80);
      eq(JSON.stringify(b.counters()), before, 'Bluesky untouched');
      eq(x.counters().length, 0, 'X is empty');
      ok(b.btn('Pause'), 'Bluesky still shows its distribution');
    }),
    T('each site restores only its own after a reload', async function() {
      var x = await openPage('x');
      var b = await openPage('bluesky');
      await x.feed([[1, POS], [2, POS]]);
      await b.feed([[1, NEG]]);
      await x.save(); await b.save();
      x.close(); b.close();
      var x2 = await openPage('x');
      var b2 = await openPage('bluesky');
      await x2.feed([[1, POS], [2, POS]]);
      await b2.feed([[1, NEG]]);
      eq(x2.counters().map(function(c) { return c.n; }), [2], 'X');
      eq(b2.counters().map(function(c) { return c.n; }), [1], 'Bluesky');
    }),
    T('the two sites declare different storage keys', async function() {
      var x = await openPage('x');
      var b = await openPage('bluesky');
      eq(x.w.CalmFilterSite.key, 'x');
      eq(b.w.CalmFilterSite.key, 'bluesky');
      eq(x.w.KEYS.counters, 'counters:x');
      eq(b.w.KEYS.counters, 'counters:bluesky');
    })
  ];
}

// ---- run everything ----
async function runAll() {
  var tests = pageTests('x').concat(pageTests('bluesky'), separationTests(), popupTests());
  for (var i = 0; i < tests.length; i++) await runOne(tests[i]);
  var passed = results.filter(function(r) { return r.ok; }).length;
  document.getElementById('summary').textContent = passed + ' of ' + results.length + ' passed';
  var list = document.getElementById('list');
  results.forEach(function(r) {
    var li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    li.textContent = (r.ok ? 'PASS ' : 'FAIL ') + '[' + r.group + '] ' + r.name + (r.ok ? '' : ' - ' + r.error);
    list.appendChild(li);
  });
  document.getElementById('out').textContent = JSON.stringify(results);
  document.title = 'done';
}
