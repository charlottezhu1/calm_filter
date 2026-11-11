// Bluesky (bsky.app): how to find posts, and the button the chart goes under.
var CalmFilterSite = {
  key: 'bluesky',
  postSelector: "[data-testid^='feedItem-by-']",
  textSelector: "[data-testid='postText']",

  // Image URLs of a post (up to 4). Avatars are not included.
  getImages: function (item) {
    var urls = [];
    item.querySelectorAll("img[src*='cdn.bsky.app/img/feed_']").forEach(function (el) {
      if (urls.indexOf(el.src) === -1) urls.push(el.src);
    });
    return urls.slice(0, 4);
  },

  // The post's own link, e.g. /profile/name.bsky.social/post/3abc...
  getId: function (item) {
    return item.querySelector("a[href*='/post/']")?.getAttribute('href');
  },

  // The New post button in the left navigation.
  chartAnchor: function () {
    return document.querySelector("[aria-label='New post']") ||
           document.querySelector("a[href='/settings']");
  }
};
