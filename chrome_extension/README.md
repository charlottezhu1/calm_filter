Calm Filter: a Chrome extension for X (twitter.com) that scores post affect in your feed.

What it does
------------
- Scores the affect of each post in your feed.
- Shows the affect distribution of the posts you've seen, as a color bar with emoji and percentages.
- Hides high-arousal negative (HAN) posts.

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
- **Affect distribution**: shows or hides the distribution bar. The bar counts every post scored, including hidden ones.

All three are on by default.

Installation
------------
1. Download and unzip the folder.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** in the upper right corner.
4. Click **Load unpacked** and select the `chrome_extension` folder.
5. Confirm that Calm Filter appears in the list and is enabled.
6. Open x.com. The distribution bar appears near the compose button.

Limitations
-----------
- Works only on Chrome, and only on x.com and twitter.com.
- Scores are computed for the posts you've scrolled past during the current page visit. Reloading the page starts the count over.
