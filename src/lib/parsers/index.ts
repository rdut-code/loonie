import type { BankId, ParseResult } from '../types';
import { detectAmex, parseAmex } from './amex';
import { detectScotia, parseScotia } from './scotia';

export { readCsv } from './csv';
export { guessMapping, parseGeneric, type ColumnMapping } from './generic';

/** One small adapter per bank. To support a new bank, add an entry here. */
interface Adapter {
  bank: BankId;
  detect: (rows: string[][]) => boolean;
  parse: (rows: string[][]) => ParseResult;
}

const ADAPTERS: Adapter[] = [
  { bank: 'amex', detect: detectAmex, parse: parseAmex },
  { bank: 'scotia', detect: detectScotia, parse: parseScotia },
];

export interface Detected {
  bank: BankId;
  result: ParseResult;
}

/** Tries each bank adapter. Returns null when the file needs manual column mapping. */
export function detectAndParse(rows: string[][]): Detected | null {
  for (const adapter of ADAPTERS) {
    if (!adapter.detect(rows)) continue;
    const result = adapter.parse(rows);
    if (result.lines.length > 0) return { bank: adapter.bank, result };
  }
  return null;
}
