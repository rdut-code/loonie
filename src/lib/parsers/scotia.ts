import { inferDateOrder, parseCents, parseDate } from '../money';
import type { ParseResult, RawLine } from '../types';
import { findColumn } from './csv';

// Scotiabank downloads. Three layouts are understood:
//  1. Newer export with a header row:
//     Filter, Date, Description, Sub-description, Status, Type of Transaction, Amount
//  2. Older card export, no header:    date, description, amount
//  3. Older chequing export, no header: date, amount, "-", type, description
// In the older files a negative amount means money out.
// These are built from the publicly known layouts and should be checked
// against a real file. The manual column picker is the fallback.

function isDate(cell: string): boolean {
  return parseDate(cell, 'MDY') !== null || parseDate(cell, 'DMY') !== null;
}

function headerRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (findColumn(rows[i], /^sub-?description$/i) >= 0 || findColumn(rows[i], /^type of transaction$/i) >= 0) {
      return i;
    }
  }
  return -1;
}

type Layout = 'header' | 'card' | 'bank' | null;

function layoutOf(rows: string[][]): Layout {
  if (headerRow(rows) >= 0) return 'header';
  const first = rows[0];
  if (!first || !isDate(first[0] ?? '')) return null;
  if (first.length === 3 && parseCents(first[2]) !== null && parseCents(first[1]) === null) return 'card';
  if (first.length >= 5 && parseCents(first[1]) !== null && parseCents(first[4] ?? '') === null) return 'bank';
  return null;
}

export function detectScotia(rows: string[][]): boolean {
  return layoutOf(rows) !== null;
}

export function parseScotia(rows: string[][]): ParseResult {
  const layout = layoutOf(rows);
  const lines: RawLine[] = [];
  let skipped = 0;

  if (layout === 'header') {
    const at = headerRow(rows);
    const header = rows[at];
    const dateCol = findColumn(header, /^date$/i);
    const descCol = findColumn(header, /^description$/i);
    const subCol = findColumn(header, /^sub-?description$/i);
    const typeCol = findColumn(header, /^type of transaction$/i);
    const amountCol = findColumn(header, /^amount$/i);
    const body = rows.slice(at + 1);
    const order = inferDateOrder(body.map((r) => r[dateCol] ?? ''), 'MDY');
    for (const row of body) {
      const date = parseDate(row[dateCol] ?? '', order);
      const cents = parseCents(row[amountCol] ?? '');
      const main = descCol >= 0 ? row[descCol] ?? '' : '';
      const sub = subCol >= 0 ? row[subCol] ?? '' : '';
      // The merchant usually sits in the sub-description. Keep both so
      // words like "payment" in either part are still seen.
      const description = sub && main ? `${main} ${sub}` : sub || main;
      if (!date || cents === null || !description) {
        skipped++;
        continue;
      }
      let outCents = -cents;
      if (typeCol >= 0) {
        const type = (row[typeCol] ?? '').toLowerCase();
        if (type.startsWith('debit')) outCents = Math.abs(cents);
        else if (type.startsWith('credit')) outCents = -Math.abs(cents);
      }
      lines.push({ date, description, outCents });
    }
    return { format: 'Scotia CSV', lines, skipped };
  }

  if (layout === 'card' || layout === 'bank') {
    const order = inferDateOrder(rows.map((r) => r[0] ?? ''), 'MDY');
    for (const row of rows) {
      const date = parseDate(row[0] ?? '', order);
      const cents = parseCents(layout === 'card' ? row[2] ?? '' : row[1] ?? '');
      // Chequing rows carry a type ("Bill Payment") and then the payee. The payee is the merchant.
      const description = layout === 'card' ? row[1] ?? '' : row[4] || row[3] || '';
      if (!date || cents === null || !description) {
        skipped++;
        continue;
      }
      lines.push({ date, description, outCents: -cents });
    }
    return { format: layout === 'card' ? 'Scotia card CSV' : 'Scotia chequing CSV', lines, skipped };
  }

  return { format: 'Scotia CSV', lines, skipped: rows.length };
}
