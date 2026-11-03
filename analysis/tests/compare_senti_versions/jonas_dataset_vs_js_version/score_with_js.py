"""
Scores every post in posts_sentis_text_anon.csv with the JS SentiStrength only
(chrome_extension/sentistrength.js + chrome_extension/sentistrength_data.js, Oct 2019 word lists).

  python3 score_with_js.py [max_rows]

Output: posts_scored_js.csv in this folder. Same rows and columns as the input; HAN, LAN, HAP,
LAP, NEU, ss_pos and ss_neg are replaced by the JS version's values.
Labels (original paper): HAN neg<=-3, LAN neg=-2, HAP pos>=3, LAP pos=2, NEU pos=1 and neg=-1.
Needs python3 and node on PATH. Takes several minutes for the full file.
"""
import base64
import csv
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
TESTS = HERE.parents[1]
ROOT = HERE.parents[3]
CSV_IN = TESTS / "posts_sentis_text_anon.csv"
CSV_OUT = HERE / "posts_scored_js.csv"
SCORE_TEXTS = ROOT / "tools" / "score_texts.js"
DATA = ROOT / "chrome_extension" / "sentistrength_data.js"


def main():
    max_rows = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    csv.field_size_limit(sys.maxsize)
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        texts, scores = Path(tmp) / "texts.b64", Path(tmp) / "scores.txt"

        n = 0
        with open(CSV_IN, newline="", encoding="utf-8") as f, open(texts, "w") as out:
            reader = csv.reader(f)
            header = next(reader)
            text_col = header.index("text")
            for row in reader:
                if len(row) < len(header):
                    continue
                out.write(base64.b64encode(row[text_col].encode("utf-8")).decode() + "\n")
                n += 1
                if max_rows and n >= max_rows:
                    break
        print(f"scoring {n:,} posts with the JS version ...", flush=True)
        with open(texts) as fin, open(scores, "w") as fout:
            subprocess.run(["node", str(SCORE_TEXTS), str(DATA)], stdin=fin, stdout=fout, check=True)

        col = {name: i for i, name in enumerate(header)}
        written = 0
        with open(CSV_IN, newline="", encoding="utf-8") as f, open(scores) as sc, \
                open(CSV_OUT, "w", newline="", encoding="utf-8") as fout:
            reader = csv.reader(f)
            next(reader)
            writer = csv.writer(fout)
            writer.writerow(header)
            for row, line in zip((r for r in reader if len(r) >= len(header)), sc):
                pos, neg = map(int, line.split())
                row[col["ss_pos"]], row[col["ss_neg"]] = pos, neg
                row[col["HAN"]] = int(neg <= -3)
                row[col["LAN"]] = int(neg == -2)
                row[col["HAP"]] = int(pos >= 3)
                row[col["LAP"]] = int(pos == 2)
                row[col["NEU"]] = int(pos == 1 and neg == -1)
                writer.writerow(row)
                written += 1
    print(f"done: {written:,} rows in {time.time() - t0:.0f}s -> {CSV_OUT}")


if __name__ == "__main__":
    main()
