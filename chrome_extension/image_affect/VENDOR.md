# Vendored files

* `ort/`: onnxruntime-web 1.20.1 (MIT), copied unmodified from the npm package `dist/` (ort.wasm.min.js, ort-wasm-simd-threaded.mjs, ort-wasm-simd-threaded.wasm). No bundler.
* `model/clip_vit_b32_int8.onnx`: CLIP ViT B/32 vision encoder, int8 quantized, sha256 in `weights.json`. Gitignored; copy it in from image_part/image_rating_resources/vision_model_quantized.onnx.
