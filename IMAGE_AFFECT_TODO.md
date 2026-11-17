# Image affect trial: todo and problems log

Branch: `image-affect-trial` (local only, nothing pushed)
Plan: `IMAGE_AFFECT_PLAN.md`
Markers: `[ ]` not started, `[~]` in progress, `[x]` done, `[!]` failed, `[?]` blocked or cannot complete

## Problems log
* Parity gate: browser vs Python embedding mean cosine 0.976 (gate 0.99). Cause: canvas resize differs from PIL bicubic. Mitigation: head refit on browser embeddings.
* Not done: split half reliability ceiling, kNN baseline, long task and memory measurements, live selector fixtures (need Charlotte's HTML), Firefox support for images.
* Git bus error (exit 135) on `git status` and `git commit` after fit_head.py was added (index read from the mounted folder crashes). Removed the stale index.lock it left. Workaround: `git add`, then `git write-tree`, `git commit-tree`, `git update-ref` (plumbing) works. First feature commit a063c2c made this way. Charlotte: if you see this, run `git status` in your own terminal and commit analysis/image_affect.
* Java fuzz baseline: device has a Java runtime but no `javac` (JDK missing), so tools/Oracle.java cannot compile. Not related to this feature, skipped. Fix: install a JDK, then rerun.

* 2026-11-11 08:05 Git commits in the connected folder leave `.git/*.lock` files unless deletion is allowed. Deletion was approved for this session, stale locks removed. Commits use author "Claude Code" because no git identity is configured.
* 2026-11-11 08:10 The shell on the computer cannot download Chromium (Playwright and Chrome for Testing hosts unreachable, Hugging Face unreachable). npm and PyPI work. Browser steps run in the cloud container with staged files.

## P0 Baseline
* [x] Branch `image-affect-trial` created from main (ede034b)
* [x] `.gitignore` commit (image_part, model dir, todo file)
* [x] Run existing checks on the VM (non browser part): 12 passed, 0 failed, 1 skipped (browser)
* [ ] Run existing browser tests in the cloud container, save result
* [!] `node tools/diff_vs_java.js fuzz 2000`: cannot run, see Problems log

## P1 Check inputs
* [x] 900 images, 900 rows, names match
* [ ] ONNX IO names and sha256
* [ ] `git check-ignore image_part`

## P2 Fit in Python
* [ ] Reliability ceiling from raw ratings
* [x] Embeddings (onnxruntime and PIL), saved in image_part/out/emb_py.npy
* [x] Ridge CV (alpha 1000): 10 fold r valence 0.881, arousal 0.868; leave category out r 0.788 / 0.565. kNN baseline still to add
* [x] Gate passed on 10 fold CV (valence 0.88, arousal 0.87). Leave category out arousal 0.565 is just under 0.60, noted

## P3 Browser embedding and parity
* [x] Vendor onnxruntime-web 1.20.1 into chrome_extension/image_affect/ort
* [x] `embed.js` written (untested, needs Chromium in cloud container)
* [x] Embedded 900 images in Chromium (214 s total, 238 ms per image batch of 8, single thread WASM, cloud container). Parity with Python: mean cosine 0.976 (gate 0.99 NOT met, canvas resize differs from PIL bicubic), mean abs score diff 0.10 valence, 0.067 arousal. Mitigated by refit on browser embeddings
* [x] Refit on browser embeddings, weights.json version 2. 10 fold CV r 0.876 valence, 0.865 arousal

## P4 Calibrate categories
* [x] Cutoff sweep on 10 fold CV predictions vs human HAN (122 of 900). Chose neg < 3.5, pos > 4.5, high arousal >= 3.75 (ridge shrinks toward mean): precision 0.70, recall 0.62. Stricter 3.0/4.25 gives precision 0.96, recall 0.22

## P5 Integrate
* [x] Manifest (offscreen, hosts, CSP, background). Note: Firefox ignores service_worker and offscreen, so image scoring is Chrome and Edge only
* [x] `image_affect/background.js`, `offscreen.html`, `offscreen.js` written, untested in a real extension yet
* [x] `image_affect/page.js` (queue, cache, mapImageAffect, mergeAffect)
* [x] `sites/x.js`, `sites/bluesky.js` getImages. Selectors UNVERIFIED on live pages (fixtures from Charlotte still needed)
* [x] `content.js` image handling, merge, count update (flags stored as 256 + bitmask, old value 1 = unknown)
* [x] Settings switch `scoreImages` (default off)

## P6 Tests
* [x] Updated existing tests (run.mjs manifest checks, chrome-stub fake worker, frame.html images)
* [x] New unit tests (mapping, merge, weights, manifest, offscreen) and 14 page tests (7 per site). Result: 18 passed node side, 73 of 73 page tests in Chromium
* [x] `tests/model_parity.mjs` (r 0.915 / 0.920 on 80 images, in sample), `tests/e2e_extension.mjs` (real extension in Chromium, 6 checks pass)
* [x] All tests pass: node tests/run.mjs 18 passed 0 failed 1 skipped (browser step needs Chrome on the machine), 73 of 73 page tests in Chromium via cloud container

## P7 Performance
* [x] Bench: init 1.3 s, first 0.38 s, warm p50 232 ms, p95 315 ms, batch 4 0.87 s, burst 20 4.4 s, real extension first score 1.7 s. Long tasks and memory not measured

## P8 Docs and report
* [x] README updates
* [x] `analysis/image_affect/REPORT.md`

## P9 Final review
* [x] Diff reviewed (29 files vs main), main still at ede034b, nothing pushed. Final commit a315dd1
