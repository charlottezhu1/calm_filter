// Bluesky (bsky.app): how to find posts and where to put the distribution bar.
var CalmFilterSite = {
  postSelector: "[data-testid^='feedItem-by-']",

  getText: function (item) {
    return item.querySelector("[data-testid='postText']")?.innerText;
  },

  // The post's own link, e.g. /profile/name.bsky.social/post/3abc...
  getId: function (item) {
    return item.querySelector("a[href*='/post/']")?.getAttribute('href');
  },

  // The bar goes under the New post button in the left navigation, as on X.
  // Where that column is missing or too narrow (phone layout, icon-only nav,
  // logged out), it sits in the bottom-right corner instead.
  mountChart: function (box) {
    if (!document.body) return false;
    var s = box.style;
    var button = document.querySelector("[aria-label='New post']") ||
                 document.querySelector("a[href='/settings']");
    var column = button && button.parentElement;
    s.top = '';
    s.height = 'auto';
    if (column && column.getBoundingClientRect().width >= 160 &&
        getComputedStyle(button).position !== 'fixed') {
      s.width = '100%';
      s.maxWidth = '225px';
      s.marginTop = '12px';
      s.textAlign = 'left';
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
  },

  // Runs on every redraw: follow the page's text color (light or dark theme)
  // and keep the canvas inside the column.
  refreshChart: function (box) {
    var sample = document.querySelector("[data-testid='postText']") ||
                 document.querySelector("a[href='/settings'] div");
    box.style.color = sample ? getComputedStyle(sample).color : '';
    var canvas = box.querySelector('canvas');
    if (canvas) {
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
    }
  }
};
