# Jonas' dataset vs the JS version

The JavaScript SentiStrength (`chrome_extension/sentistrength.js`) compared with Jonas' dataset (`../../posts_sentis_text_anon.csv`), grouped by its `study` column.

| File | What it is |
|---|---|
| `score_with_js.py` | Scores every post with the JS version only (Oct 2019 word lists, as shipped in the extension). About 5 min; `python3 score_with_js.py [max_rows]`. |
| `posts_scored_js.csv` | Its output (342 MB). Same rows and columns as `../../posts_sentis_text_anon.csv`; `HAN`…`NEU`, `ss_pos`, `ss_neg` are the JS version's values. Identical to `../tiziano_vs_jonas_dataset/posts_rescored_service.csv` on every row. |
| `compare_versions.py` | Scores all posts with the JS version using two word lists (`backend/py4j/en` and the Oct 2019 list) and compares each with the CSV. About 10 min; pass a row count for a quick run (`python3 compare_versions.py 20000`). |
| `results.md` | Result tables from `compare_versions.py`. |
| `test_sentistrength.js` | Scores the CSV with the JS version and reports agreement with the CSV's labels and scores, per study. `node test_sentistrength.js [maxRows]`. |
| `ss_to_label_by_study.py` | Uses only the CSV's own columns: do `ss_pos`/`ss_neg` produce its labels? Per study. |
| `verify_sentistrength_rule.py` | Older check: scores texts with the backend jar and tests the paper rule against the CSV labels. |
