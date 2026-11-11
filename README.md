# Calm Filter

A browser extension that scores the affect of each post in your X (twitter.com) or Bluesky feed, shows the mix of affect you have seen, and can hide high-arousal negative posts. Scoring uses a JavaScript port of [SentiStrength](http://sentistrength.wlv.ac.uk/) and runs entirely in your browser. The extension makes no network requests unless you turn on the optional image scoring (see below).

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
2. Load the `chrome_extension/` folder:
   - **Chrome or Edge:** go to `chrome://extensions` (or `edge://extensions`), turn on *Developer mode*, click *Load unpacked*, and select the folder.
   - **Firefox (140 or newer):** go to `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on*, and select `manifest.json` in the folder. It stays until Firefox restarts.
3. Open [x.com](https://x.com) or [bsky.app](https://bsky.app). The distribution bar appears under the Post (X) or New post (Bluesky) button, and moves to the bottom-right corner when the window is too narrow.

Click the Calm Filter icon to turn on or off hiding HAN posts, border colors, and the distribution box, and to export. The box keeps up to 3 counters: the first, *My Browsing Affect Distribution*, follows you through every feed. **Add** starts up to two more (for a particular feed), each running one counts every post you see, and **⏸** pauses one. A small switcher swaps between them, double-clicking the name renames one, and **✕** deletes one right away. You can delete them all and add one back later. Counters are saved until you delete them, and the popup's *Export distributions* section saves them as PNG or JSON, or copies the JSON. See [chrome_extension/README.md](chrome_extension/README.md) for the details and for how the scoring works.

## Image scoring (trial, off by default)

Turn on *Score images (beta)* in the popup to also score the affect of post images (X photos and video posters, Bluesky images). A CLIP ViT B/32 model (int8, about 89 MB, bundled) runs in your browser through onnxruntime-web, and a small head maps its output to valence and arousal on the OASIS scale, then to the same five categories. A post is HAN, LAN, HAP or LAP if its text or any image is, and NEU only if every part is. The extension downloads each image from X's or Bluesky's own image server (the same file the page shows) to score it. Nothing is sent anywhere else. Needs Chrome or Edge (it uses an offscreen document). The model file is not in git: see `chrome_extension/image_affect/VENDOR.md`. Method, validation and todos: `analysis/image_affect/REPORT.md`.

Image tests (need Playwright, the model and the OASIS images, and skip themselves otherwise):

```bash
node tests/run.mjs                 # all existing and new checks
node tests/model_parity.mjs        # browser pipeline vs human OASIS ratings
node tests/bench.mjs               # latency numbers
xvfb-run -a node tests/e2e_extension.mjs   # loads the real extension (headed Chromium; drop xvfb-run on a desktop)
```

## Verify the scorer

The JavaScript scorer matches the original Java SentiStrength. To check it yourself (needs Node.js and Java):

```bash
node tools/diff_vs_java.js fuzz 20000
```

## Repository layout

```
chrome_extension/   the extension (this is all you need to use it; sites/ holds the X and Bluesky code, image_affect/ the optional image scoring)
tools/              scripts that build the scorer's data and check it against the Java version
third_party/        SentiStrength English word lists (October 2019)
analysis/           analysis scripts and checks against study data (data not included); image_affect/ fits and reports the image head
```

## License

SentiStrength and its word lists are free for academic, non-commercial use only. Check the licence before sharing the extension more widely.
