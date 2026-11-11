Calm Filter: a browser extension for X (twitter.com) and Bluesky that scores post affect in your feed.

What it does
------------
- Scores the affect of each post in your feed.
- Shows the affect distribution of the posts you've seen, as a color bar with emoji and percentages.
- Hides high-arousal negative (HAN) posts.
- Keeps up to 3 distributions (a main one that follows all your browsing, and others for particular feeds), each of which you can pause, rename and export as PNG or JSON.

How it works
------------
Each post is scored with SentiStrength (Thelwall et al. 2010), re-implemented in JavaScript (`sentistrength.js`) so it runs in the page with no server. It returns a positive score (1 to 5) and a negative score (-1 to -5), using its word list plus rules for negation, booster words, emoticons, repeated letters and "!". The two scores are mapped to categories (a post can fall in more than one):

- High Arousal Negative (HAN)
- Low Arousal Negative (LAN)
- Neutral (NEU)
- Low Arousal Positive (LAP)
- High Arousal Positive (HAP)

Cutoffs, as in the original paper: HAN = negative score of -3 or lower; LAN = -2; HAP = positive score of 3 or higher; LAP = 2; NEU = positive 1 and negative -1.

`sentistrength.js` is a port of the SentiStrength Java code with its default English settings, and matches the Java jar's output exactly on 100,000+ test strings (`tools/diff_vs_java.js`). `sentistrength_data.js` holds the SentiStrength English word lists (October 2019 release, folder `third_party/SentiStrength/`), packed by `tools/build_ss_data.js`. SentiStrength and its word lists are free for academic, non-commercial use only; check the licence before sharing this extension more widely.

Switches
--------
Click the Calm Filter icon to open the switches. Changes apply immediately.

- **Hide HAN posts**: hides HAN posts. Turning it off shows them again.
- **Color post borders**: colors each post's border by category. HAN posts show red when they're not hidden.
- **Affect distribution**: shows or hides the distribution box. Counters count every post scored, including hidden ones, and keep counting while the box is hidden.

All three are on by default.

Counters and export
-------------------
The box shows one distribution at a time. From top to bottom it has a switcher (only when there is more than one), the distribution's name with its post count, the bar, and a small **Add** button at the bottom right.

- **Which one counts:** every running distribution counts every post you see, wherever you browse. Which one is showing only decides which chart you look at.
- **My Browsing Affect Distribution** is the first one. It follows you through every feed you visit. The other two, **Affect Distribution 2** and **3**, are for looking at particular feeds.
- **Add** (bottom right) starts the next distribution, up to 3 in total, for example when you open a feed you want to look at on its own. It also counts the posts already on screen. Earlier distributions keep counting. At 3 the button is hidden.
- **Pause / play** (next to the name, matching the delete button) pauses or resumes the distribution that is showing. A paused distribution stops adding posts wherever you go and shows "paused" next to its count, with a ⏸ in the switcher. Pause the ones you do not want to keep counting when you move to another feed. Resuming counts what is on screen.
- The switcher (small muted text with a ▾, top-left) swaps between distributions and lists each with its current n.
- Double-click the name to rename it, for example to `x.com/FoxNews`. Press Enter or click away to save, Escape to cancel. An empty name keeps the old one.
- **✕** (next to the pause button) deletes the distribution straight away, with no confirmation. Deleting the last one clears the box down to a single **Add affect distribution** button, and nothing is counted until you add one. That empty state is saved too.
- Everything is saved in the browser, together with the posts already counted and whether each is paused, so a reload keeps it and does not count the same posts again. It stays until you delete it (a first run starts with My Browsing Affect Distribution). X (x.com and twitter.com) and Bluesky each have their own distributions, kept completely apart: nothing counted on one ever shows up on the other. Several open tabs of the same site stay in sync.

The popup's **Export distributions** section lists the counters. Tick the ones you want, then:

- **PNG**: one image per counter, named after the counter (characters that are not allowed in file names, such as `/`, become `_`). Always black text on white, whatever the site's theme.
- **JSON**: one file with an entry per counter: its site (`x` or `bluesky`), its name, the page it was started on (`started_on`), `n`, and the count and percent for HAN, LAN, NEU, LAP and HAP.
- **Copy JSON**: the same JSON on the clipboard.

Percentages are of the category counts, which can add up to more than `n` because one post can be in two categories. They match the bar.

Installation
------------
1. Download and unzip the folder.
2. Chrome or Edge: go to `chrome://extensions` (or `edge://extensions`), turn on **Developer mode** in the upper right corner, click **Load unpacked** and select the `chrome_extension` folder.
   Firefox (140 or newer): go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and select `manifest.json` in the folder. It stays until Firefox restarts.
3. Confirm that Calm Filter appears in the list and is enabled.
4. Open x.com or bsky.app. The distribution bar appears under the Post (X) or New post (Bluesky) button, and moves to the bottom-right corner when the window is too narrow.

Limitations
-----------
- Works on x.com, twitter.com and bsky.app, in Chrome, Edge and Firefox. Firefox support is new and has not yet been tried in a real Firefox.
- Only posts that the page has rendered are scored and counted. X and Bluesky remove posts that scroll far off screen, and very fast scrolling can skip some, so a counter reflects the posts shown on screen, not a guaranteed record of everything you scrolled past.
- Counts are saved in the browser, not sent anywhere. Every running distribution counts every post you see, so pause the ones you do not want counting when you move to another feed.
- After updating the extension files, reload the extension on the extensions page and refresh the site. An already open tab keeps running the old version until it is refreshed.
