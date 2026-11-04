"""
Compares the SentiStrength word lists, run through the JS port, against the CSV.

  python3 compare_versions.py [max_rows]

  oct2019 : third_party/SentiStrength/

The CSV (posts_sentis_text_anon.csv) is the ground truth, grouped by its `study` column:
  A) all 5 labels (HAN, LAN, HAP, LAP, NEU) identical to the CSV label columns
  B) exact ss_pos and ss_neg equal to the CSV columns
  C) per-label agreement

Labels (original paper): HAN neg<=-3, LAN neg=-2, HAP pos>=3, LAP pos=2, NEU pos=1 and neg=-1.
Needs python3 and node on PATH. The full file takes several minutes (scoring is done in node).
Tables are printed and saved to results.md next to this file.
"""
import csv
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
TESTS = HERE.parents[1]
ROOT = TESTS.parent.parent
CSV_PATH = TESTS / "posts_sentis_text_anon.csv"
WORD_LISTS = {
    "oct2019": ROOT / "third_party" / "SentiStrength",
}
LABELS = ["HAN", "LAN", "HAP", "LAP", "NEU"]


def labels_for(pos, neg):
    return (neg <= -3, neg == -2, pos >= 3, pos == 2, pos == 1 and neg == -1)


def build_data_files(tmp):
    files = []
    for name, folder in WORD_LISTS.items():
        out = Path(tmp) / f"data_{name}.js"
        subprocess.run(["node", str(ROOT / "tools" / "build_ss_data.js"), str(folder), str(out)],
                       check=True, stdout=subprocess.DEVNULL)
        files.append(out)
    return files


def read_csv(texts_path, max_rows):
    """Writes each text (base64, one per line) to texts_path; returns the ground-truth rows."""
    import base64
    truth = []  # (study, labels tuple, ss_pos, ss_neg)
    csv.field_size_limit(sys.maxsize)
    with open(CSV_PATH, newline="", encoding="utf-8") as f, open(texts_path, "w") as out:
        reader = csv.reader(f)
        header = next(reader)
        col = {name: header.index(name) for name in ["study", "ss_pos", "ss_neg", "text", *LABELS]}
        for row in reader:
            if len(row) < len(header):
                continue
            truth.append((row[col["study"]],
                          tuple(row[col[l]] == "1" for l in LABELS),
                          int(row[col["ss_pos"]]), int(row[col["ss_neg"]])))
            out.write(base64.b64encode(row[col["text"]].encode("utf-8")).decode() + "\n")
            if max_rows and len(truth) >= max_rows:
                break
    return truth


def tally(truth, scores_path):
    names = list(WORD_LISTS)
    stats = defaultdict(lambda: {"rows": 0, **{n: {"all5": 0, "exact": 0, "label": [0] * 5} for n in names}})
    with open(scores_path) as f:
        for (study, csv_labels, csv_pos, csv_neg), line in zip(truth, f):
            nums = list(map(int, line.split()))
            for group in (f"study {study}", "ALL"):
                s = stats[group]
                s["rows"] += 1
                for i, n in enumerate(names):
                    pos, neg = nums[2 * i], nums[2 * i + 1]
                    mine = labels_for(pos, neg)
                    ok = True
                    for k in range(5):
                        if mine[k] == csv_labels[k]:
                            s[n]["label"][k] += 1
                        else:
                            ok = False
                    s[n]["all5"] += ok
                    s[n]["exact"] += (pos == csv_pos and neg == csv_neg)
    return stats


def tables(stats):
    names = list(WORD_LISTS)
    groups = sorted(g for g in stats if g != "ALL") + ["ALL"]
    pct = lambda a, n: f"{100 * a / n:.2f}%"
    head = "| | Rows | " + " | ".join(f"JS + {n}" for n in names) + " |\n|---|---|" + "---|" * len(names) + "\n"
    out = ["## A) All 5 labels (HAN/LAN/HAP/LAP/NEU) identical to the CSV\n\n" + head + "".join(
        f"| {g} | {stats[g]['rows']:,} | " + " | ".join(pct(stats[g][n]["all5"], stats[g]["rows"]) for n in names) + " |\n"
        for g in groups)]
    head2 = "| | " + " | ".join(f"JS + {n}" for n in names) + " |\n|---|" + "---|" * len(names) + "\n"
    out.append("## B) Exact ss_pos and ss_neg equal to the CSV columns\n\n" + head2 + "".join(
        f"| {g} | " + " | ".join(pct(stats[g][n]["exact"], stats[g]["rows"]) for n in names) + " |\n"
        for g in groups))
    for g in groups:
        out.append(f"## C) Per label: {g}\n\n| Label | " + " | ".join(f"JS + {n}" for n in names) + " |\n|---|" + "---|" * len(names) + "\n" + "".join(
            f"| {l} | " + " | ".join(pct(stats[g][n]["label"][k], stats[g]["rows"]) for n in names) + " |\n"
            for k, l in enumerate(LABELS)))
    return "\n".join(out)


def main():
    max_rows = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    with tempfile.TemporaryDirectory() as tmp:
        data_files = build_data_files(tmp)
        texts, scores = Path(tmp) / "texts.b64", Path(tmp) / "scores.txt"
        print("reading CSV ...", flush=True)
        truth = read_csv(texts, max_rows)
        print(f"scoring {len(truth):,} rows with {len(data_files)} word lists in node ...", flush=True)
        with open(texts) as fin, open(scores, "w") as fout:
            subprocess.run(["node", str(ROOT / "tools" / "score_texts.js"), *map(str, data_files)],
                           stdin=fin, stdout=fout, check=True)
        result = tables(tally(truth, scores))
    (HERE / "results.md").write_text(result)
    print("\n" + result)
    print(f"saved to {HERE / 'results.md'}")


if __name__ == "__main__":
    main()
