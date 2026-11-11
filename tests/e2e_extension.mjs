// Loads the real unpacked extension in Chromium and checks image scoring end to end.
// X, pbs.twimg.com and cdn.bsky.app are mapped to a local https server, so nothing leaves the machine.
// Env: EXT (extension dir), OASIS_DIR (folder with OASIS jpgs), CERT_DIR (key.pem, cert.pem). Skips when inputs are missing.
import http from 'node:http'; import https from 'node:https'; import fs from 'node:fs'; import path from 'node:path';
import os from 'node:os'; import { createRequire } from 'node:module'; import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const EXT = path.resolve(process.env.EXT || 'chrome_extension');
const OASIS = process.env.OASIS_DIR || 'image_part/image_rating_resources/6pnd7-osfstorage-archive/Stimulus set/OASIS/images';
const need = ['image_affect/model/clip_vit_b32_int8.onnx'].map((f) => path.join(EXT, f));
let pw; try { pw = require('playwright'); } catch (e) {}
if (!pw || need.some((f) => !fs.existsSync(f)) || !fs.existsSync(OASIS)) { console.log('SKIP  [e2e] playwright, model or OASIS images missing'); process.exit(0); }

const cert = process.env.CERT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'calm-cert-'));
if (!fs.existsSync(path.join(cert, 'key.pem'))) execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${cert}/key.pem -out ${cert}/cert.pem -days 2 -subj /CN=x.com`, { stdio: 'ignore' });
const PICS = { han: 'Car crash 1.jpg', hap: 'Beach 1.jpg', neu: 'Bark 1.jpg' };
const page = `<!doctype html><meta charset=utf-8><body><nav><a data-testid="SideNav_NewTweet_Button">Post</a></nav><div id=feed></div>
<script>
function add(id, text, pic) { var a = document.createElement('article'); a.setAttribute('data-testid','tweet'); a.id = 'p' + id;
  a.innerHTML = '<a href="https://x.com/u/status/' + id + '"><time>t</time></a><div data-testid="tweetText"></div>' +
   '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/' + pic + '?format=jpg&name=large"></div>';
  a.querySelector('[data-testid=tweetText]').textContent = text; document.getElementById('feed').appendChild(a); }
</script>`;
const srv = https.createServer({ key: fs.readFileSync(cert + '/key.pem'), cert: fs.readFileSync(cert + '/cert.pem') }, (q, s) => {
  const u = new URL(q.url, 'https://x.com');
  if (u.pathname.startsWith('/media/')) {
    const f = PICS[u.pathname.slice(7)];
    if (!f) { s.statusCode = 404; return s.end(); }
    s.setHeader('content-type', 'image/jpeg'); s.setHeader('access-control-allow-origin', '*'); return s.end(fs.readFileSync(path.join(OASIS, f)));
  }
  s.setHeader('content-type', 'text/html'); s.end(page);
}).listen(8443);

const results = [];
const check = (name, ok, extra) => { results.push(ok); console.log((ok ? 'PASS' : 'FAIL') + '  [e2e] ' + name + (extra ? '  ' + extra : '')); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calm-prof-'));
const ctx = await pw.chromium.launchPersistentContext(dir, {
  headless: false, ignoreHTTPSErrors: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--ignore-certificate-errors', '--no-proxy-server',
    '--host-resolver-rules=MAP x.com 127.0.0.1:8443, MAP pbs.twimg.com 127.0.0.1:8443, MAP cdn.bsky.app 127.0.0.1:8443']
});
try {
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  check('extension loads with a service worker', !!sw && sw.url().endsWith('image_affect/background.js'));
  await sw.evaluate(() => chrome.storage.local.set({ scoreImages: true }));
  const pg = await ctx.newPage();
  const errors = []; pg.on('pageerror', (e) => errors.push(e.message));
  await pg.goto('https://x.com/home');
  await pg.evaluate(() => add(1, 'The meeting is at noon', 'han'));
  const t0 = Date.now();
  await pg.waitForFunction(() => document.getElementById('p1').style.display === 'none', null, { timeout: 60000 }).catch(() => {});
  const cold = Date.now() - t0;
  check('negative arousing image hides an otherwise neutral post', await pg.evaluate(() => document.getElementById('p1').style.display) === 'none', `first score ${cold} ms (cold, model load included)`);
  const t1 = Date.now();
  await pg.evaluate(() => { add(2, 'The meeting is at noon', 'hap'); add(3, '', 'neu'); });
  await pg.waitForFunction(() => document.getElementById('p2').style.border.includes('yellow') && document.getElementById('p3').style.border.includes('gray'), null, { timeout: 60000 }).catch(() => {});
  const warm = Date.now() - t1;
  const b2 = await pg.evaluate(() => document.getElementById('p2').style.border), b3 = await pg.evaluate(() => document.getElementById('p3').style.border);
  check('positive arousing image outlines yellow', b2.includes('yellow'), b2);
  check('image only post with a neutral image outlines gray', b3.includes('gray'), b3 + `  two images in ${warm} ms`);
  check('no page errors', errors.length === 0, errors.join('|'));
  const ctxs = await sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length);
  check('one offscreen document is running', ctxs === 1);
  // switch off: a new image post must not be scored
  await sw.evaluate(() => chrome.storage.local.set({ scoreImages: false }));
  await pg.waitForTimeout(300);
  await pg.evaluate(() => add(4, 'The meeting is at noon', 'han'));
  await pg.waitForTimeout(3000);
  check('switch off: image is ignored', await pg.evaluate(() => document.getElementById('p4').style.display) !== 'none');
} finally { await ctx.close(); srv.close(); }
process.exit(results.every(Boolean) ? 0 : 1);
