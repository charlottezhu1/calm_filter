// Scores one text per line with the extension's own AFINN module (chrome_extension/sentiment.js).
// usage: node afinn_score.js <sentiment.js> <texts.txt> <out.tsv>   (out: "pos<TAB>neg" per line)
const fs = require('fs');
const vm = require('vm');
const readline = require('readline');

const [, , sentimentPath, inPath, outPath] = process.argv;
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(sentimentPath, 'utf8') + '\n;this.Sentimood = Sentimood;', ctx);

const out = fs.createWriteStream(outPath);
readline.createInterface({ input: fs.createReadStream(inPath, 'utf8') })
  .on('line', text => {
    const s = ctx.Sentimood.prototype.analyze(text);
    out.write(s.positive.score + '\t' + s.negative.score + '\n');
  })
  .on('close', () => out.end());
