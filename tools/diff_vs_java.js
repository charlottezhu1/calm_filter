// Differential test: JS SentiStrength port vs the real jar, on identical texts.
//   node diff_vs_java.js fuzz [count] [seed]   edge cases + random strings built from the lexicons
//   node diff_vs_java.js file texts.b64         base64 UTF-8 texts, one per line
// Needs java/javac on PATH. Optional: SS_DATA=<data.js> SS_EN=<word-list folder> to test other word lists
// (default: the extension's data vs third_party/SentiStrength).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createScorer } = require('../chrome_extension/sentistrength.js');
const data = require(process.env.SS_DATA ? path.resolve(process.env.SS_DATA) : '../chrome_extension/sentistrength_data.js');

const JAR = path.join(__dirname, '..', 'backend', 'py4j', 'libs', 'SentiStrength.jar');
const EN = (process.env.SS_EN ? path.resolve(process.env.SS_EN) : path.join(__dirname, '..', 'third_party', 'SentiStrength')) + '/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'ssdiff-'));

function javaScores(texts) {
  const classes = path.join(work, 'classes');
  fs.mkdirSync(classes, { recursive: true });
  let r = spawnSync('javac', ['-cp', JAR, '-d', classes, path.join(__dirname, 'Oracle.java')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  const input = path.join(work, 'in.b64');
  const output = path.join(work, 'out.txt');
  fs.writeFileSync(input, texts.map((t) => Buffer.from(t, 'utf8').toString('base64')).join('\n') + '\n');
  r = spawnSync('java', ['-cp', classes + ':' + JAR, 'Oracle', EN, input, output], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(r.stderr);
  return fs.readFileSync(output, 'utf8').split('\n').slice(0, texts.length);
}

// ---------- text generation ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EDGE = ['', ' ', '  ', '.', '!', '?', 'a', 'I', ':)', ':-(', ':P', '!!!', '...', '"quoted"', "it's", "don't like", 'dont like',
  'not', 'very', 'love', 'LOVE', 'Love', 'loooove', 'looooove it', 'sooooo good', 'hahahaha', 'lol', 'xxxxx', 'wwww', 'miss', 'I miss you',
  'a<br>b', 'good<br>bad', 'good.bad', 'good. bad', 'Good! Bad!', 'good!bad', 'good?bad', '@user good', '@user: good', 'Obama is good',
  'I am good', "I'm good", 'it is $5 good', '😀 good', 'good 😀', 'café good', 'good\nbad', 'good\tbad', 'good  bad', ' good', 'good ',
  'not not good', 'not very good', 'very very good', 'very not good', 'not bad', 'not hate', 'extremely terrible!!!', 'GREAT!!!', 'great!!', 'great ! !',
  'hate hate hate', 'love love love', 'abandon', 'abandoned', 'abandonment', 'abandon*', 'zzzz', '1234', '!!!!!!!!!!', 'what a day!!! so bad :(',
  'a. b. c. d.', 'wow... really?', '"I love you" she said', 'I "love" you', 'http://x.com/good', 'good_bad', 'good-bad', 'good/bad'];

function buildFuzz(count, seed) {
  const rand = rng(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const lines = (s) => s.split(/\r\n|\r|\n/).filter(Boolean);
  const lex = lines(data.sentiment).map((l) => l.split('\t')[0]).filter((w) => !w.startsWith('*'));
  const boosters = lines(data.booster).map((l) => l.split('\t')[0]);
  const negators = lines(data.negating);
  const idioms = lines(data.idioms).map((l) => l.split('\t')[0]);
  const emoticons = lines(data.emoticons).map((l) => l.split('\t')[0]);
  const dictionary = lines(data.dictionary);
  const puncts = ['', '', '', '', '.', '!', '!!', '?', '?!', ',', '...', '"', ':', ';', '!!!?', ')', '(', '-'];
  const noise = ['http://t.co/abc', '#hashtag', '@someone', '@Someone:', 'RT', "I'm", "don't", "can't", 'dont', 'haha', 'hahahaha', 'lolol', 'hehehe',
    'xxx', 'wwwww', '$5', '£10', '😀', '🚨', '👇🏻', 'café', 'naïve', '123', '4.5', 'I', 'a', 'the', 'of', 'ok', 'OK', '<br>', '&amp;'];

  function stretch(w) {
    if (w.length === 0) return w;
    const i = Math.floor(rand() * w.length);
    return w.slice(0, i + 1) + w[i].repeat(1 + Math.floor(rand() * 4)) + w.slice(i + 1);
  }
  function token() {
    const r = rand();
    let w;
    if (r < 0.34) w = pick(lex);
    else if (r < 0.44) w = pick(boosters);
    else if (r < 0.54) w = pick(negators);
    else if (r < 0.60) w = pick(idioms);
    else if (r < 0.66) return pick(emoticons);
    else if (r < 0.80) w = pick(dictionary);
    else w = pick(noise);
    // wildcard stems: add a suffix so the stem lookup is exercised
    if (w.endsWith('*')) w = w.slice(0, -1) + pick(['', 's', 'ed', 'ing', 'ly', 'ness', 'xyz']);
    const m = rand();
    if (m < 0.10) w = w.toUpperCase();
    else if (m < 0.20) w = w.charAt(0).toUpperCase() + w.slice(1);
    else if (m < 0.28) w = stretch(w);
    else if (m < 0.31) w = '@' + w;
    return w + pick(puncts);
  }
  const out = EDGE.slice();
  while (out.length < count) {
    const n = 1 + Math.floor(rand() * 14);
    let s = '';
    for (let i = 0; i < n; i++) {
      s += token();
      if (i < n - 1) s += pick([' ', ' ', ' ', ' ', ' ', '  ', '<br>', '\n', '']);
    }
    out.push(s);
  }
  return out;
}

// ---------- compare ----------
function compare(texts) {
  const scorer = createScorer(data);
  const java = javaScores(texts);
  let bad = 0;
  texts.forEach((t, i) => {
    const r = scorer.score(t);
    const js = `${r.positive} ${r.negative}`;
    if (js !== java[i].trim()) {
      if (bad++ < 25) console.log(`MISMATCH js=${js} java=${java[i]} text=${JSON.stringify(t)}`);
    }
  });
  console.log(`${texts.length} texts, ${bad} mismatches (${(100 * (texts.length - bad) / texts.length).toFixed(3)}% identical)`);
  return bad;
}

const [mode, arg1, arg2] = process.argv.slice(2);
let texts;
if (mode === 'fuzz') texts = buildFuzz(parseInt(arg1 || '5000', 10), parseInt(arg2 || '1', 10));
else if (mode === 'file') texts = fs.readFileSync(arg1, 'utf8').split('\n').filter(Boolean).map((l) => Buffer.from(l, 'base64').toString('utf8'));
else { console.error('usage: node diff_vs_java.js fuzz [count] [seed] | file texts.b64'); process.exit(2); }
process.exitCode = compare(texts) ? 1 : 0;
