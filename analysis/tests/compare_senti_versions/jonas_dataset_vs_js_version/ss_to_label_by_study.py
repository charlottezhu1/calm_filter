"""
How do the CSV's ss_pos / ss_neg columns map to its HAN/LAN/HAP/LAP/NEU label columns, per study?
No scoring involved: only the CSV's own columns.

  python3 ss_to_label_by_study.py

1) Paper rule applied to the CSV's ss_pos/ss_neg vs the CSV's label columns.
2) Best possible rule: for each (ss_pos, ss_neg) pair, take the most common label set in that study.
   If the labels were a function of the two columns this would be 100%; below 100% means the same
   pair gets different labels in different rows.
3) For a few common pairs, the label sets seen in each study.
Labels (original paper): HAN neg<=-3, LAN neg=-2, HAP pos>=3, LAP pos=2, NEU pos=1 and neg=-1.
"""
import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[2] / "posts_sentis_text_anon.csv"
LABELS = ["HAN", "LAN", "HAP", "LAP", "NEU"]
PAIRS = [(1, -1), (2, -1), (1, -2), (3, -1), (1, -3), (2, -2)]


def rule(pos, neg):
    return (neg <= -3, neg == -2, pos >= 3, pos == 2, pos == 1 and neg == -1)


def name(flags):
    return "+".join(l for l, f in zip(LABELS, flags) if f) or "none"


def main():
    csv.field_size_limit(sys.maxsize)
    rows = defaultdict(int)
    rule_ok = defaultdict(int)
    by_pair = defaultdict(lambda: defaultdict(Counter))  # study -> (pos, neg) -> Counter(label set)
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        col = {n: header.index(n) for n in ["study", "ss_pos", "ss_neg", *LABELS]}
        for row in reader:
            if len(row) < len(header):
                continue
            study = "study " + row[col["study"]]
            pair = (int(row[col["ss_pos"]]), int(row[col["ss_neg"]]))
            flags = tuple(row[col[l]] == "1" for l in LABELS)
            rows[study] += 1
            rule_ok[study] += rule(*pair) == flags
            by_pair[study][pair][flags] += 1

    studies = sorted(rows)
    print("1) Paper rule applied to the CSV's ss_pos/ss_neg == the CSV's labels\n")
    print("| | Rows | Match |\n|---|---|---|")
    for s in studies:
        print(f"| {s} | {rows[s]:,} | {100 * rule_ok[s] / rows[s]:.2f}% |")

    print("\n2) Best possible rule on (ss_pos, ss_neg) alone: share of rows whose label is the "
          "most common label for their pair\n")
    print("| | Best-possible match | Pairs that get more than one label set |\n|---|---|---|")
    for s in studies:
        best = sum(c.most_common(1)[0][1] for c in by_pair[s].values())
        mixed = sum(1 for c in by_pair[s].values() if len(c) > 1)
        print(f"| {s} | {100 * best / rows[s]:.2f}% | {mixed} of {len(by_pair[s])} |")

    print("\n3) Label sets seen for common (ss_pos, ss_neg) pairs, per study (share of that pair's rows)\n")
    for pair in PAIRS:
        print(f"ss_pos={pair[0]}, ss_neg={pair[1]}  (paper rule says {name(rule(*pair))})")
        for s in studies:
            c = by_pair[s].get(pair)
            if not c:
                continue
            total = sum(c.values())
            top = ", ".join(f"{name(k)} {100 * v / total:.1f}%" for k, v in c.most_common(4))
            print(f"  {s}: {total:>7,} rows  ->  {top}")
        print()


if __name__ == "__main__":
    main()
