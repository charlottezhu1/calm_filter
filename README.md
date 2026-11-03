# Calm Filter (AMI)

A Chrome extension that scores the affect of each post in your X (twitter.com) feed, shows the mix of affect you have seen, and can hide high-arousal negative posts. Scoring uses a JavaScript port of [SentiStrength](http://sentistrength.wlv.ac.uk/) and runs entirely in your browser. The extension makes no network requests.

Each post is placed in one or more of five categories:

| Code | Meaning |
|------|---------|
| HAN | High Arousal Negative |
| LAN | Low Arousal Negative |
| NEU | Neutral |
| LAP | Low Arousal Positive |
| HAP | High Arousal Positive |

## Install

1. Download this repository (green *Code* button, then *Download ZIP*) and unzip it.
2. In Chrome, go to `chrome://extensions` and turn on *Developer mode*.
3. Click *Load unpacked* and select the `chrome_extension/` folder.
4. Open [x.com](https://x.com). The distribution bar appears near the compose button.

Click the Calm Filter icon to turn on or off hiding HAN posts, border colors, and the distribution bar. See [chrome_extension/README.md](chrome_extension/README.md) for how the scoring works.

## Verify the scorer

The JavaScript scorer matches the original Java SentiStrength. To check it yourself (needs Node.js and Java):

```bash
node tools/diff_vs_java.js fuzz 20000
```

## Repository layout

```
chrome_extension/   the extension (this is all you need to use it)
tools/              scripts that build the scorer's data and check it against the Java version
third_party/        SentiStrength English word lists (October 2019)
analysis/           analysis scripts and checks against study data (data not included)
backend/            older local server, no longer used by the extension
```

## License

SentiStrength and its word lists are free for academic, non-commercial use only. Check the licence before sharing the extension more widely.
