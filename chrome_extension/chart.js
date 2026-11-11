// Shared by the page (content.js) and the export popup (settings.js).
// Order is the display order, negative on the left.
var CALM_CATEGORIES = [
  { key: 'HAN', emoji: '😠', color: 'red' },
  { key: 'LAN', emoji: '🙁', color: 'blue' },
  { key: 'NEU', emoji: '😐', color: 'lightgrey' },
  { key: 'LAP', emoji: '🙂', color: 'green' },
  { key: 'HAP', emoji: '😄', color: 'yellow' }
];

// The sites the extension runs on. Each keeps its own distributions: X (x.com and twitter.com)
// and Bluesky never share or mix counts. A site's key is also set in sites/<site>.js.
var CALM_SITES = [
  { key: 'x', label: 'X' },
  { key: 'bluesky', label: 'Bluesky' }
];

// Percentages are of the category counts, which can add up to more than the number
// of posts because one post can be in two categories (e.g. HAP and HAN).
function affectPercent(counts, key) {
  var total = 0;
  CALM_CATEGORIES.forEach(function(cat) { total += counts[cat.key]; });
  return total ? Math.round(counts[key] / total * 100) : 0;
}

// The bar plus emoji and percent labels, with its top-left corner at (x, y).
function drawAffectBars(ctx, x, y, width, counts, textColor) {
  var total = 0;
  CALM_CATEGORIES.forEach(function(cat) { total += counts[cat.key]; });

  var start = x;
  CALM_CATEGORIES.forEach(function(cat) {
    var share = total ? counts[cat.key] / total : 0;
    var barWidth = width * share;

    ctx.fillStyle = cat.color;
    ctx.fillRect(start, y, barWidth, 25);

    // label sits at the bar's midpoint, clamped so edge labels stay inside
    var midX = start + barWidth / 2;
    var labelX = Math.min(Math.max(midX - 10, x), x + width - 24);
    ctx.fillStyle = textColor;
    ctx.font = 'bold 14px arial';
    ctx.fillText(cat.emoji, labelX, y + 40);
    ctx.fillText(Math.round(share * 100) + '%', labelX, y + 55);

    start += barWidth;
  });
}
