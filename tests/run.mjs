// Runs every test for the extension:   node tests/run.mjs
//   1. the extension's files are all there and wired up (manifest, script order, syntax)
//   2. chart.js maths
//   3. the scorer agrees with the study data on a small sample (skipped if the data file is absent)
//   4. the extension in a headless Chrome, on fake X and Bluesky pages and the popup (tests/suite.js)
//
//   node tests/run.mjs --serve    just serve the browser tests, to open the printed link in any browser
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'chrome_extension');

let passed = 0, failed = 0, skipped = 0;
function report(group, name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${ok ? '' : '  -> ' + detail}`);
}
function check(group, name, fn) {
  try { fn(); report(group, name, true); } catch (e) { report(group, name, false, e.message); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ---------------------------------------------------------------- 1. files and manifest
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

check('files', 'manifest is Manifest V3 with only the storage permission', () => {
  assert(manifest.manifest_version === 3, 'not MV3');
  assert(JSON.stringify(manifest.permissions) === '["storage"]', 'permissions: ' + JSON.stringify(manifest.permissions));
});
check('files', 'popup and icons exist', () => {
  assert(fs.existsSync(path.join(EXT, manifest.action.default_popup)), 'popup missing');
  assert(fs.existsSync(path.join(EXT, manifest.action.default_icon)), 'action icon missing');
  for (const f of Object.values(manifest.icons)) assert(fs.existsSync(path.join(EXT, f)), f + ' missing');
});

const SITES = [
  { name: 'X (x.com)', match: '*://*.x.com/*', siteFile: 'sites/x.js' },
  { name: 'X (twitter.com)', match: '*://*.twitter.com/*', siteFile: 'sites/x.js' },
  { name: 'Bluesky', match: '*://*.bsky.app/*', siteFile: 'sites/bluesky.js' }
];
for (const site of SITES) {
  check('files', `${site.name}: content scripts exist and load in the right order`, () => {
    const block = manifest.content_scripts.find((c) => c.matches.includes(site.match));
    assert(block, 'no content script matches ' + site.match);
    for (const f of block.js) assert(fs.existsSync(path.join(EXT, f)), f + ' missing');
    const at = (f) => block.js.indexOf(f);
    for (const f of ['sentistrength_data.js', 'sentistrength.js', 'chart.js', site.siteFile, 'content.js']) assert(at(f) !== -1, f + ' is not listed');
    const order = ['sentistrength_data.js', 'sentistrength.js', 'chart.js', site.siteFile, 'content.js'].map(at);
    assert(order.every((v, i) => i === 0 || v > order[i - 1]), 'wrong order: ' + block.js.join(', '));
    assert(JSON.stringify(manifest.host_permissions).includes(site.match), 'no host permission for ' + site.match);
  });
}
check('files', 'every extension script is valid JavaScript', () => {
  const files = ['content.js', 'chart.js', 'settings.js', 'sentistrength.js', 'sites/x.js', 'sites/bluesky.js'];
  for (const f of files) new vm.Script(fs.readFileSync(path.join(EXT, f), 'utf8'), { filename: f });
});
check('files', 'the popup page loads chart.js before settings.js', () => {
  const html = fs.readFileSync(path.join(EXT, 'settings.html'), 'utf8');
  const a = html.indexOf('chart.js'), b = html.indexOf('settings.js');
  assert(a !== -1 && b !== -1 && a < b, 'order wrong');
});

check('files', 'X and Bluesky each declare their own storage key', () => {
  const sites = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(EXT, 'chart.js'), 'utf8'), sites);
  const keyOf = (file) => {
    const c = vm.createContext({});
    vm.runInContext(fs.readFileSync(path.join(EXT, file), 'utf8') + '\n;this.key = CalmFilterSite.key;', c);
    return c.key;
  };
  const x = keyOf('sites/x.js'), b = keyOf('sites/bluesky.js');
  assert(x && b && x !== b, `keys must be set and different, got ${x} and ${b}`);
  const known = sites.CALM_SITES.map((s) => s.key);
  assert(known.includes(x) && known.includes(b), 'popup does not know ' + x + ' / ' + b);
});

// ---------------------------------------------------------------- 2. chart.js maths
{
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(EXT, 'chart.js'), 'utf8'), ctx);
  const zero = { HAN: 0, LAN: 0, NEU: 0, LAP: 0, HAP: 0 };
  check('chart', 'percent is 0 when nothing is counted', () => assert(ctx.affectPercent(zero, 'HAN') === 0, 'not 0'));
  check('chart', 'percent rounds and matches the bar', () => {
    const c = { HAN: 1, LAN: 0, NEU: 1, LAP: 0, HAP: 1 };
    assert(ctx.affectPercent(c, 'HAN') === 33, 'got ' + ctx.affectPercent(c, 'HAN'));
  });
  check('chart', 'bars fill the whole width in order, negative on the left', () => {
    const rects = [];
    const fake = { fillRect: (x, y, w) => rects.push([x, w]), fillText() {}, set fillStyle(v) {}, set font(v) {} };
    ctx.drawAffectBars(fake, 10, 0, 200, { HAN: 1, LAN: 1, NEU: 2, LAP: 0, HAP: 0 }, '#000');
    assert(rects.length === 5, 'five bars');
    assert(rects[0][0] === 10, 'starts at x');
    assert(Math.abs(rects.reduce((s, r) => s + r[1], 0) - 200) < 1e-9, 'widths add up to 200');
    assert(ctx.CALM_CATEGORIES.map((c) => c.key).join() === 'HAN,LAN,NEU,LAP,HAP', 'order');
  });
}

// ---------------------------------------------------------------- 3. scorer vs study data (small sample)
{
  const CSV = path.join(ROOT, 'analysis', 'tests', 'posts_sentis_text_anon.csv');
  if (!fs.existsSync(CSV)) {
    skipped++;
    console.log('SKIP  [scorer] study data file not found, sample check skipped');
  } else {
    const { createScorer } = require(path.join(EXT, 'sentistrength.js'));
    const scorer = createScorer(require(path.join(EXT, 'sentistrength_data.js')));
    const size = fs.statSync(CSV).size;
    const fd = fs.openSync(CSV, 'r');
    const CHUNK = 150000, CHUNKS = 12;
    let rows = 0, wrong = 0, firstWrong = '';
    for (let k = 0; k < CHUNKS; k++) {
      const buf = Buffer.alloc(CHUNK);
      const read = fs.readSync(fd, buf, 0, CHUNK, Math.floor((size - CHUNK) * k / (CHUNKS - 1)));
      const text = buf.toString('utf8', 0, read);
      const start = k === 0 ? text.indexOf('\nP') + 1 : text.search(/\nP\d_\d{7},/) + 1;   // first whole row
      for (const row of parseRows(text.slice(start))) {
        if (row.length !== 12 || row[2] === '2') continue;   // study 2's labels were made differently (see results.md there)
        rows++;
        const [, , , , han, lan, hap, lap, neu] = row;
        const s = scorer.score(row[11]);
        const expected = [han, lan, hap, lap, neu].join();
        const got = [s.negative <= -3, s.negative === -2, s.positive >= 3, s.positive === 2, s.positive === 1 && s.negative === -1]
          .map((b) => (b ? 1 : 0)).join();
        if (expected !== got) { wrong++; firstWrong = firstWrong || `${row[0]}: expected ${expected}, got ${got}`; }
      }
    }
    fs.closeSync(fd);
    check('scorer', `categories match the study labels on a sample of ${rows} posts (studies 1 and 3)`, () => {
      assert(rows >= 1000, 'only found ' + rows + ' rows');
      assert(wrong === 0, `${wrong} differ, first: ${firstWrong}`);
    });
  }
}
// rows of a CSV text; a last row that is cut off is dropped
function parseRows(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  return rows;
}

// ---------------------------------------------------------------- 4. the extension in a browser
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/tests/harness.html`;

if (process.argv.includes('--serve')) {
  console.log(`\nOpen this in any browser to run the page tests:\n  ${url}\n(Ctrl+C to stop)`);
} else {
  const chrome = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].find((p) => p && fs.existsSync(p));

  if (!chrome) {
    skipped++;
    console.log(`SKIP  [browser] Chrome not found. Run "node tests/run.mjs --serve" and open the link, or set CHROME=<path>`);
  } else {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'calm-tests-'));
    const dom = await new Promise((resolve) => {
      execFile(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--user-data-dir=${profile}`, '--virtual-time-budget=300000', '--dump-dom', url],
        { timeout: 280000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => resolve(err && !stdout ? '' : stdout));
    });
    fs.rmSync(profile, { recursive: true, force: true });
    const m = dom.match(/<script type="application\/json" id="out">([\s\S]*?)<\/script>/);
    let results = null;
    try { results = m && m[1].trim() ? JSON.parse(m[1]) : null; } catch (e) { /* reported below */ }
    if (!results) {
      report('browser', 'tests finished and reported results', false, 'no results came back (try --serve and open the link to see why)');
    } else {
      for (const r of results) report(r.group, r.name, r.ok, r.error);
    }
  }
  server.close();
}

if (!process.argv.includes('--serve')) {
  console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  process.exit(failed ? 1 : 0);
}
