// Embeds all 900 OASIS images in Chromium with the shipped pipeline (WASM, canvas preprocessing).
// Writes raw embeddings to image_part/out/emb_browser.json for refitting the head. Env: EXT, OASIS_DIR, OASIS_CSV, OUT.
import http from 'http'; import fs from 'fs'; import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const EXT = path.resolve(process.env.EXT || 'chrome_extension') + '/image_affect/';
const RES = 'image_part/image_rating_resources/6pnd7-osfstorage-archive/Stimulus set/OASIS/';
const IMG = process.env.OASIS_DIR || RES + 'images/';
const types = { '.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.html':'text/html','.jpg':'image/jpeg','.onnx':'application/octet-stream' };
const srv = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  let f = u === '/' ? null : u.startsWith('/img/') ? IMG + u.slice(5) : EXT + u.slice(1);
  if (u === '/') { s.setHeader('content-type','text/html'); return s.end('<html><body></body></html>'); }
  fs.readFile(f, (e, d) => { if (e) { s.statusCode = 404; return s.end(); } s.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); s.end(d); });
}).listen(8765);
const names = fs.readdirSync(IMG).filter(n => n.endsWith('.jpg'));
const csv = fs.readFileSync(process.env.OASIS_CSV || RES + 'OASIS.csv','utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.match(/^"[^"]*","([^"]*)"/)[1].trim());
const files = new Map(names.map(n => [n.replace(/\.jpg$/,'').trim(), n]));
const order = csv.map(t => files.get(t));
if (order.some(x => !x)) throw new Error('missing file');
const b = await chromium.launch();
const pg = await b.newPage();
pg.on('console', m => console.log('page:', m.text()));
pg.on('pageerror', e => console.log('pageerror', e.message));
await pg.goto('http://localhost:8765/');
await pg.addScriptTag({ url: '/ort/ort.wasm.min.js' });
await pg.addScriptTag({ url: '/embed.js' });
const t0 = Date.now();
await pg.evaluate(() => CalmEmbed.init('http://localhost:8765/'));
console.log('init ms', Date.now() - t0);
const t1 = Date.now();
const embs = await pg.evaluate(async (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += 8) {
    const px = [];
    for (const n of list.slice(i, i + 8)) { const bm = await CalmEmbed.fetchBitmap('/img/' + n); px.push(CalmEmbed.preprocess(bm)); }
    for (const e of await CalmEmbed.embedBatch(px)) out.push(Array.from(e));
  }
  return out;
}, order);
console.log('embed 900 ms', Date.now() - t1);
fs.writeFileSync(process.env.OUT || 'image_part/out/emb_browser.json', JSON.stringify(embs));
await b.close(); srv.close();
