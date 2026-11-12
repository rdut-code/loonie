import { inferDateOrder, parseCents, parseDate, type DateOrder } from '../money';
import type { ParseResult, RawLine } from '../types';

/** The manual fallback: the owner says which column is which. */
export interface ColumnMapping {
  hasHeader: boolean;
  dateCol: number;
  descCol: number;
  /** Single amount column, or -1 when the file has separate debit and credit columns. */
  amountCol: number;
  debitCol: number;
  creditCol: number;
  /** True when a positive number in the amount column means money out. */
  positiveIsSpending: boolean;
  dateOrder: DateOrder | 'auto';
}

/** A first guess at the mapping, from header names or cell contents. */
export function guessMapping(rows: string[][]): ColumnMapping {
  const first = rows[0] ?? [];
  const firstLooksLikeData = first.some((c) => parseDate(c, 'MDY') || parseDate(c, 'DMY'));
  const hasHeader = !firstLooksLikeData;
  const find = (pattern: RegExp) => (hasHeader ? first.findIndex((c) => pattern.test(c)) : -1);
  const sample = rows[hasHeader ? 1 : 0] ?? [];

  let dateCol = find(/date/i);
  if (dateCol < 0) dateCol = sample.findIndex((c) => parseDate(c, 'MDY') || parseDate(c, 'DMY'));
  let descCol = find(/desc|merchant|payee|details|name/i);
  if (descCol < 0) {
    descCol = sample.findIndex((c, i) => i !== dateCol && parseCents(c) === null && c.length > 2);
  }
  const debitCol = find(/debit|withdraw/i);
  const creditCol = find(/credit|deposit/i);
  let amountCol = find(/^amount|amount$/i);
  if (amountCol < 0 && debitCol < 0) {
    amountCol = sample.findIndex((c, i) => i !== dateCol && i !== descCol && parseCents(c) !== null);
  }
  if (debitCol >= 0 && creditCol >= 0) amountCol = -1;

  return {
    hasHeader,
    dateCol: Math.max(0, dateCol),
    descCol: Math.max(0, descCol),
    amountCol,
    debitCol,
    creditCol,
    positiveIsSpending: true,
    dateOrder: 'auto',
  };
}

export function parseGeneric(rows: string[][], map: ColumnMapping): ParseResult {
  const body = map.hasHeader ? rows.slice(1) : rows;
  const order =
    map.dateOrder === 'auto' ? inferDateOrder(body.map((r) => r[map.dateCol] ?? ''), 'MDY') : map.dateOrder;
  const lines: RawLine[] = [];
  let skipped = 0;
  for (const row of body) {
    const date = parseDate(row[map.dateCol] ?? '', order);
    const description = row[map.descCol] ?? '';
    let outCents: number | null = null;
    if (map.amountCol >= 0) {
      const cents = parseCents(row[map.amountCol] ?? '');
      if (cents !== null) outCents = map.positiveIsSpending ? cents : -cents;
    } else {
      const debit = parseCents(row[map.debitCol] ?? '');
      const credit = parseCents(row[map.creditCol] ?? '');
      if (debit !== null && debit !== 0) outCents = Math.abs(debit);
      else if (credit !== null && credit !== 0) outCents = -Math.abs(credit);
    }
    if (!date || !description || outCents === null) {
      skipped++;
      continue;
    }
    lines.push({ date, description, outCents });
  }
  return { format: 'CSV', lines, skipped };
}
