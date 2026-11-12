// Reads the text in a photo or screenshot of a statement, on this device.
// The reading engine (Tesseract) and its English data ship with the app
// and are loaded from the app's own address. The picture is never sent anywhere.

import { createWorker } from 'tesseract.js';
import { buildLinesFromWords, type OcrWord, type TextLine } from '../pdf/lines';

export class PhotoUnreadableError extends Error {
  override name = 'PhotoUnreadableError';
}

/** Opens the picture, turns it the right way up, and sizes it so the text is readable but not huge. */
async function toCanvas(file: Blob): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoUnreadableError();
  }
  const longSide = Math.max(bitmap.width, bitmap.height);
  let scale = 1;
  if (longSide > 3200) scale = 3200 / longSide;
  else if (longSide < 1600) scale = Math.min(2.5, 1600 / longSide);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoUnreadableError();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function readPhoto(file: Blob, onProgress?: (fraction: number) => void): Promise<TextLine[]> {
  const canvas = await toCanvas(file);
  const base = new URL('ocr/', document.baseURI).href;
  const worker = await createWorker('eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base,
    // Load the worker straight from the app's address, and keep no copy of anything in browser storage.
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
    const words: OcrWord[] = [];
    const slopes: number[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          const { x0, y0, x1, y1 } = line.baseline;
          if (line.words.length >= 3 && x1 - x0 > 50) slopes.push(Math.atan2(y1 - y0, x1 - x0));
          for (const word of line.words) {
            words.push({ text: word.text, ...word.bbox, confidence: word.confidence });
          }
        }
      }
    }
    // The typical slope of the text lines tells how crooked the photo is.
    slopes.sort((a, b) => a - b);
    const tilt = slopes.length ? slopes[Math.floor(slopes.length / 2)] : 0;
    return buildLinesFromWords(words, tilt);
  } finally {
    await worker.terminate();
    // Let go of the picture.
    canvas.width = 0;
    canvas.height = 0;
  }
}
