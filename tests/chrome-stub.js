// chrome.* stand-in for the tests. Storage is shared through the parent page (window.parent.__store),
// so several frames behave like several tabs of one browser. Callbacks are asynchronous, like the real API.
(function() {
  var shared = parent.__store;
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  window.chrome = {
    runtime: { id: 'test-extension', lastError: undefined },
    storage: {
      local: {
        // keys: a name, a list of names, or an object of defaults (like the real API)
        get: function(keys, cb) {
          setTimeout(function() {
            var out = {};
            if (typeof keys === 'string') keys = [keys];
            if (Array.isArray(keys)) {
              keys.forEach(function(k) { if (k in shared.data) out[k] = clone(shared.data[k]); });
            } else {
              Object.keys(keys).forEach(function(k) { out[k] = k in shared.data ? clone(shared.data[k]) : keys[k]; });
            }
            cb(out);
          }, 0);
        },
        set: function(obj, cb) {
          if (window.failStorage) {   // pretend the write failed (e.g. quota)
            window.chrome.runtime.lastError = { message: 'quota exceeded' };
            setTimeout(function() { cb && cb(); window.chrome.runtime.lastError = undefined; }, 0);
            return;
          }
          setTimeout(function() {
            var changes = {};
            Object.keys(obj).forEach(function(k) {
              changes[k] = { oldValue: shared.data[k], newValue: clone(obj[k]) };
              shared.data[k] = clone(obj[k]);
            });
            shared.listeners.slice().forEach(function(l) { l.fn(clone(changes), 'local'); });
            cb && cb();
          }, 0);
        }
      },
      onChanged: { addListener: function(fn) { shared.listeners.push({ win: window, fn: fn }); } }
    }
  };
})();
