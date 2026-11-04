// X (twitter.com): how to find posts and where to put the distribution bar.
var CalmFilterSite = {
  postSelector: "[data-testid='tweet']",

  getText: function (item) {
    return item.querySelector("[data-testid='tweetText']")?.innerText;
  },

  getId: function (item) {
    return item.querySelector('time')?.parentElement.href;
  },

  // The bar goes under the Post button in the side navigation.
  mountChart: function (box) {
    var anchor = document.querySelector("[data-testid='SideNav_NewTweet_Button']") ||
                 document.querySelector("[href='/settings']");
    if (!anchor) return false;
    anchor.parentElement.appendChild(box);
    return true;
  }
};
