# Image affect trial report

Branch `image-affect-trial` (main is untouched). Numbers below come from this branch's runs.

## What was built

* CLIP ViT B/32 vision encoder (int8 ONNX, 89 MB) in an offscreen document, run by onnxruntime-web (WASM, one thread, no bundler).
* Head: L2 normalize, z score, ridge regression to OASIS valence and arousal (1 to 7). Fit on the 900 OASIS images, embedded with the same browser pipeline that ships.
* Categories: valence below 3.5 negative, above 4.5 positive, otherwise neutral. Arousal at or above 3.75 is high.
* Merge: HAN, LAN, HAP, LAP if text or any image says so. NEU only if every scored part is neutral. Failed images are ignored. Image only posts are now scored.
* Counting: a post is counted when first scored, then corrected if a late image score changes its categories (flags stored with the post id).
* Switch `scoreImages`, default off. Chrome and Edge only.

## Validation so far

| Check | Result |
|---|---|
| 10 fold CV, Python embeddings, alpha 1000 | r 0.881 valence, 0.868 arousal |
| 10 fold CV, browser embeddings (shipped) | r 0.876 valence, 0.865 arousal |
| Leave one category out (Python) | r 0.788 valence, 0.565 arousal |
| Browser vs Python embeddings | mean cosine 0.976 (gate 0.99 not met, canvas resize differs from PIL), head refit on browser embeddings to compensate |
| Browser pipeline vs human means, 80 images, in sample | r 0.915 valence, 0.920 arousal |
| HAN from images, CV (cutoffs 3.5 and 3.75) | precision 0.70, recall 0.62 on 122 human HAN images |
| HAN stricter (cutoffs 3.0 and 4.25) | precision 0.96, recall 0.22 |
| Page tests (Chromium) | 73 of 73 pass |
| Real extension in Chromium | loads, scores, hides, outlines, switch off works |

Gate status: CV valence and arousal gates met. Leave one category out arousal (0.565) is just under 0.60. Parity cosine gate not met, see above. Reliability ceiling from raw ratings was not computed (todo).

## Latency (2 vCPU container, headless Chromium, WASM)

| Measure | Value |
|---|---|
| Model load | 1.3 s |
| First image | 0.38 s |
| Warm per image p50, p95 | 232 ms, 315 ms (target 200 and 400) |
| Batch of 4 | 0.87 s |
| Burst of 20 | 4.4 s (target under 6 s) |
| First score in the real extension after page load | 1.7 s (cold, includes model load) |

Scoring runs in the offscreen document, so the page thread is not blocked. Long task counts in the content script were not measured. Memory under 500 MB was not measured (JS heap 54 MB).

## Known limits

* X and Bluesky image selectors are unverified on live pages. Fixtures of real posts are needed.
* Firefox is unsupported for images (no offscreen API). The manifest keys are ignored there.
* Video uses poster or thumbnail only. No alt text.
* Raters were a US online sample. Scores measure how people rate an image, not felt experience.
* Java fuzz baseline could not run (no `javac` on the dev machine).

## Todos

See section 13 of `IMAGE_AFFECT_PLAN.md` for the full list. Next steps in order:

1. Provide live X and Bluesky post HTML so selectors can be confirmed and fixtures added.
2. Compute the split half reliability ceiling from `OASIS_data.csv` and report r against it.
3. Build a post level gold set (real posts with images, 3 or more raters, oversample HAN) and run the text only, image only, union ablation.
4. Pick cutoffs from post level ratings, per use (hide filter wants precision, display bar may want recall).
5. Compare crop choices and backbones (B/16, MobileCLIP) against size and latency. Try an out of distribution score.
6. Measure content script long tasks and offscreen memory on a real feed.
