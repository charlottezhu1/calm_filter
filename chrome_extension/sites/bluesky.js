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

  // A small fixed box in the bottom-right corner, so it does not depend on Bluesky's layout.
  mountChart: function (box) {
    if (!document.body) return false;
    var s = box.style;
    s.position = 'fixed';
    s.top = 'auto';
    s.right = '16px';
    s.bottom = '16px';
    s.height = 'auto';
    s.padding = '4px 8px 8px';
    s.zIndex = '9999';
    s.background = '#fff';
    s.color = '#111';
    s.border = '1px solid #ccc';
    s.borderRadius = '8px';
    s.fontFamily = 'system-ui, sans-serif';
    document.body.appendChild(box);
    return true;
  }
};
