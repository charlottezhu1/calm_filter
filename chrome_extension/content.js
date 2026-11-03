//////////////// Handle infinite scrolling ///////////////////////////////////
MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

var observer = new MutationObserver(function(mutations, observer) {
    // fired when a mutation occurs
    runCALM();
});

function chartLocation(){
    var tweetButtonExists = !!document.querySelector("[data-testid='SideNav_NewTweet_Button']");

    if (tweetButtonExists ==true){
      var chartLoc = document.querySelector("[data-testid='SideNav_NewTweet_Button']");
    }
    else{
      var chartLoc = document.querySelector("[href='/settings']");
    }
    return chartLoc;
}

var settings = { filterHan: true, showColors: true, showChart: true };
chrome.storage.local.get(['filterHan', 'showColors', 'showChart'], function(res) {
  Object.assign(settings, res);
  observer.observe(document, {
    subtree: true,
    childList: true
  });
});
chrome.storage.onChanged.addListener(function(changes, area) {
  if (area !== 'local') return;
  for (var key in changes) settings[key] = changes[key].newValue;
  refreshAllTweets();
  var box = document.getElementById('box_chart_id');
  if (settings.showChart) {
    if (box) box.style.display = '';
    renderChart();
  } else if (box) {
    box.style.display = 'none';
  }
});
//////////////////////////////////////////////////////////////////////////////
var tweetSentiment = {};
var skipped = new Set();
var numTweets = 0;
var createdHrzBarPlot = false;
var lap = 0;
var hap = 0;
var lan = 0;
var han = 0;
var neu = 0;

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

function recordNewTweet(item, affect) {
  applyAffectToTweet(item, affect);
  if (affect.HAN) { han += 1; }
  if (affect.HAP) { hap += 1; }
  if (affect.LAN) { lan += 1; }
  if (affect.LAP) { lap += 1; }
  if (affect.NEU) { neu += 1; }

  numTweets += 1;

  renderChart();
}

function renderChart() {
  // flip the order make positive on the right for horizontal
  var data = [ [ "😠", han ],[ "🙁", lan ],[ "😐", neu ],[ "🙂", lap ],[ "😄", hap ] ];
  var colors = [ "red" ,"blue","lightgrey","green","yellow" ];
  drawHrzBarPlot( data, colors );
}

function refreshAllTweets() {
  var items = document.querySelectorAll("[data-testid='tweet']");
  for (var i = 0; i < items.length; i++) {
    var itemId = items[i].querySelector('time')?.parentElement.href;
    if (itemId && tweetSentiment[itemId]) applyAffectToTweet(items[i], tweetSentiment[itemId]);
  }
}

function runCALM() {
    var items = document.querySelectorAll("[data-testid='tweet']");

    for (var i = 0; i < items.length; i++) {   // for each item box
        var item = items[i];
        var itemText = item.querySelector("[data-testid='tweetText']")?.innerText;
        var itemId = item.querySelector('time')?.parentElement.href;
        if (!itemId || !itemText) {
          if (!skipped.has(item)) {
            // avoiding spam of the same tweets over and over
            skipped.add(item);
          }
          continue
        }

        if (tweetSentiment[itemId]) {
          // already scored: just redraw the border (React can re-render the node)
          applyAffectToTweet(item, tweetSentiment[itemId]);
        } else {
          var affect = getSentiment(itemText);
          tweetSentiment[itemId] = affect;
          recordNewTweet(item, affect);
        }
    }
}
//////////////////////////////////////////////////////////////////////////////

function drawHrzBarPlot( data, colors){
  if (!settings.showChart) return;
  var tweetButton = chartLocation();

  if (!createdHrzBarPlot) {
    var box = document.createElement("div");
    box.id = 'box_chart_id';

    var chartCanvas = document.createElement("canvas");
    chartCanvas.style.width = "225px";
    chartCanvas.style.height = "125px";
    chartCanvas.setAttribute("id", "pieChartId");

    var boxTitle = document.createElement("h3");
    boxTitle.id = 'box_chart_title';
    box.appendChild(boxTitle);
    box.style.top = "150px";
    box.style.width = "230px";
    box.style.height = "250px";
    box.style.textAlign = 'center';
    tweetButton.parentElement.appendChild(box);
    box.appendChild(chartCanvas);

    createdHrzBarPlot = true;
  }
  document.getElementById('box_chart_title').innerHTML = `Affect Distribution (n=${numTweets})`;

  var canvas = document.getElementById("pieChartId");
  var context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);

  var total = 0;
  for (var i = 0; i < data.length; i++) {
    total += data[i][1];
  }

  var maxWidth = canvas.width;
  var maxHeight = 25;
  var startingPoint = 0;

  for (var i = 0; i < data.length; i++) {
    var percent = total ? data[i][1] / total : 0;

    context.beginPath();
    context.fillStyle = colors[i];
    context.rect(startingPoint, 0, maxWidth*percent, maxHeight);
    context.fill();

    // label sits at the bar's midpoint, clamped so edge labels stay inside the canvas
    var midX = startingPoint + maxWidth*percent / 2;
    var labelX = Math.min(Math.max(midX - 10, 0), canvas.width - 24);
    context.beginPath();
    context.fillStyle = getComputedStyle(document.getElementById('box_chart_title')).color;
    context.font = "bold 14px arial";
    context.fillText(data[i][0], labelX, 40);
    context.fillText(Math.round(percent*100) + "%", labelX, 55);

    startingPoint += maxWidth*percent;
  }
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

