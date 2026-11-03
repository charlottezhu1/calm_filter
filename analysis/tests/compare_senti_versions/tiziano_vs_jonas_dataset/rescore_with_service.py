"""
Rescores posts_sentis_text_anon.csv with the collaborator's SentiStrength service
(tiziano_service/SentiStrengthService.jar, scored and parsed by its own logic.py).

  1. Start the service FROM INSIDE its folder (the word-list path in the jar is relative):
       cd tiziano_service && java -jar SentiStrengthService.jar
  2. python3 rescore_with_service.py [max_rows]

Output (same columns as the input CSV, scores replaced by the service's):
  posts_rescored_service.csv (next to this script)
Needs python3 with py4j and pytz. logic.py imports feed_manager (not in that folder) but get_score
does not use it, so a stub is registered before importing.
"""
import csv
import sys
import time
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVICE_DIR = HERE / "tiziano_service"
CSV_IN = HERE.parents[1] / "posts_sentis_text_anon.csv"
CSV_OUT = HERE / "posts_rescored_service.csv"

sys.modules["feed_manager"] = types.SimpleNamespace(XFeedManager=None)
sys.path.insert(0, str(SERVICE_DIR))
import logic  # noqa: E402  (the collaborator's scoring code, unchanged)


def main():
    max_rows = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    csv.field_size_limit(sys.maxsize)
    CSV_OUT.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    n = 0
    with open(CSV_IN, newline="", encoding="utf-8") as fin, \
            open(CSV_OUT, "w", newline="", encoding="utf-8") as fout:
        reader = csv.reader(fin)
        header = next(reader)
        col = {name: i for i, name in enumerate(header)}
        writer = csv.writer(fout)
        writer.writerow(header)
        for row in reader:
            if len(row) < len(header):
                continue
            r = logic.get_score(row[col["text"]])
            for key in ("HAN", "LAN", "HAP", "LAP", "NEU"):
                row[col[key]] = r[key]
            row[col["ss_pos"]] = r["pos"]
            row[col["ss_neg"]] = r["neg"]
            writer.writerow(row)
            n += 1
            if n % 50000 == 0:
                print(f"{n:,} rows  {time.time() - t0:.0f}s", flush=True)
            if max_rows and n >= max_rows:
                break
    print(f"done: {n:,} rows in {time.time() - t0:.0f}s -> {CSV_OUT}")


if __name__ == "__main__":
    main()
