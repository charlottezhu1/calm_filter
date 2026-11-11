// Service worker: owns the offscreen document that runs the image model.
var OFFSCREEN_URL = 'image_affect/offscreen.html';
var ALLOWED_HOSTS = ['pbs.twimg.com', 'cdn.bsky.app'];
var MAX_URLS = 4;
var creating = null;

function allowed(url) {
  try {
    var u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.indexOf(u.hostname) !== -1;
  } catch (e) { return false; }
}

async function ensureOffscreen() {
  if (!chrome.offscreen || !chrome.runtime.getContexts) return false;
  var existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) return true;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS'],
      justification: 'Run the image affect model locally in the browser'
    }).finally(function () { creating = null; });
  }
  await creating;
  return true;
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'calm-image-score' || sender.id !== chrome.runtime.id) return;
  var urls = Array.isArray(msg.urls) ? msg.urls.slice(0, MAX_URLS) : [];
  if (!urls.length || !urls.every(allowed)) { sendResponse({ error: 'bad urls' }); return; }
  ensureOffscreen()
    .then(function (ok) {
      if (!ok) return { unsupported: true };
      return chrome.runtime.sendMessage({ type: 'calm-offscreen-score', urls: urls });
    })
    .then(function (r) { sendResponse(r || { error: 'no response' }); })
    .catch(function (e) { sendResponse({ error: String(e && e.message || e) }); });
  return true;
});
