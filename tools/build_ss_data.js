// Packs a SentiStrength word-list folder into a JS data file for sentistrength.js.
// Default: third_party/SentiStrength -> chrome_extension/sentistrength_data.js (what the extension ships with).
// Another word-list folder, e.g. backend/py4j/en, can be given instead:
//   node tools/build_ss_data.js backend/py4j/en /tmp/data_backend.js
// Usage: node build_ss_data.js [wordListDir] [outFile]
const fs = require('fs');
const path = require('path');

const EN = process.argv[2] || path.join(__dirname, '..', 'third_party', 'SentiStrength');
const OUT = process.argv[3] || path.join(__dirname, '..', 'chrome_extension', 'sentistrength_data.js');

const files = {
  sentiment: 'SentimentLookupTable.txt',
  booster: 'BoosterWordList.txt',
  idioms: 'IdiomLookupTable.txt',
  emoticons: 'EmoticonLookupTable.txt',
  negating: 'NegatingWordList.txt',
  irony: 'IronyTerms.txt',
  dictionary: 'Dictionary.txt',
};

const data = {};
for (const [key, name] of Object.entries(files)) {
  data[key] = fs.readFileSync(path.join(EN, name), 'utf8');
}

const body = 'var SENTISTRENGTH_DATA = ' + JSON.stringify(data) + ';\n' +
  "if (typeof module !== 'undefined' && module.exports) module.exports = SENTISTRENGTH_DATA;\n";
fs.writeFileSync(OUT, body);
console.log('wrote', OUT, (body.length / 1024).toFixed(0) + ' KB');
