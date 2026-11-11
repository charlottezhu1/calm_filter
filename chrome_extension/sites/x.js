// X (twitter.com): how to find posts, and the button the chart goes under.
var CalmFilterSite = {
  key: 'x',
  postSelector: "[data-testid='tweet']",
  textSelector: "[data-testid='tweetText']",

  // Photo URLs and video posters of a post (up to 4).
  getImages: function (item) {
    var urls = [];
    item.querySelectorAll("[data-testid='tweetPhoto'] img, [data-testid='videoPlayer'] video[poster]").forEach(function (el) {
      var u = el.tagName === 'VIDEO' ? el.getAttribute('poster') : el.currentSrc || el.src;
      if (u && urls.indexOf(u) === -1) urls.push(u);
    });
    return urls.slice(0, 4);
  },

  getId: function (item) {
    return item.querySelector('time')?.parentElement.href;
  },

  // The Post button in the side navigation.
  chartAnchor: function () {
    return document.querySelector("[data-testid='SideNav_NewTweet_Button']") ||
           document.querySelector("[href='/settings']");
  }
};
