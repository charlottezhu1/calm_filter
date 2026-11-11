"""Embed OASIS with the int8 CLIP vision model (onnxruntime) and fit the ridge head.
Usage: python3 analysis/image_affect/fit_head.py [--browser]
Default embeds with onnxruntime (Python). --browser uses image_part/out/emb_browser.json from embed_in_browser.mjs
and writes the shipped chrome_extension/image_affect/weights.json (with category cutoffs).
"""
import json, os, sys, hashlib
import numpy as np, pandas as pd
from PIL import Image
import onnxruntime as ort
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold, GroupKFold

R = os.path.join('image_part', 'image_rating_resources')
OAS = os.path.join(R, '6pnd7-osfstorage-archive', 'Stimulus set', 'OASIS')
MODEL = os.path.join(R, 'vision_model_quantized.onnx')
OUT = os.path.join('image_part', 'out')
os.makedirs(OUT, exist_ok=True)
MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)

def prep(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size; s = 224 / min(w, h)
    im = im.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = im.size; l, t = (w - 224) // 2, (h - 224) // 2
    a = np.asarray(im.crop((l, t, l + 224, t + 224)), np.float32) / 255
    return ((a - MEAN) / STD).transpose(2, 0, 1)

df = pd.read_csv(os.path.join(OAS, 'OASIS.csv'))
df.columns = [c.strip() for c in df.columns]
names = df['Theme'].str.strip().tolist()
BROWSER = '--browser' in sys.argv
embp = os.path.join(OUT, 'emb_py.npy')
if BROWSER:
    E = np.array(json.load(open(os.path.join(OUT, 'emb_browser.json'))))
elif os.path.exists(embp):
    E = np.load(embp)
else:
    sess = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
    files = {f.rsplit('.', 1)[0].strip(): f for f in os.listdir(os.path.join(OAS, 'images'))}
    E = []
    for i in range(0, len(names), 16):
        x = np.stack([prep(os.path.join(OAS, 'images', files[n])) for n in names[i:i + 16]])
        E.append(sess.run(None, {'pixel_values': x})[0])
    E = np.concatenate(E); np.save(embp, E)
E = E / np.linalg.norm(E, axis=1, keepdims=True)
Y = df[['Valence_mean', 'Arousal_mean']].values
cat = df['Category'].values
print('emb', E.shape)

def cv(alpha, splitter, groups=None):
    P = np.zeros_like(Y)
    for tr, te in splitter.split(E, Y, groups):
        mu, sd = E[tr].mean(0), E[tr].std(0) + 1e-8
        m = Ridge(alpha=alpha).fit((E[tr] - mu) / sd, Y[tr])
        P[te] = m.predict((E[te] - mu) / sd)
    return P, [np.corrcoef(P[:, k], Y[:, k])[0, 1] for k in range(2)]

res = {}
for a in [100, 300, 1000, 3000, 10000]:
    _, r = cv(a, KFold(10, shuffle=True, random_state=0))
    _, rg = cv(a, GroupKFold(4), cat)
    res[a] = (r, rg)
    print(f'alpha {a}: 10fold r(v,a)={r[0]:.3f},{r[1]:.3f}  leave-category-out r={rg[0]:.3f},{rg[1]:.3f}')
best = max(res, key=lambda a: res[a][0][0] + res[a][0][1])
print('best alpha', best)

# reliability ceiling from raw ratings (split half, Spearman-Brown)

P, r = cv(best, KFold(10, shuffle=True, random_state=0))
print('final CV r', r, 'MAE', np.abs(P - Y).mean(0))
mu, sd = E.mean(0), E.std(0) + 1e-8
m = Ridge(alpha=best).fit((E - mu) / sd, Y)
w = {'version': 1, 'model_sha256': hashlib.sha256(open(MODEL, 'rb').read()).hexdigest(),
     'alpha': best, 'mean': mu.tolist(), 'std': sd.tolist(),
     'weights': m.coef_.tolist(), 'biases': m.intercept_.tolist(),
     'cv_r': {'valence': r[0], 'arousal': r[1]}}
if BROWSER:
    w['version'] = 2; w['source'] = 'browser_embeddings'
    w['cutoffs'] = {'neg': 3.5, 'pos': 4.5, 'high': 3.75}   # see calibrate.py
    json.dump(w, open(os.path.join('chrome_extension', 'image_affect', 'weights.json'), 'w'))
else:
    json.dump(w, open(os.path.join(OUT, 'weights_py.json'), 'w'))
np.save(os.path.join(OUT, 'cv_pred.npy'), P)
