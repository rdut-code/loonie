import { inferDateOrder, parseCents, parseDate } from '../money';
import type { ParseResult, RawLine } from '../types';
import { findColumn } from './csv';

// American Express (Canada) activity download.
// Layout: a header row with Date, Description and Amount, sometimes after a
// few title rows. Charges are positive, payments and credits are negative.
// Any "Account #" or reference column is never read.

const AMEX_ONLY = /^(date processed|card ?member|foreign spend amount|appears on your statement as|additional information|extended details|commission|exchange rate)$/i;

function findHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const row = rows[i];
    if (
      findColumn(row, /^date$/i) >= 0 &&
      findColumn(row, /^amount$/i) >= 0 &&
      findColumn(row, /^(description|merchant)$/i) >= 0
    ) {
      return i;
    }
  }
  return -1;
}

export function detectAmex(rows: string[][]): boolean {
  const at = findHeader(rows);
  return at >= 0 && rows[at].some((cell) => AMEX_ONLY.test(cell));
}

export function parseAmex(rows: string[][]): ParseResult {
  const at = findHeader(rows);
  if (at < 0) return { format: 'Amex CSV', lines: [], skipped: rows.length };
  const header = rows[at];
  const dateCol = findColumn(header, /^date$/i);
  const amountCol = findColumn(header, /^amount$/i);
  const descCol = findColumn(header, /^description$/i);
  const merchantCol = findColumn(header, /^merchant$/i);
  const body = rows.slice(at + 1);

  // Amex Canada writes day first ("04 Nov 2026" or 04/11/2026).
  const order = inferDateOrder(body.map((r) => r[dateCol] ?? ''), 'DMY');

  const lines: RawLine[] = [];
  let skipped = 0;
  for (const row of body) {
    const date = parseDate(row[dateCol] ?? '', order);
    const cents = parseCents(row[amountCol] ?? '');
    const description = (descCol >= 0 ? row[descCol] : '') || (merchantCol >= 0 ? row[merchantCol] : '') || '';
    if (!date || cents === null || !description) {
      skipped++;
      continue;
    }
    lines.push({ date, description, outCents: cents });
  }
  return { format: 'Amex CSV', lines, skipped };
}
