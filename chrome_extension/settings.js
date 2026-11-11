const SWITCHES = ['filterHan', 'showColors', 'showChart'];

chrome.storage.local.get({ filterHan: true, showColors: true, showChart: true }, function(saved) {
  SWITCHES.forEach(function(id) {
    document.getElementById(id).checked = saved[id];
  });
});

SWITCHES.forEach(function(id) {
  document.getElementById(id).addEventListener('change', function(e) {
    chrome.storage.local.set({ [id]: e.target.checked });
  });
});

// ---- Export: reads the counters the page saved, so it works from any tab ----
var exportable = [];   // distributions as {site, name, startedOn, n, counts}

function fileSafe(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').trim().slice(0, 100) || 'affect distribution';
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

function selectedCounters() {
  var boxes = document.querySelectorAll('#counterList input:checked');
  return Array.prototype.map.call(boxes, function(box) { return exportable[box.value]; });
}

function updateButtons() {
  var none = selectedCounters().length === 0;
  ['downloadPng', 'downloadJson', 'copyJson'].forEach(function(id) {
    document.getElementById(id).disabled = none;
  });
}

function summary(c) {
  var out = { site: c.site, name: c.name, started_on: c.startedOn, n: c.n };
  CALM_CATEGORIES.forEach(function(cat) {
    out[cat.key] = { count: c.counts[cat.key], pct: affectPercent(c.counts, cat.key) };
  });
  return out;
}

function save(blob, filename) {
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function pngFor(c, done) {
  // 2x for sharpness, always white with dark text so it reads the same in any theme
  var canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 220;
  var ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 300, 110);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 15px arial';
  ctx.fillText(c.name + ' (n=' + c.n + ')', 10, 22, 280);
  drawAffectBars(ctx, 10, 34, 280, c.counts, '#000');
  canvas.toBlob(done, 'image/png');
}

document.getElementById('downloadPng').addEventListener('click', function() {
  var used = {};
  selectedCounters().forEach(function(c) {
    var base = fileSafe(c.name);
    var file = base;
    for (var k = 2; used[file]; k++) file = base + ' (' + k + ')';   // two counters with one name
    used[file] = true;
    pngFor(c, function(blob) { save(blob, file + '.png'); });
  });
  setStatus('Saved ' + Object.keys(used).length + ' PNG(s)');
});

document.getElementById('downloadJson').addEventListener('click', function() {
  var json = JSON.stringify(selectedCounters().map(summary), null, 2);
  save(new Blob([json], { type: 'application/json' }), 'affect-distribution.json');
  setStatus('Saved JSON');
});

document.getElementById('copyJson').addEventListener('click', function() {
  var json = JSON.stringify(selectedCounters().map(summary), null, 2);
  navigator.clipboard.writeText(json).then(
    function() { setStatus('Copied'); },
    function() { setStatus('Copy failed'); });
});

chrome.storage.local.get(CALM_SITES.map(function(s) { return 'counters:' + s.key; }), function(saved) {
  exportable = [];
  CALM_SITES.forEach(function(site) {
    var list = saved['counters:' + site.key];
    (Array.isArray(list) ? list : []).filter(function(c) {
      return c && typeof c.name === 'string' && c.counts;
    }).forEach(function(c) {
      var counts = {};
      CALM_CATEGORIES.forEach(function(cat) { counts[cat.key] = Number(c.counts[cat.key]) || 0; });
      exportable.push({ site: site.key, siteLabel: site.label, name: c.name,
        startedOn: typeof c.startedOn === 'string' ? c.startedOn : '', n: Number(c.n) || 0, counts: counts });
    });
  });
  var list = document.getElementById('counterList');
  if (!exportable.length) {
    list.textContent = 'No distributions yet. Add one in the chart on X or Bluesky.';
  }
  exportable.forEach(function(c, i) {
    var label = document.createElement('label');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.value = i;
    box.checked = true;
    box.addEventListener('change', updateButtons);
    var name = document.createElement('span');
    name.textContent = c.name;
    var n = document.createElement('span');
    n.className = 'n';
    n.textContent = c.siteLabel + ' \u00B7 n=' + c.n;
    label.append(box, name, n);
    list.appendChild(label);
  });
  updateButtons();
});
