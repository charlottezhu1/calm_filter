# Tiziano's module vs Jonas' dataset

Jonas' dataset rescored with Tiziano's original module (`tiziano_service/`, scored and parsed by its `logic.py`), then compared with the original.

| File | What it is |
|---|---|
| `rescore_with_service.py` | Scores every post through the service. Start the service first: `cd tiziano_service && java -jar SentiStrengthService.jar`, then `python3 rescore_with_service.py` (about 6 min). |
| `posts_rescored_service.csv` | Output (342 MB). Same rows and columns as `../../posts_sentis_text_anon.csv`; `HAN`…`NEU`, `ss_pos`, `ss_neg` are replaced by the service's values. |
| `compare_rescored.py` | Compares the output with the original, per study. |
| `comparison.md` | Result tables from `compare_rescored.py`. |

**Result:** labels identical to the original in studies 1 and 3 (100%) and in 80.7% of study 2. The `ss_pos`/`ss_neg` columns match in 77.3% of rows overall.
