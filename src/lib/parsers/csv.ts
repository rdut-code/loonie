import Papa from 'papaparse';

/** Splits CSV text into rows of trimmed cells. Empty rows are dropped. */
export function readCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const result = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' });
  return result.data
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some((cell) => cell !== ''));
}

/** Finds a column by header name. Returns -1 when missing. */
export function findColumn(header: string[], pattern: RegExp): number {
  return header.findIndex((cell) => pattern.test(cell.trim()));
}
