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
