# AFINN calibration (older work)

Tuned the AFINN version of the extension's HAN/LAN cutoffs to match SentiStrength. Not part of the SentiStrength comparison.

| File | What it is |
|---|---|
| `calibrate.py` | Scores posts with AFINN and searches for cutoffs that best match the SentiStrength labels. `--analyze-only` reuses the existing CSV. Part 1 needs `chrome_extension/sentiment.js`, which was removed when the extension moved to SentiStrength (restore with `git show HEAD:chrome_extension/sentiment.js`). |
| `afinn_score.js` | Helper for `calibrate.py`: scores one text per line with the AFINN module. |
| `posts_afinn_anon.csv` | AFINN scores for every post (`afinn_pos`, `afinn_neg`, 0 to 5) and labels using the AFINN cutoffs (90 MB). |
