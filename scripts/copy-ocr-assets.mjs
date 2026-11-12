// Copies the photo-reading (OCR) engine and its English data out of
// node_modules into public/ocr, so the app serves them itself.
// Nothing is ever loaded from another site. Runs before dev and build.

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // The worker picks one of these three, depending on what the device supports.
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];

for (const [from, to] of files) {
  const source = join(root, 'node_modules', from);
  const target = join(out, to);
  if (existsSync(target) && statSync(target).size === statSync(source).size) continue;
  copyFileSync(source, target);
}
