// CLIP image embedding and affect head. Runs in the offscreen document.
// Needs the global `ort` (ort/ort.wasm.min.js) loaded first.
(function (root) {
  const MEAN = [0.48145466, 0.4578275, 0.40821073];
  const STD = [0.26862954, 0.26130258, 0.27577711];
  const SIZE = 224;
  let session = null;
  let head = null;

  // Resize shortest edge to 224, center crop 224, normalize, CHW float32.
  function preprocess(bitmap) {
    const w = bitmap.width, h = bitmap.height;
    const s = SIZE / Math.min(w, h);
    const rw = Math.max(SIZE, Math.round(w * s)), rh = Math.max(SIZE, Math.round(h * s));
    const c = new OffscreenCanvas(rw, rh);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, 0, 0, rw, rh);
    const x0 = Math.floor((rw - SIZE) / 2), y0 = Math.floor((rh - SIZE) / 2);
    const px = g.getImageData(x0, y0, SIZE, SIZE).data;
    const out = new Float32Array(3 * SIZE * SIZE);
    const plane = SIZE * SIZE;
    for (let i = 0; i < plane; i++) {
      for (let k = 0; k < 3; k++) out[k * plane + i] = (px[i * 4 + k] / 255 - MEAN[k]) / STD[k];
    }
    return out;
  }

  async function init(base) {
    if (session) return;
    ort.env.wasm.wasmPaths = base + 'ort/';
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    head = await (await fetch(base + 'weights.json')).json();
    session = await ort.InferenceSession.create(base + 'model/clip_vit_b32_int8.onnx', {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  }

  // pixels: array of Float32Array(3*224*224). Returns raw 512 d embeddings.
  async function embedBatch(pixels) {
    const n = pixels.length;
    const data = new Float32Array(n * 3 * SIZE * SIZE);
    pixels.forEach((p, i) => data.set(p, i * p.length));
    const r = await session.run({ pixel_values: new ort.Tensor('float32', data, [n, 3, SIZE, SIZE]) });
    const e = r.image_embeds.data;
    const d = e.length / n;
    return Array.from({ length: n }, (_, i) => e.slice(i * d, (i + 1) * d));
  }

  // L2 normalize, z score, ridge. Returns {v, a} on the 1 to 7 OASIS scale.
  function applyHead(emb) {
    let norm = 0;
    for (let i = 0; i < emb.length; i++) norm += emb[i] * emb[i];
    norm = Math.sqrt(norm) || 1;
    const out = head.biases.slice();
    for (let i = 0; i < emb.length; i++) {
      const z = (emb[i] / norm - head.mean[i]) / head.std[i];
      out[0] += head.weights[0][i] * z;
      out[1] += head.weights[1][i] * z;
    }
    return { v: out[0], a: out[1] };
  }

  async function fetchBitmap(url) {
    const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error('http ' + res.status);
    return createImageBitmap(await res.blob());
  }

  async function scoreUrls(urls) {
    const pre = await Promise.all(urls.map(async (u) => {
      try { const b = await fetchBitmap(u); const p = preprocess(b); if (b.close) b.close(); return p; }
      catch (e) { return null; }
    }));
    const ok = pre.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
    const res = urls.map(() => null);
    if (!ok.length) return res;
    const embs = await embedBatch(ok.map((i) => pre[i]));
    ok.forEach((i, k) => { res[i] = applyHead(embs[k]); });
    return res;
  }

  function cutoffs() { return head && head.cutoffs; }

  root.CalmEmbed = { init, cutoffs, preprocess, embedBatch, applyHead, scoreUrls, fetchBitmap };
})(typeof self !== 'undefined' ? self : this);
