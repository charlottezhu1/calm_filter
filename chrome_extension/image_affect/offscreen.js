// Offscreen document: loads the model once, then scores batches of image URLs.
var base = chrome.runtime.getURL('image_affect/');
var ready = null;

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'calm-offscreen-score' || sender.id !== chrome.runtime.id) return;
  if (!ready) ready = CalmEmbed.init(base);
  ready
    .then(function () { return CalmEmbed.scoreUrls(msg.urls); })
    .then(function (scores) { sendResponse({ scores: scores, cutoffs: CalmEmbed.cutoffs() }); })
    .catch(function (e) { ready = null; sendResponse({ error: String(e && e.message || e) }); });
  return true;
});
