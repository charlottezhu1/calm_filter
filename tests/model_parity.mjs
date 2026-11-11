// The browser pipeline (canvas preprocessing, WASM model, head) must reproduce human OASIS ratings.
// Scores 80 OASIS images in Chromium and checks Pearson r against the OASIS means. Env: EXT, OASIS_DIR, OASIS_CSV.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const EXT = path.resolve(process.env.EXT || 'chrome_extension') + '/image_affect/';
const RES = 'image_part/image_rating_resources/6pnd7-osfstorage-archive/Stimulus set/OASIS/';
const OASIS = process.env.OASIS_DIR || RES + 'images';
const CSV = process.env.OASIS_CSV || RES + 'OASIS.csv';
let pw; try { pw = require('playwright'); } catch (e) {}
if (!pw || !fs.existsSync(EXT + 'model/clip_vit_b32_int8.onnx') || !fs.existsSync(OASIS) || !fs.existsSync(CSV)) { console.log('SKIP  [parity] playwright, model or OASIS files missing'); process.exit(0); }
const rows = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.replace(/"/g, '').split(','));
const sample = rows.filter((_, i) => i % 11 === 0).slice(0, 80);   // spread over all categories
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u === '/' ? null : u.startsWith('/img/') ? path.join(OASIS, u.slice(5)) : EXT + u.slice(1);
  if (!f) { s.setHeader('content-type', 'text/html'); return s.end('<body></body>'); }
  fs.readFile(f, (e, d) => { if (e) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); s.end(d); });
}).listen(8768);
const b = await pw.chromium.launch(); const pg = await b.newPage();
await pg.goto('http://localhost:8768/');
await pg.addScriptTag({ url: '/ort/ort.wasm.min.js' }); await pg.addScriptTag({ url: '/embed.js' });
const scores = await pg.evaluate(async (names) => {
  const base = 'http://localhost:8768/'; await CalmEmbed.init(base); const out = [];
  for (let i = 0; i < names.length; i += 8) out.push(...await CalmEmbed.scoreUrls(names.slice(i, i + 8).map((n) => base + 'img/' + encodeURIComponent(n + '.jpg'))));
  return out;
}, sample.map((r) => r[1].trim()));
await b.close(); srv.close();
const r = (x, y) => { const n = x.length, mx = x.reduce((a, c) => a + c) / n, my = y.reduce((a, c) => a + c) / n; let sxy = 0, sxx = 0, syy = 0; x.forEach((v, i) => { sxy += (v - mx) * (y[i] - my); sxx += (v - mx) ** 2; syy += (y[i] - my) ** 2; }); return sxy / Math.sqrt(sxx * syy); };
const ok = scores.every(Boolean);
const rv = r(scores.map((s) => s.v), sample.map((x) => +x[4])), ra = r(scores.map((s) => s.a), sample.map((x) => +x[7]));
const pass = ok && rv >= 0.85 && ra >= 0.85;
console.log(`${pass ? 'PASS' : 'FAIL'}  [parity] browser scores vs OASIS means on ${sample.length} images: r valence ${rv.toFixed(3)}, arousal ${ra.toFixed(3)} (in sample, gate 0.85)`);
process.exit(pass ? 0 : 1);
