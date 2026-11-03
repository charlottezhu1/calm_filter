# analysis/tests

| Path | What it is |
|---|---|
| `posts_sentis_text_anon.csv` | Jonas' dataset (340 MB): 1,939,768 posts from 3 studies. Columns: `anon_post_id`, `anon_participant_id`, `study`, `day_index`, `HAN`/`LAN`/`HAP`/`LAP`/`NEU` (0/1 labels), `ss_pos`, `ss_neg` (SentiStrength scores), `text`. Shared input for everything here. |
| `compare_senti_versions/` | Checks that the SentiStrength scorers (Tiziano's module, the JS version) agree with this dataset. |
| `afinn_calibration/` | Older AFINN cutoff calibration. |
