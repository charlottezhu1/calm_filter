"""Category cutoffs: sweep (negative valence cutoff, high arousal cutoff) on 10 fold CV predictions from the
browser embeddings and report precision and recall against human HAN (valence < 3.5 and arousal >= 4.0).
Usage: python3 analysis/image_affect/calibrate.py
"""
import json, os
import numpy as np, pandas as pd
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold

R = os.path.join('image_part', 'image_rating_resources', '6pnd7-osfstorage-archive', 'Stimulus set', 'OASIS', 'OASIS.csv')
E = np.array(json.load(open(os.path.join('image_part', 'out', 'emb_browser.json'))))
E /= np.linalg.norm(E, axis=1, keepdims=True)
Y = pd.read_csv(R)[['Valence_mean', 'Arousal_mean']].values
P = np.zeros_like(Y)
for tr, te in KFold(10, shuffle=True, random_state=0).split(E):
    mu, sd = E[tr].mean(0), E[tr].std(0) + 1e-8
    P[te] = Ridge(alpha=1000).fit((E[tr] - mu) / sd, Y[tr]).predict((E[te] - mu) / sd)
han = lambda v, a, nv, h: (v < nv) & (a >= h)
t = han(Y[:, 0], Y[:, 1], 3.5, 4.0)
print('human HAN images:', t.sum(), 'of', len(t))
for nv in [3.0, 3.25, 3.5, 3.75]:
    for h in [3.75, 4.0, 4.25]:
        p = han(P[:, 0], P[:, 1], nv, h); tp = (t & p).sum()
        print(f'neg<{nv} high>={h}: predicted {p.sum()} precision {tp / max(p.sum(), 1):.2f} recall {tp / t.sum():.2f}')
