// Pulls the text out of a PDF, in the browser. The PDF library is bundled
// with the app and runs in a local worker. The file never leaves the device.

import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { buildLines, type TextBit, type TextLine } from './lines';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export class PdfLockedError extends Error {
  override name = 'PdfLockedError';
}

/** Reads every page and returns its text as lines, top to bottom. */
export async function extractPdfLines(data: ArrayBuffer): Promise<TextLine[]> {
  // Every option that could make the library fetch something is switched off.
  const task = pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    useWasm: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    if (e instanceof Error && e.name === 'PasswordException') throw new PdfLockedError();
    throw e;
  }
  try {
    const lines: TextLine[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const bits: TextBit[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        bits.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
      }
      lines.push(...buildLines(bits));
      page.cleanup();
    }
    return lines;
  } finally {
    await task.destroy();
  }
}
