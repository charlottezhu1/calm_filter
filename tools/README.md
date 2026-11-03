# Shared tools

| File | What it is |
|---|---|
| `build_ss_data.js` | Packs a SentiStrength word-list folder into the JS data file the scorer reads. Default: the Oct 2019 lists → `chrome_extension/sentistrength_data.js`. Re-run after changing word lists. |
| `score_texts.js` | Scores texts (base64, one per line, from stdin) with the JS version. Used by `compare_versions.py`. |
| `diff_vs_java.js` | Runs the JS version and the real SentiStrength jar on the same texts and lists any differences: `node diff_vs_java.js fuzz 20000`. Needs `java`. |
| `Oracle.java` | Small Java program that scores texts with the jar. Used by `diff_vs_java.js`; not run directly. |
