"""Check that local SentiStrength + the paper rule (backend/affect.py)
reproduces the HAN/LAN/HAP/LAP/NEU labels in posts_sentis_text_anon.csv.

Runs backend/py4j/libs/SentiStrength.jar with backend/py4j/en/ over the CSV
texts, applies classify_affect to the scores, and compares with the label
columns. The CSV's own ss_pos/ss_neg columns are also scored for reference.

    python3 verify_sentistrength_rule.py [--limit N] [--out DIR]
"""
import argparse
import csv
import glob
import os
import subprocess
import sys
import tempfile
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, '..', '..', '..', '..', 'backend')
sys.path.insert(0, BACKEND)
from affect import CLASSES, classify_affect  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('--csv', default=os.path.join(HERE, '..', '..', 'posts_sentis_text_anon.csv'))
ap.add_argument('--jar', default=os.path.join(BACKEND, 'py4j', 'libs', 'SentiStrength.jar'))
ap.add_argument('--data', default=os.path.join(BACKEND, 'py4j', 'en') + os.sep)
ap.add_argument('--limit', type=int, default=0, help='score only the first N rows (0 = all)')
ap.add_argument('--out', default=None, help='directory for the jar input/output files')
args = ap.parse_args()

out_dir = args.out or tempfile.mkdtemp(prefix='ss_verify_')
os.makedirs(out_dir, exist_ok=True)
texts_path = os.path.join(out_dir, 'texts.txt')

csv.field_size_limit(sys.maxsize)
truth, csv_scores = [], []
with open(args.csv, newline='', encoding='utf-8') as f, open(texts_path, 'w', encoding='utf-8') as t:
    for i, row in enumerate(csv.DictReader(f)):
        if args.limit and i >= args.limit:
            break
        truth.append(frozenset(c for c in CLASSES if row[c] == '1'))
        csv_scores.append((int(row['ss_pos']), int(row['ss_neg'])))
        t.write(row['text'].replace('\r', ' ').replace('\n', ' ') + '\n')
print(f'{len(truth)} rows read; running SentiStrength...', flush=True)

subprocess.run(['java', '-jar', args.jar, 'sentidata', args.data, 'input', texts_path],
               check=True, stdout=subprocess.DEVNULL)
out_files = glob.glob(os.path.join(out_dir, 'texts*_out.txt'))
assert len(out_files) == 1, f'expected one jar output file, found {out_files}'
with open(out_files[0], encoding='utf-8') as f:
    next(f)  # header: Positive, Negative, Text
    jar_scores = [tuple(int(x) for x in line.split('\t', 2)[:2]) for line in f]
assert len(jar_scores) == len(truth), (len(jar_scores), len(truth))


def labels(scores):
    return [frozenset(c for c, hit in classify_affect(p, n).items() if hit) for p, n in scores]


def report(title, scores):
    pred = labels(scores)
    n = len(truth)
    exact = sum(p == t for p, t in zip(pred, truth))
    print(f'\n== {title}')
    print(f'label set exactly equal: {exact}/{n} = {exact / n:.2%}')
    print(f'{"class":5s} {"truth":>8s} {"pred":>8s} {"prec":>6s} {"recall":>6s} {"F1":>6s} {"agree":>7s}')
    for c in CLASSES:
        tp = sum(c in p and c in t for p, t in zip(pred, truth))
        fp = sum(c in p and c not in t for p, t in zip(pred, truth))
        fn = sum(c not in p and c in t for p, t in zip(pred, truth))
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        agree = (n - fp - fn) / n
        print(f'{c:5s} {tp + fn:8d} {tp + fp:8d} {prec:6.3f} {rec:6.3f} {f1:6.3f} {agree:7.2%}')
    miss = Counter((tuple(sorted(p)), tuple(sorted(t))) for p, t in zip(pred, truth) if p != t)
    print('most common mismatches (predicted vs CSV label):')
    for (p, t), k in miss.most_common(6):
        print(f'  {k:8d}  {"+".join(p) or "-"}  vs  {"+".join(t) or "-"}')


report('local SentiStrength jar + paper rule', jar_scores)
report("CSV's own ss_pos/ss_neg columns + paper rule (reference)", csv_scores)
same = sum(j == c for j, c in zip(jar_scores, csv_scores))
print(f'\njar scores identical to CSV ss_pos/ss_neg: {same}/{len(truth)} = {same / len(truth):.2%}')
