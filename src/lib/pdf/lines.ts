// Turns loose bits of positioned text from a PDF page into readable lines.

export interface TextBit {
  str: string;
  /** Left edge, in PDF points. */
  x: number;
  /** Baseline height on the page. Larger is higher up. */
  y: number;
  width: number;
}

/** A run of text on a line, such as one table cell. */
export interface Cell {
  str: string;
  x: number;
  right: number;
}

export interface TextLine {
  /** Cells joined with two spaces, so columns stay apart. */
  text: string;
  cells: Cell[];
  /** Set on lines read from a photo when a number on the line was hard to read. */
  unsure?: boolean;
}

const SAME_LINE = 2.5;
const NEW_CELL_GAP = 7;

export function buildLines(bits: TextBit[]): TextLine[] {
  const sorted = [...bits].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextBit[][] = [];
  for (const bit of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - bit.y) <= SAME_LINE) row.push(bit);
    else rows.push([bit]);
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const bit of row) {
      const last = cells[cells.length - 1];
      const gap = last ? bit.x - last.right : Infinity;
      if (last && gap < NEW_CELL_GAP) {
        last.str += (gap > 1 && !last.str.endsWith(' ') && !bit.str.startsWith(' ') ? ' ' : '') + bit.str;
        last.right = bit.x + bit.width;
      } else {
        cells.push({ str: bit.str, x: bit.x, right: bit.x + bit.width });
      }
    }
    for (const cell of cells) cell.str = cell.str.replace(/\s+/g, ' ').trim();
    return { text: cells.map((c) => c.str).join('  '), cells };
  });
}

/** One word as read from a photo, with its box in image pixels and how sure the reader was (0 to 100). */
export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}

const AMOUNT_LIKE = /^-?\$?[\d,]*\.\d{2}(?:-|CR)?$/i;

/** Repairs the slips a photo reader makes most often on money. */
export function fixOcrWord(text: string): string {
  let s = text.replace(/[|]/g, '').trim();
  // A zero read in place of the letter O in a month: "210CT" is "21 OCT".
  s = s.replace(/^(\d{1,2})?(0CT|N0V)$/i, (_, day: string | undefined, month: string) =>
    (day ? day + ' ' : '') + month.toUpperCase().replace('0', 'O'),
  );
  // "S46.18" is "$46.18".
  s = s.replace(/^[S§](?=\d[\d,]*[.,]\d{2}\b)/, '$');
  // "46,18" is "46.18". A real thousands comma is followed by three digits.
  if (/^-?\$?\d[\d,.]*,\d{2}(?:-|CR)?$/i.test(s)) s = s.replace(/,(\d{2})(-|CR)?$/i, '.$1$2');
  return s;
}

/**
 * Rebuilds table rows from loose words. A photo reader often splits one
 * row into separate pieces (date on the left, amount far right), so words
 * are regrouped here by how high they sit on the page.
 *
 * @param tilt  how far the text slopes, in radians (positive: down to the right).
 *              A photo taken slightly crooked would otherwise mix up its rows.
 */
export function buildLinesFromWords(words: OcrWord[], tilt = 0): TextLine[] {
  const usable = words
    .map((w) => ({ ...w, text: fixOcrWord(w.text) }))
    .filter((w) => w.text !== '' && w.y1 > w.y0 && w.x1 > w.x0);
  if (usable.length === 0) return [];

  const heights = usable.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)];
  const slope = Math.tan(tilt);
  // Height of the word's middle, as if the page had been straight.
  const middle = (w: OcrWord) => (w.y0 + w.y1) / 2 - ((w.x0 + w.x1) / 2) * slope;

  const sorted = [...usable].sort((a, b) => middle(a) - middle(b));
  const rows: OcrWord[][] = [];
  let rowMiddle = 0;
  for (const word of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(middle(word) - rowMiddle) <= typical * 0.6) {
      row.push(word);
      rowMiddle = row.reduce((sum, w) => sum + middle(w), 0) / row.length;
    } else {
      rows.push([word]);
      rowMiddle = middle(word);
    }
  }

  return rows.map((row) => {
    row.sort((a, b) => a.x0 - b.x0);
    const cells: Cell[] = [];
    let unsure = false;
    for (const word of row) {
      // A doubtful amount matters. A doubtful word in a shop name does not.
      if (AMOUNT_LIKE.test(word.text) ? word.confidence < 80 : /\d/.test(word.text) && word.confidence < 50) unsure = true;
      const last = cells[cells.length - 1];
      if (last && word.x0 - last.right < typical * 1.5) {
        last.str += ' ' + word.text;
        last.right = word.x1;
      } else {
        cells.push({ str: word.text, x: word.x0, right: word.x1 });
      }
    }
    return { text: cells.map((c) => c.str).join('  '), cells, unsure };
  });
}
