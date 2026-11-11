//////////////// Handle infinite scrolling ///////////////////////////////////
MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

var observer = new MutationObserver(function(mutations, observer) {
    // fired when a mutation occurs
    runCALM();
});

// Site-specific parts (post selector, text selector, post id, and the button the
// chart goes under) come from CalmFilterSite, defined by the sites/*.js script
// loaded before this one.
var Site = CalmFilterSite;

// This site's saved distributions. Each site (X, Bluesky) has its own, kept apart from the others.
var KEYS = {
  counters: 'counters:' + Site.key,
  active: 'activeCounter:' + Site.key,
  writer: 'countersWriter:' + Site.key
};

var settings = { filterHan: true, showColors: true, showChart: true };

// Up to MAX_COUNTERS named counters. Every running counter counts every post the user sees,
// wherever they browse; pausing a counter stops it adding more. The "active" counter is only
// the one whose chart is showing.
// They are saved to chrome.storage.local (with the ids of the posts already counted,
// so a reload does not count them again) until the user deletes them.
var MAX_COUNTERS = 3;
// The first distribution is the one that follows the user through every feed they visit;
// the others are for looking at particular feeds. Each keeps its slot even when renamed.
var DEFAULT_NAMES = ['My Browsing Affect Distribution', 'Affect Distribution 2', 'Affect Distribution 3'];
var counters = [];   // may be empty: the user can delete every distribution
var activeId = null;
var countersLoaded = false;
var writerId = Math.random().toString(36).slice(2);   // tells this tab's own saves from another tab's

chrome.storage.local.get(['filterHan', 'showColors', 'showChart', KEYS.counters, KEYS.active], function(res) {
  Object.keys(settings).forEach(function(key) {
    if (res[key] !== undefined) settings[key] = res[key];
  });
  loadCounters(res[KEYS.counters], res[KEYS.active]);
  observer.observe(document, {
    subtree: true,
    childList: true
  });
});
chrome.storage.onChanged.addListener(function(changes, area) {
  if (area !== 'local') return;
  if (changes[KEYS.counters] && !(changes[KEYS.writer] && changes[KEYS.writer].newValue === writerId)) {
    // another tab of this site changed the counters: adopt them
    loadCounters(changes[KEYS.counters].newValue, changes[KEYS.active] ? changes[KEYS.active].newValue : activeId);
  }
  for (var key in changes) if (key in settings) settings[key] = changes[key].newValue;
  refreshAllTweets();
  var box = document.getElementById('box_chart_id');
  if (settings.showChart) {
    if (box) box.style.display = '';
    renderChart();
  } else if (box) {
    box.style.display = 'none';
  }
});
window.addEventListener('resize', function() {
  var box = document.getElementById('box_chart_id');
  if (box) mountChart(box);
});
//////////////////////////////////////////////////////////////////////////////
var tweetSentiment = {};
var skipped = new Set();

//////////////// Counters ////////////////////////////////////////////////////
function makeCounter() {
  var taken = counters.map(function(c) { return c.slot; });
  var slot = 1;
  while (taken.indexOf(slot) !== -1) slot++;
  var counts = {};
  CALM_CATEGORIES.forEach(function(cat) { counts[cat.key] = 0; });
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: DEFAULT_NAMES[slot - 1] || 'Affect Distribution ' + slot,
    slot: slot,
    startedOn: location.origin + location.pathname,   // page where it was started, no query string
    n: 0,
    running: true,
    counts: counts,
    ids: {}
  };
}

// Stored data can be missing or malformed: keep only well-formed counters.
function cleanCounter(c) {
  if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !c.counts) return null;
  var clean = makeCounter();
  clean.id = c.id;
  clean.name = c.name.slice(0, 40) || clean.name;
  clean.slot = c.slot >= 1 && c.slot <= MAX_COUNTERS ? c.slot : 0;
  if (!clean.slot && c.name === 'Affect Distribution 1') {
    clean.slot = 1;
    clean.name = DEFAULT_NAMES[0];
  }
  clean.startedOn = typeof c.startedOn === 'string' ? c.startedOn : '';
  clean.n = Number(c.n) || 0;
  clean.running = c.running !== false;
  CALM_CATEGORIES.forEach(function(cat) { clean.counts[cat.key] = Number(c.counts[cat.key]) || 0; });
  clean.ids = c.ids && typeof c.ids === 'object' ? c.ids : {};
  return clean;
}

// raw is what was saved: nothing saved yet (first run) starts with one counter, while a
// saved empty list stays empty.
function loadCounters(raw, active) {
  counters = [];
  if (Array.isArray(raw)) {
    raw.slice(0, MAX_COUNTERS).forEach(function(c) {
      var clean = cleanCounter(c);
      if (clean) counters.push(clean);
    });
  } else {
    counters.push(makeCounter());
  }
  var current = counters.filter(function(c) { return c.id === active; })[0] || counters[counters.length - 1];
  activeId = current ? current.id : null;
  countersLoaded = true;
}

function activeCounter() {
  return counters.filter(function(c) { return c.id === activeId; })[0];
}

// Counts the post into every running counter that has not seen it yet.
// Returns true when at least one counter changed.
function countPost(itemId, affect) {
  var changed = false;
  counters.forEach(function(c) {
    if (!c.running || c.ids[itemId]) return;
    c.ids[itemId] = 1;
    c.n += 1;
    CALM_CATEGORIES.forEach(function(cat) { if (affect[cat.key]) c.counts[cat.key] += 1; });
    changed = true;
  });
  return changed;
}

var saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCounters, 2000);
}
function saveCounters() {
  try {
    if (!chrome.runtime.id) return;   // the extension was reloaded: this page's script is orphaned
    var data = {};
    data[KEYS.counters] = counters;
    data[KEYS.active] = activeId;
    data[KEYS.writer] = writerId;
    chrome.storage.local.set(data, function() { void chrome.runtime.lastError; });
  } catch (e) {}
}
window.addEventListener('pagehide', saveCounters);

function addCounter() {
  if (counters.length >= MAX_COUNTERS) return;
  var c = makeCounter();
  counters.push(c);
  switchTo(c.id);
}

function switchTo(id) {
  activeId = id;
  scheduleSave();
  renderChart();
  runCALM();   // a counter that was just added picks up what is on screen
}

// Pause or resume the counter that is showing. A resumed counter picks up what is on screen.
function toggleRunning() {
  var c = activeCounter();
  if (!c) return;
  c.running = !c.running;
  scheduleSave();
  renderChart();
  if (c.running) runCALM();
}

// Deletes the counter that is showing. Deleting the last one leaves only the Add button.
function deleteCounter() {
  counters = counters.filter(function(c) { return c.id !== activeId; });
  if (counters.length) {
    switchTo(counters[counters.length - 1].id);
  } else {
    activeId = null;
    scheduleSave();
    renderChart();
  }
}

// Double-click the name to rename it. Enter or clicking away saves, Escape cancels,
// an empty name keeps the old one.
function renameCounter(nameSpan) {
  var id = activeId;
  var input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 40;
  input.value = nameSpan.textContent;
  input.style.cssText = 'display:block;width:100%;font:inherit;color:inherit;background:transparent;' +
                        'border:1px solid currentColor;border-radius:3px;box-sizing:border-box;';
  var cancelled = false;
  // keep X's and Bluesky's keyboard shortcuts from reacting to typing
  ['keydown', 'keyup', 'keypress'].forEach(function(type) {
    input.addEventListener(type, function(e) {
      e.stopPropagation();
      if (type !== 'keydown') return;
      if (e.key === 'Escape') { cancelled = true; input.blur(); }
      if (e.key === 'Enter') input.blur();
    });
  });
  input.addEventListener('blur', function() {
    if (!input.isConnected) return;
    var value = input.value.trim();
    var target = counters.filter(function(c) { return c.id === id; })[0];
    if (!cancelled && value && target) {
      target.name = value;
      scheduleSave();
    }
    input.remove();
    nameSpan.style.display = '';
    ui.n.style.display = '';
    renderChart();
  });
  nameSpan.style.display = 'none';
  ui.n.style.display = 'none';
  nameSpan.parentNode.insertBefore(input, nameSpan);
  input.focus();
  input.select();
}
//////////////////////////////////////////////////////////////////////////////

//////////////// Function to do the task /////////////////////////////////////
// HAN posts are hidden rather than removed, so turning the filter off restores them.
function applyAffectToTweet(item, affect) {
  item.style.display = affect.HAN && settings.filterHan ? 'none' : '';
  if (!settings.showColors) {
    item.style.border = '';
    return;
  }
  var nullSentiment = true;
  if (affect.HAN) { item.style.border = "thick solid red"; nullSentiment = false; }
  if (affect.HAP) { item.style.border = "thick solid yellow"; nullSentiment = false; }
  if (affect.LAN) { item.style.border = "thick solid blue"; nullSentiment = false; }
  if (affect.LAP) { item.style.border = "thick solid green"; nullSentiment = false; }
  if (affect.NEU) { item.style.border = "thick solid gray"; nullSentiment = false; }
  if (nullSentiment) {
    // want to see cases where tweets were found but not outlined
    console.log('Found null sentiment', item);
    item.style.border = "thick solid pink";
  }
}

function refreshAllTweets() {
  var items = document.querySelectorAll(Site.postSelector);
  for (var i = 0; i < items.length; i++) {
    var itemId = Site.getId(items[i]);
    if (itemId && tweetSentiment[itemId]) applyAffectToTweet(items[i], tweetSentiment[itemId]);
  }
}

function runCALM() {
    var items = document.querySelectorAll(Site.postSelector);
    var changed = false;

    for (var i = 0; i < items.length; i++) {   // for each item box
        var item = items[i];
        var itemText = item.querySelector(Site.textSelector)?.innerText;
        var itemId = Site.getId(item);
        if (!itemId || !itemText) {
          if (!skipped.has(item)) {
            // avoiding spam of the same tweets over and over
            skipped.add(item);
          }
          continue
        }

        if (!tweetSentiment[itemId]) tweetSentiment[itemId] = getSentiment(itemText);
        // redraw the border every time (React can re-render the node)
        applyAffectToTweet(item, tweetSentiment[itemId]);
        if (countPost(itemId, tweetSentiment[itemId])) changed = true;
    }

    if (changed) scheduleSave();
    // draw once posts are on the page (the chart is anchored to the nav), then on every change
    if (changed || (items.length && !document.getElementById('box_chart_id'))) renderChart();
}
//////////////////////////////////////////////////////////////////////////////

var NAV_MIN_WIDTH = 160;   // narrower left columns (icon-only menus) cannot hold the bar

// Under the Post / New post button when the left navigation is wide enough,
// otherwise in the bottom-right corner. Safe to call again after a resize.
function mountChart(box) {
  if (!document.body) return false;
  var s = box.style;
  ['position', 'right', 'bottom', 'padding', 'zIndex', 'background', 'borderRadius',
   'width', 'maxWidth', 'marginTop'].forEach(function(p) { s[p] = ''; });
  var anchor = Site.chartAnchor();
  var column = anchor && anchor.parentElement;
  if (column && column.getBoundingClientRect().width >= NAV_MIN_WIDTH &&
      getComputedStyle(anchor).position !== 'fixed') {
    s.width = '100%';
    s.maxWidth = '225px';
    s.marginTop = '12px';
    column.appendChild(box);
  } else {
    s.position = 'fixed';
    s.right = '16px';
    s.bottom = '16px';
    s.padding = '4px 8px 8px';
    s.zIndex = '9999';
    s.background = 'rgba(128, 128, 128, 0.2)';
    s.borderRadius = '8px';
    document.body.appendChild(box);
  }
  return true;
}

// Same look on every site: the page's own text color (follows light or dark
// theme), and the canvas kept inside its column.
function styleChart(box) {
  var sample = document.querySelector(Site.textSelector);
  box.style.color = sample ? getComputedStyle(sample).color : '';
  var canvas = box.querySelector('canvas');
  if (canvas) {
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
  }
}

function makeButton(text, title, onClick) {
  var button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.title = title;
  button.style.cssText = 'background:transparent;color:inherit;border:1px solid currentColor;' +
                         'border-radius:4px;cursor:pointer;font:12px arial,sans-serif;padding:1px 6px;';
  button.addEventListener('click', onClick);
  return button;
}

// Small 12px icons drawn as SVG so they look the same on every platform (font glyphs do not).
var ICON_SHAPES = {
  pause: '<rect x="2.5" y="1" width="2.6" height="10" rx=".6"/><rect x="6.9" y="1" width="2.6" height="10" rx=".6"/>',
  play: '<path d="M3 1.2v9.6L10.8 6z"/>',
  close: '<path d="M2.2 2.2l7.6 7.6M9.8 2.2l-7.6 7.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/>'
};
function setIcon(button, icon) {
  if (button.dataset.icon === icon) return;
  button.dataset.icon = icon;
  button.textContent = '';
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'currentColor');
  svg.innerHTML = ICON_SHAPES[icon];
  button.appendChild(svg);
}

// The pause and delete buttons share one look: the same round box, muted until hovered.
function makeIconButton(icon, title, onClick) {
  var button = makeButton('', title, onClick);
  setIcon(button, icon);
  button.style.cssText += 'border:none;border-radius:50%;width:22px;height:22px;padding:0;flex-shrink:0;' +
                          'display:inline-flex;align-items:center;justify-content:center;' +
                          'font-size:12px;line-height:1;opacity:.6;';
  button.addEventListener('mouseenter', function() {
    button.style.opacity = '1';
    button.style.background = 'rgba(128, 128, 128, 0.25)';
  });
  button.addEventListener('mouseleave', function() {
    button.style.opacity = '.6';
    button.style.background = 'transparent';
  });
  return button;
}

// text-style glyphs (the \uFE0E stops them turning into color emoji)
var PAUSE = '\u23F8\uFE0E';   // only used to mark paused ones in the switcher text

// The chart box: name (n=...) and delete on top, then the counter dropdown and +, then the bar.
// Built once, then updated by renderChart().
var ui = {};
function ensureBox() {
  var box = document.getElementById('box_chart_id');
  if (box) return box;

  box = document.createElement('div');
  box.id = 'box_chart_id';
  box.style.fontFamily = 'arial, sans-serif';
  box.style.textAlign = 'left';

  // the counter switcher sits above the name, as small muted text with a chevron that
  // brightens on hover; it is hidden while there is only one counter
  ui.switcher = document.createElement('div');
  ui.switcher.style.margin = '0 0 4px';
  var pick = document.createElement('span');
  pick.style.cssText = 'position:relative;display:inline-block;max-width:100%;opacity:.6;';
  pick.addEventListener('mouseenter', function() { pick.style.opacity = '1'; });
  pick.addEventListener('mouseleave', function() { pick.style.opacity = '.6'; });
  ui.select = document.createElement('select');
  ui.select.title = 'Switch distribution';
  ui.select.style.cssText = 'display:block;max-width:100%;margin:0;padding:0 12px 0 0;' +
                            'font:11px arial,sans-serif;color:inherit;background:transparent;border:none;' +
                            'appearance:none;-webkit-appearance:none;cursor:pointer;text-overflow:ellipsis;';
  ui.select.addEventListener('change', function() { switchTo(ui.select.value); });
  var chevron = document.createElement('span');
  chevron.textContent = '▾';
  chevron.style.cssText = 'position:absolute;right:0;top:50%;transform:translateY(-50%);' +
                          'font-size:10px;pointer-events:none;';
  pick.appendChild(ui.select);
  pick.appendChild(chevron);
  ui.switcher.appendChild(pick);
  box.appendChild(ui.switcher);

  var head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 0 6px;';
  ui.head = head;
  var title = document.createElement('h3');
  title.id = 'box_chart_title';
  title.style.cssText = 'margin:0;font-size:14px;line-height:1.25;flex:1;min-width:0;overflow-wrap:anywhere;';
  ui.title = title;
  ui.name = document.createElement('span');
  ui.name.title = 'Double-click to rename';
  ui.name.addEventListener('dblclick', function() { renameCounter(ui.name); });
  ui.n = document.createElement('span');
  ui.n.style.cssText = 'white-space:nowrap;margin-left:4px;';   // long names wrap with the count after them
  title.appendChild(ui.name);
  title.appendChild(ui.n);
  ui.pause = makeIconButton('pause', 'Pause counting', toggleRunning);
  ui.remove = makeIconButton('close', 'Delete this distribution', deleteCounter);
  head.appendChild(title);
  head.appendChild(ui.pause);
  head.appendChild(ui.remove);
  box.appendChild(head);

  var chartCanvas = document.createElement("canvas");
  chartCanvas.height = 62;   // the bar and its labels end near 58px; a taller canvas left a gap above the +
  chartCanvas.style.width = "225px";
  chartCanvas.style.display = 'block';
  chartCanvas.setAttribute("id", "pieChartId");
  ui.canvas = chartCanvas;
  box.appendChild(chartCanvas);

  // a small text button at the bottom right: muted until hovered
  ui.add = makeButton('Add', 'Start a new affect distribution', addCounter);
  ui.add.style.cssText += 'display:block;padding:2px 9px;border-radius:10px;font-size:11px;' +
                          'line-height:1.3;opacity:.55;';
  ui.add.addEventListener('mouseenter', function() { ui.add.style.opacity = '1'; });
  ui.add.addEventListener('mouseleave', function() { ui.add.style.opacity = '.55'; });
  box.appendChild(ui.add);

  if (!mountChart(box)) return null;   // page not ready yet: try again on the next update
  return box;
}

function renderChart() {
  if (!settings.showChart || !countersLoaded) return;
  var box = ensureBox();
  if (!box) return;
  var counter = activeCounter();
  styleChart(box);   // the page's text color, also for the Add button

  // with no distribution only the Add button shows; otherwise the full chart
  ui.head.style.display = counter ? 'flex' : 'none';
  ui.canvas.style.display = counter ? 'block' : 'none';
  ui.switcher.style.display = counters.length > 1 ? 'block' : 'none';
  ui.add.style.display = counters.length < MAX_COUNTERS ? 'block' : 'none';
  ui.add.textContent = counter ? 'Add' : 'Add affect distribution';
  ui.add.style.margin = counter ? '3px 0 0 auto' : '0';
  if (!counter) return;

  ui.name.textContent = counter.name;
  ui.n.textContent = '(n=' + counter.n + (counter.running ? '' : ', paused') + ')';
  setIcon(ui.pause, counter.running ? 'pause' : 'play');
  ui.pause.title = counter.running ? 'Pause counting' : 'Resume counting';
  ui.name.style.opacity = counter.running ? '' : '.55';

  // rebuild the dropdown only when it changed, so a list the user has open is not closed
  var key = counters.map(function(c) { return c.id + '|' + c.name; }).join('\n');
  if (ui.select.dataset.key !== key) {
    ui.select.dataset.key = key;
    ui.select.textContent = '';
    counters.forEach(function(c) {
      var option = document.createElement('option');
      option.value = c.id;
      option.style.color = '#000';
      option.style.background = '#fff';
      ui.select.appendChild(option);
    });
  }
  // names come with their current n, refreshed on every render without rebuilding the list
  for (var i = 0; i < counters.length; i++) {
    ui.select.options[i].textContent = (counters[i].running ? '' : PAUSE + ' ') +
                                       counters[i].name + ' (n=' + counters[i].n + ')';
  }
  ui.select.value = counter.id;

  var canvas = document.getElementById("pieChartId");
  var context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawAffectBars(context, 0, 0, canvas.width, counter.counts, getComputedStyle(ui.title).color);
}
//////////////////////////////////////////////////////////////////////////////

// Original paper categories on SentiStrength scores (pos 1..5, neg -1..-5).
// A post can fall in more than one (e.g. HAP and HAN).
function classifyAffect(positive, negative) {
    return {
        HAN: negative <= -3,
        LAN: negative === -2,
        HAP: positive >= 3,
        LAP: positive === 2,
        NEU: positive === 1 && negative === -1,
        positive: positive,
        negative: negative
    };
}

function getSentiment(itemText) {
    if (!itemText || itemText.length === 0) {
        return classifyAffect(1, -1);
    }
    var sentiment = SentiStrength.score(itemText);
    return classifyAffect(sentiment.positive, sentiment.negative);
}
//////////////////////////////////////////////////////////////////////////////

