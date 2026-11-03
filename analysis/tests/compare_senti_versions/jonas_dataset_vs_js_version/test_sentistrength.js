// Scores every row of posts_sentis_text_anon.csv with the JS SentiStrength port and
// compares with the ss_pos / ss_neg columns and with the HAN/LAN/HAP/LAP/NEU label columns.
// Labels (original paper): HAN neg<=-3, LAN neg=-2, HAP pos>=3, LAP pos=2, NEU pos=1 and neg=-1.
// Usage: [SS_DATA=otherData.js] node test_sentistrength.js [maxRows] [mismatchesOut.tsv]
const fs = require('fs');
const path = require('path');
const { createScorer } = require('../../../../chrome_extension/sentistrength.js');
const data = require(process.env.SS_DATA ? path.resolve(process.env.SS_DATA) : '../../../../chrome_extension/sentistrength_data.js');

const CSV = path.join(__dirname, '..', '..', 'posts_sentis_text_anon.csv');
const maxRows = parseInt(process.argv[2] || '0', 10) || Infinity;
const outFile = process.argv[3];

const scorer = createScorer(data);
const LABELS = ['HAN', 'LAN', 'HAP', 'LAP', 'NEU'];
const stats = { rows: 0, exact: 0, posOk: 0, negOk: 0, jsLabels: 0, csvSsLabels: 0 };
const perLabel = Object.fromEntries(LABELS.map((l) => [l, { jsOk: 0, csvSsOk: 0 }]));

function labelsFor(pos, neg) {
  return [neg <= -3, neg === -2, pos >= 3, pos === 2, pos === 1 && neg === -1];
}
const byStudy = {};
const mismatches = [];
let header = null;
let cols = null;

function onRow(fields) {
  if (!header) {
    header = fields;
    cols = { labels: LABELS.map((l) => header.indexOf(l)), id: header.indexOf('anon_post_id'), pos: header.indexOf('ss_pos'), neg: header.indexOf('ss_neg'), text: header.indexOf('text') };
    return true;
  }
  if (fields.length < header.length) return true;
  const csvPos = parseInt(fields[cols.pos], 10);
  const csvNeg = parseInt(fields[cols.neg], 10);
  const r = scorer.score(fields[cols.text]);
  stats.rows++;
  const pOk = r.positive === csvPos;
  const nOk = r.negative === csvNeg;
  if (pOk) stats.posOk++;
  if (nOk) stats.negOk++;
  const csvLabels = cols.labels.map((i) => fields[i] === '1');
  const jsL = labelsFor(r.positive, r.negative);
  const ssL = labelsFor(csvPos, csvNeg);
  let jsAll = true;
  let ssAll = true;
  LABELS.forEach((l, k) => {
    if (jsL[k] === csvLabels[k]) perLabel[l].jsOk++; else jsAll = false;
    if (ssL[k] === csvLabels[k]) perLabel[l].csvSsOk++; else ssAll = false;
  });
  const study = fields[cols.id].split('_')[0];
  byStudy[study] = byStudy[study] || { rows: 0, labelsOk: 0, ssLabelsOk: 0, exact: 0 };
  byStudy[study].rows++;
  if (jsAll) byStudy[study].labelsOk++;
  if (ssAll) byStudy[study].ssLabelsOk++;
  if (pOk && nOk) byStudy[study].exact++;
  if (jsAll) stats.jsLabels++;
  if (ssAll) stats.csvSsLabels++;
  if (pOk && nOk) stats.exact++;
  else mismatches.push([fields[cols.id], csvPos, csvNeg, r.positive, r.negative, Buffer.from(fields[cols.text]).toString('base64')].join('\t'));
  return stats.rows < maxRows;
}

// Minimal streaming CSV parser (quoted fields may contain commas, quotes and newlines).
let field = '';
let row = [];
let inQuotes = false;
let pendingQuote = false;
let keepGoing = true;

function endField() { row.push(field); field = ''; }
function endRow() {
  endField();
  keepGoing = onRow(row);
  row = [];
}

function feed(chunk) {
  for (let i = 0; i < chunk.length && keepGoing; i++) {
    const c = chunk[i];
    if (pendingQuote) {
      pendingQuote = false;
      if (c === '"') { field += '"'; continue; }
      inQuotes = false;
    }
    if (inQuotes) {
      if (c === '"') pendingQuote = true; else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      endField();
    } else if (c === '\n') {
      endRow();
    } else if (c !== '\r') {
      field += c;
    }
  }
}

const t0 = Date.now();
const stream = fs.createReadStream(CSV, { encoding: 'utf8', highWaterMark: 4 << 20 });
stream.on('data', (chunk) => {
  feed(chunk);
  if (!keepGoing) stream.destroy();
});
stream.on('close', () => {
  if (keepGoing && (field !== '' || row.length)) endRow();
  const pct = (n) => (100 * n / stats.rows).toFixed(3) + '%';
  console.log(`rows ${stats.rows}  exact ${stats.exact} (${pct(stats.exact)})  pos ${pct(stats.posOk)}  neg ${pct(stats.negOk)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`all 5 labels identical to CSV label columns:  JS scores ${pct(stats.jsLabels)}   CSV ss_pos/ss_neg columns ${pct(stats.csvSsLabels)}`);
  for (const l of LABELS) console.log(`  ${l}: JS ${pct(perLabel[l].jsOk)}   CSV ss cols ${pct(perLabel[l].csvSsOk)}`);
  for (const [s, v] of Object.entries(byStudy)) console.log(`  ${s}: ${v.rows} rows  labels identical ${(100 * v.labelsOk / v.rows).toFixed(3)}%  (CSV ss cols -> labels ${(100 * v.ssLabelsOk / v.rows).toFixed(3)}%)  exact ss ${(100 * v.exact / v.rows).toFixed(3)}%`);
  if (outFile) {
    fs.writeFileSync(outFile, 'id\tcsv_pos\tcsv_neg\tjs_pos\tjs_neg\ttext_b64\n' + mismatches.join('\n') + '\n');
    console.log('mismatches written to', outFile);
  }
});
