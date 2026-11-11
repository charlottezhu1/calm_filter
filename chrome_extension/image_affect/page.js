// Content script side of image scoring: queue, cache, and the mapping to affect categories.
// Scores come from the service worker (see background.js). Off unless the switch is on.
var CalmImages = (function () {
  var HOSTS = ['pbs.twimg.com', 'cdn.bsky.app'];
  var MAX_PENDING = 50;
  var BATCH = 4;
  var cache = new Map();     // url -> {v, a}, or null when scoring failed
  var queue = [];
  var queued = new Set();
  var busy = false;
  var failures = 0;
  var cutoffs = { neg: 3.5, pos: 4.5, high: 3.75 };
  var onDone = function () {};

  // Returns the url to fetch, or null when it is not an image we may score.
  function normalize(url) {
    try {
      var u = new URL(url, location.href);
      if (u.protocol !== 'https:' || HOSTS.indexOf(u.hostname) === -1) return null;
      if (u.hostname === 'pbs.twimg.com' && u.searchParams.has('name')) u.searchParams.set('name', 'small');
      return u.href;
    } catch (e) { return null; }
  }

  // undefined: not scored yet, null: failed or not scorable, object: scored.
  function get(url) {
    var key = normalize(url);
    return key ? cache.get(key) : null;
  }

  function want(url) {
    var key = normalize(url);
    if (!key || cache.has(key) || queued.has(key) || failures >= 3) return;
    if (queue.length >= MAX_PENDING) queued.delete(queue.shift());
    queue.push(key);
    queued.add(key);
    pump();
  }

  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    var batch = queue.splice(0, BATCH);
    var finish = function (resp) {
      var ok = resp && Array.isArray(resp.scores);
      batch.forEach(function (key, i) {
        queued.delete(key);
        cache.set(key, ok && resp.scores[i] ? resp.scores[i] : null);
      });
      if (ok && resp.cutoffs) cutoffs = resp.cutoffs;
      failures = ok ? 0 : failures + 1;
      if (failures >= 3) {
        queue.forEach(function (key) { queued.delete(key); });
        queue = [];
      }
      busy = false;
      onDone();
      pump();
    };
    try {
      chrome.runtime.sendMessage({ type: 'calm-image-score', urls: batch }, function (resp) {
        void chrome.runtime.lastError;
        finish(resp);
      });
    } catch (e) { finish(null); }
  }

  // OASIS style scores (1 to 7) to the same categories the text scorer uses.
  function mapImageAffect(s) {
    var neg = s.v < cutoffs.neg, pos = s.v > cutoffs.pos, high = s.a >= cutoffs.high;
    return {
      HAN: neg && high, LAN: neg && !high, HAP: pos && high, LAP: pos && !high,
      NEU: !neg && !pos, positive: 0, negative: 0
    };
  }

  // A post is HAN, LAN, HAP or LAP when the text or any image is. NEU only when every part is.
  function mergeAffect(textAffect, imageAffects) {
    var parts = (textAffect ? [textAffect] : []).concat(imageAffects || []);
    if (!parts.length) return null;
    var out = {
      positive: textAffect ? textAffect.positive : 0,
      negative: textAffect ? textAffect.negative : 0
    };
    ['HAN', 'LAN', 'HAP', 'LAP'].forEach(function (k) {
      out[k] = parts.some(function (p) { return p[k]; });
    });
    out.NEU = parts.every(function (p) { return p.NEU; });
    return out;
  }

  return {
    get: get, want: want, mapImageAffect: mapImageAffect, mergeAffect: mergeAffect,
    setOnDone: function (fn) { onDone = fn; },
    _reset: function () { cache.clear(); queue = []; queued.clear(); busy = false; failures = 0; }
  };
})();
