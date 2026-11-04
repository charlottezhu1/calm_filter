"""
This module does the calibration of the sentistrength boundary

The cutoff point is based on this for sentistrength:

LAP tweets were those that received a SentiStrength positivity score of 2; HAP tweets were those that received SentiStrength positivity scores of 3, 4, or 5; LAN tweets were those that received SentiStrength negativity scores of 2; and HAN tweets were those that received Senti- Strength negativity scores of 3, 4, and 5 (see Table 1 for examples of coded tweets). We used 3 and above to indicate high arousal because words psychometrically associated with“high arousal” (e.g.,“excitement”) were assigned a score of 3 by SentiStrength. “Neutral [NEU] or uncodable” tweets were those that received

1. Call the english version of sentistrength, rebuild the boundary based on the
above paragraph.
/Users/xuyangzhu/Desktop/ami_plugin/third_party/SentiStrength
Test and verify the boundary with the test data in the file below.
/Users/xuyangzhu/Desktop/ami_plugin/analysis/tests/posts_sentis_text_anon.csv
(you can segment the first 100 rows for the quick test.)

This was the original paper category sorting
HAN (High-Arousal Negative) : ss_neg ≤ −3
 LAN (Low-Arousal Negative) : ss_neg = −2
 HAP (High-Arousal Positive) : ss_pos ≥ 3
 LAP (Low-Arousal Positive) : ss_pos = 2
 NEU (Neutral): ss_pos = 1 AND ss_neg = −1


2. The goal is to adjust the boundary in /Users/xuyangzhu/Desktop/ami_plugin/chrome_extension
for it to align with the judgments of sentistrength as much as possible.
Before you do anything, tell me whhat does the AFINN module return right now?
pos, neg, and neu?
We are trying to change the HAN and LAN cutoff points so that AFINN module should
be aligned with sentistrength as much as possible.
Think about what is a good way to do this - discuss tradeoffs.
(For example, we can adjust 0.1 at a time and scoring against 200k rows - which will
be slow. Or better maybe we use a smaller sample of the data to get to top 3 and
then we use the full set)
The idea is we do not change any word in the AFINN module (at this stage)

Usage:  python3 calibrate.py [--limit N] [--analyze-only]

Part 1 scores every post in posts_sentis_text_anon.csv with the extension's own
AFINN module (chrome_extension/sentiment.js, run under Node) and writes
posts_afinn_anon.csv: the same id columns and HAN/LAN/HAP/LAP/NEU columns as the
SentiStrength file, with afinn_pos/afinn_neg (0 to 5, max word score) in place of
ss_pos/ss_neg. The labels there use HAN = afinn_neg >= 3, LAN = 1 to 2, HAP =
afinn_pos >= 3, LAP = 1 to 2, NEU = both 0.
Part 2 compares the two CSVs: how well "afinn_neg >= boundary" matches the HAN
column of the SentiStrength file, for boundary 3 and 2.
"""
import argparse
import csv
import os
import subprocess
import sys
import tempfile

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SS_CSV = os.path.join(HERE, '..', 'posts_sentis_text_anon.csv')
AFINN_CSV = os.path.join(HERE, 'posts_afinn_anon.csv')
SENTIMENT_JS = os.path.join(HERE, '..', '..', '..', 'chrome_extension', 'sentiment.js')
ID_COLS = ['anon_post_id', 'anon_participant_id', 'study', 'day_index']


def score_with_afinn(limit):
    """Part 1: write posts_afinn_anon.csv."""
    csv.field_size_limit(sys.maxsize)
    ids = []
    with tempfile.TemporaryDirectory() as tmp:
        texts, scores = os.path.join(tmp, 'texts.txt'), os.path.join(tmp, 'scores.tsv')
        with open(SS_CSV, newline='', encoding='utf-8') as f, open(texts, 'w', encoding='utf-8') as t:
            for i, row in enumerate(csv.DictReader(f)):
                if limit and i >= limit:
                    break
                ids.append([row[c] for c in ID_COLS])
                t.write(row['text'].replace('\r', ' ').replace('\n', ' ') + '\n')
        subprocess.run(['node', os.path.join(HERE, 'afinn_score.js'), SENTIMENT_JS, texts, scores], check=True)
        df = pd.read_csv(scores, sep='\t', header=None, names=['afinn_pos', 'afinn_neg'])
    assert len(df) == len(ids), (len(df), len(ids))
    pos, neg = df.afinn_pos, df.afinn_neg
    labels = pd.DataFrame({'HAN': neg >= 3, 'LAN': neg.between(1, 2), 'HAP': pos >= 3,
                           'LAP': pos.between(1, 2), 'NEU': (pos == 0) & (neg == 0)}).astype(int)
    out = pd.concat([pd.DataFrame(ids, columns=ID_COLS), labels, df], axis=1)
    out.to_csv(AFINN_CSV, index=False)
    print(f'wrote {len(out)} rows to {AFINN_CSV}')


def pct(n, total):
    return f'{n:,} ({n / total:.1%})'


def analyze():
    """Part 2: compare afinn_neg >= boundary with the SentiStrength HAN column."""
    afinn = pd.read_csv(AFINN_CSV, usecols=['anon_post_id', 'afinn_neg'])
    ss = pd.read_csv(SS_CSV, usecols=['anon_post_id', 'HAN'])
    df = afinn.merge(ss, on='anon_post_id')  # inner join, so --limit runs compare the same rows
    assert len(df) == len(afinn) and df.anon_post_id.is_unique, 'post ids do not line up'
    n, han = len(df), df.HAN == 1
    print(f'\nPosts: {n:,}   HAN in SentiStrength CSV: {pct(han.sum(), n)}\n')

    r = {}
    for b in (3, 2):
        flag = df.afinn_neg >= b
        r[b] = {'both HAN': (flag & han).sum(), 'added': (flag & ~han).sum(),
                'lost': (~flag & han).sum(), 'both not HAN': (~flag & ~han).sum()}

    def table(title, header, rows):
        print(title)
        w = [max(len(str(x)) for x in col) for col in zip(header, *rows)]
        for line in [header, ['-' * k for k in w]] + rows:
            print('| ' + ' | '.join(str(x).ljust(k) for x, k in zip(line, w)) + ' |')
        print()

    t = han.sum()
    rows = [['never flag HAN (baseline)', f'{n - t:,}', f'{(n - t) / n:.1%}', pct(0, t), pct(t, t)]]
    for b in (3, 2):
        agree = r[b]['both HAN'] + r[b]['both not HAN']
        rows.append([f'AFINN neg >= {b}', f'{agree:,}', f'{agree / n:.1%}',
                     pct(r[b]['both HAN'], t), pct(r[b]['lost'], t)])
    table('1. Alignment (AFINN and SentiStrength agree on HAN / not HAN), and the share of true HAN caught',
          ['Rule', 'Posts that agree', 'Alignment', 'True HAN caught', 'True HAN lost'], rows)
    table('2. Counts (% of all posts)', ['', 'boundary >= 3', 'boundary >= 2'],
          [[k, pct(r[3][k], n), pct(r[2][k], n)] for k in
           ('both HAN', 'added', 'lost', 'both not HAN')])


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='use only the first N rows (0 = all)')
    ap.add_argument('--analyze-only', action='store_true', help='reuse an existing posts_afinn_anon.csv')
    args = ap.parse_args()
    if not args.analyze_only:
        score_with_afinn(args.limit)
    analyze()

