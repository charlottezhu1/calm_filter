// Scores base64-encoded texts (one per line, stdin) with the JS SentiStrength port.
// Usage: node score_texts.js data1.js [data2.js ...] < texts.b64 > scores.txt
// Output: one line per input line: "pos1 neg1 [pos2 neg2 ...]", one pair per data file.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createScorer } = require('../chrome_extension/sentistrength.js');

const scorers = process.argv.slice(2).map((f) => createScorer(require(path.resolve(f))));
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const out = fs.createWriteStream(null, { fd: 1 });

rl.on('line', (line) => {
  const text = Buffer.from(line, 'base64').toString('utf8');
  const parts = [];
  for (const s of scorers) {
    const r = s.score(text);
    parts.push(r.positive, r.negative);
  }
  out.write(parts.join(' ') + '\n');
});
