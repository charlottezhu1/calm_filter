"""
Compares the rescored CSV (collaborator's service) with the original CSV, row by row, per study.

  python3 compare_rescored.py

Both files have the same rows in the same order; rows are paired and checked by anon_post_id.
Prints and saves comparison.md (next to this script).
"""
import csv
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ORIGINAL = HERE.parents[1] / "posts_sentis_text_anon.csv"
RESCORED = HERE / "posts_rescored_service.csv"
OUT = HERE / "comparison.md"
LABELS = ["HAN", "LAN", "HAP", "LAP", "NEU"]


def main():
    csv.field_size_limit(sys.maxsize)
    stats = defaultdict(lambda: defaultdict(int))
    shifts = defaultdict(int)  # (original pos, neg) -> (new pos, neg) counts for rows that differ
    with open(ORIGINAL, newline="", encoding="utf-8") as fa, open(RESCORED, newline="", encoding="utf-8") as fb:
        ra, rb = csv.reader(fa), csv.reader(fb)
        header = next(ra)
        assert next(rb) == header
        col = {n: i for i, n in enumerate(header)}
        for a, b in zip(ra, rb):
            if len(a) < len(header):
                continue
            assert a[col["anon_post_id"]] == b[col["anon_post_id"]], "rows out of step"
            for group in ("study " + a[col["study"]], "ALL"):
                s = stats[group]
                s["rows"] += 1
                same_labels = all(a[col[l]] == b[col[l]] for l in LABELS)
                same_pos = a[col["ss_pos"]] == b[col["ss_pos"]]
                same_neg = a[col["ss_neg"]] == b[col["ss_neg"]]
                s["labels"] += same_labels
                s["pos"] += same_pos
                s["neg"] += same_neg
                s["exact"] += same_pos and same_neg
                for l in LABELS:
                    s["label_" + l] += a[col[l]] == b[col[l]]
            if a[col["ss_pos"]] != b[col["ss_pos"]] or a[col["ss_neg"]] != b[col["ss_neg"]]:
                shifts[(a[col["ss_pos"]], a[col["ss_neg"]], b[col["ss_pos"]], b[col["ss_neg"]])] += 1

    groups = sorted(g for g in stats if g != "ALL") + ["ALL"]
    pct = lambda s, k: f"{100 * s[k] / s['rows']:.2f}%"
    out = ["## Original CSV vs rescored with the collaborator's service (same row, same post)\n",
           "| | Rows | All 5 labels identical | Exact ss_pos+ss_neg | ss_pos | ss_neg |", "|---|---|---|---|---|---|"]
    for g in groups:
        s = stats[g]
        out.append(f"| {g} | {s['rows']:,} | {pct(s, 'labels')} | {pct(s, 'exact')} | {pct(s, 'pos')} | {pct(s, 'neg')} |")
    out += ["", "## Per label (identical flag)\n", "| | " + " | ".join(LABELS) + " |", "|---|" + "---|" * len(LABELS)]
    for g in groups:
        out.append(f"| {g} | " + " | ".join(pct(stats[g], "label_" + l) for l in LABELS) + " |")
    out += ["", "## Most common score changes (original ss_pos,ss_neg -> rescored)\n", "| Original | Rescored | Rows |", "|---|---|---|"]
    for (op, on, np_, nn), c in sorted(shifts.items(), key=lambda kv: -kv[1])[:10]:
        out.append(f"| {op},{on} | {np_},{nn} | {c:,} |")
    text = "\n".join(out) + "\n"
    OUT.write_text(text)
    print(text)
    print(f"saved to {OUT}")


if __name__ == "__main__":
    main()
