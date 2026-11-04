// X (twitter.com): how to find posts, and the button the chart goes under.
var CalmFilterSite = {
  postSelector: "[data-testid='tweet']",
  textSelector: "[data-testid='tweetText']",

  getId: function (item) {
    return item.querySelector('time')?.parentElement.href;
  },

  // The Post button in the side navigation.
  chartAnchor: function () {
    return document.querySelector("[data-testid='SideNav_NewTweet_Button']") ||
           document.querySelector("[href='/settings']");
  }
};
