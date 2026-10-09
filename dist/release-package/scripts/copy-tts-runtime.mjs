import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'public', 'tts-assets', 'runtime');
fs.mkdirSync(target, { recursive: true });

const files = [
  [path.join(root, 'node_modules', '@diffusionstudio', 'piper-wasm', 'build', 'piper_phonemize.data'), 'piper_phonemize.data'],
  [path.join(root, 'node_modules', '@diffusionstudio', 'piper-wasm', 'build', 'piper_phonemize.wasm'), 'piper_phonemize.wasm'],
  [path.join(root, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd.wasm'), 'ort-wasm-simd.wasm'],
  [path.join(root, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm.wasm'), 'ort-wasm.wasm'],
];

for (const [source, name] of files) {
  if (!fs.existsSync(source)) throw new Error(`Missing pinned TTS runtime asset: ${source}`);
  fs.copyFileSync(source, path.join(target, name));
}

console.log(`[JAMI TTS] Copied ${files.length} pinned runtime assets to public/tts-assets/runtime.`);
