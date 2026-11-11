// Latency of the image model in headless Chromium (WASM, 1 thread). Env: EXT, OASIS_DIR. Prints numbers, no gate.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const EXT = path.resolve(process.env.EXT || 'chrome_extension') + '/image_affect/';
const OASIS = process.env.OASIS_DIR || 'image_part/image_rating_resources/6pnd7-osfstorage-archive/Stimulus set/OASIS/images';
let pw; try { pw = require('playwright'); } catch (e) {}
if (!pw || !fs.existsSync(EXT + 'model/clip_vit_b32_int8.onnx') || !fs.existsSync(OASIS)) { console.log('SKIP  [bench] playwright, model or OASIS images missing'); process.exit(0); }
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.jpg': 'image/jpeg' };
const files = fs.readdirSync(OASIS).filter((n) => n.endsWith('.jpg')).slice(0, 40);
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u === '/' ? null : u.startsWith('/img/') ? path.join(OASIS, u.slice(5)) : EXT + u.slice(1);
  if (!f) { s.setHeader('content-type', 'text/html'); return s.end('<body></body>'); }
  fs.readFile(f, (e, d) => { if (e) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); s.end(d); });
}).listen(8767);
const b = await pw.chromium.launch(); const pg = await b.newPage();
await pg.addInitScript(() => { window.__long = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ entryTypes: ['longtask'] }); });
await pg.goto('http://localhost:8767/');
await pg.addScriptTag({ url: '/ort/ort.wasm.min.js' }); await pg.addScriptTag({ url: '/embed.js' });
const r = await pg.evaluate(async (names) => {
  const base = 'http://localhost:8767/', url = (n) => base + 'img/' + encodeURIComponent(n);
  const t = {}; let s = performance.now();
  await CalmEmbed.init(base); t.init = performance.now() - s;
  s = performance.now(); await CalmEmbed.scoreUrls([url(names[0])]); t.first = performance.now() - s;
  const one = [];
  for (let i = 1; i < 21; i++) { s = performance.now(); await CalmEmbed.scoreUrls([url(names[i])]); one.push(performance.now() - s); }
  const four = [];
  for (let i = 0; i < 5; i++) { s = performance.now(); await CalmEmbed.scoreUrls(names.slice(21 + i * 4, 25 + i * 4).map(url)); four.push(performance.now() - s); }
  s = performance.now(); for (let i = 0; i < 20; i += 4) await CalmEmbed.scoreUrls(names.slice(i, i + 4).map(url)); t.burst20 = performance.now() - s;
  const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
  return { t, p50: q(one, 0.5), p95: q(one, 0.95), batch4: q(four, 0.5), heap: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null };
}, files);
console.log(JSON.stringify(r, (k, v) => typeof v === 'number' ? Math.round(v) : v));
await b.close(); srv.close();
