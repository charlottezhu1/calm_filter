# Comparing SentiStrength versions

Goal: check that all our SentiStrength scorers are aligned.

**Reference data:** Jonas' dataset, `../posts_sentis_text_anon.csv` (1.9M posts, 3 studies). Some of its scores and labels are inconsistent with each other.

**Label rule (original paper):** HAN neg ≤ -3 · LAN neg = -2 · HAP pos ≥ 3 · LAP pos = 2 · NEU pos = 1 and neg = -1.

| Folder | What it does |
|---|---|
| `tiziano_vs_jonas_dataset/` | Runs Tiziano's original scoring module over all of Jonas' posts and compares with the original. |
| `jonas_dataset_vs_js_version/` | Compares the JavaScript SentiStrength (used by the Chrome extension) with Jonas' dataset. |
| `../../../tools/` | Scripts shared by both (at the repo root). |

**Result so far:** the JS version and Tiziano's module gave identical scores on all 323,295 posts compared row by row (every 6th post). Both reproduce Jonas' labels exactly in studies 1 and 3, but only 80.7% in study 2.
