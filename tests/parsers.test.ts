import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectAndParse, guessMapping, parseGeneric, readCsv } from '../src/lib/parsers';

// All fixtures are invented. No real statement data lives in this repository.
const fixture = (name: string) => readCsv(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('Amex adapter', () => {
  const found = detectAndParse(fixture('amex-sample.csv'));
  it('recognises the file', () => {
    expect(found?.bank).toBe('amex');
    expect(found?.result.lines).toHaveLength(10);
    expect(found?.result.skipped).toBe(0);
  });
  it('reads charges as money out', () => {
    expect(found?.result.lines[0]).toEqual({
      date: '2026-10-02',
      description: 'MAPLE LEAF GROCER #204   TORONTO ON',
      outCents: 8412,
    });
  });
  it('reads payments and refunds as negative', () => {
    const payment = found?.result.lines.find((l) => l.description.startsWith('PAYMENT'));
    expect(payment?.outCents).toBe(-125000);
    expect(found?.result.lines[9].outCents).toBe(-1200);
  });
  it('uses the CAD amount on foreign currency lines', () => {
    const hotel = found?.result.lines.find((l) => l.description.startsWith('HOTEL'));
    expect(hotel?.outCents).toBe(31055);
  });
  it('finds the header under title rows', () => {
    const rows = [['Transaction Details'], ['Prepared for a sample person'], ...fixture('amex-sample.csv')];
    expect(detectAndParse(rows)?.result.lines).toHaveLength(10);
  });
  it('never reads an account number column', () => {
    const rows = [
      ['Date', 'Description', 'Card Member', 'Account #', 'Amount'],
      ['10/02/2026', 'SAMPLE SHOP', 'SAMPLE PERSON', '-99999', '10.00'],
      ['10/20/2026', 'SAMPLE SHOP', 'SAMPLE PERSON', '-99999', '5.00'],
    ];
    const lines = detectAndParse(rows)?.result.lines ?? [];
    expect(lines).toHaveLength(2);
    expect(JSON.stringify(lines)).not.toContain('99999');
    expect(lines[1].date).toBe('2026-10-20');
  });
});

describe('Scotia adapter', () => {
  it('reads the headerless card layout, purchases negative in the file', () => {
    const found = detectAndParse(fixture('scotia-card-sample.csv'));
    expect(found?.bank).toBe('scotia');
    expect(found?.result.format).toBe('Scotia card CSV');
    expect(found?.result.lines[0]).toEqual({
      date: '2026-10-02',
      description: 'NETFLIX.COM              TORONTO ON',
      outCents: 2099,
    });
    expect(found?.result.lines[3].outCents).toBe(-50000);
  });
  it('reads the headerless chequing layout', () => {
    const found = detectAndParse(fixture('scotia-chequing-sample.csv'));
    expect(found?.result.format).toBe('Scotia chequing CSV');
    expect(found?.result.lines).toHaveLength(5);
    expect(found?.result.lines[1]).toEqual({ date: '2026-10-05', description: 'AMEX', outCents: 125000 });
    expect(found?.result.lines[3].outCents).toBe(-420000);
  });
  it('reads the newer layout with a header and debit or credit types', () => {
    const found = detectAndParse(fixture('scotia-header-sample.csv'));
    expect(found?.bank).toBe('scotia');
    expect(found?.result.lines[0].outCents).toBe(1250);
    expect(found?.result.lines[1].outCents).toBe(-420000);
  });
});

describe('unknown layouts', () => {
  const rows = fixture('unknown-bank-sample.csv');
  it('are not claimed by a bank adapter', () => {
    expect(detectAndParse(rows)).toBeNull();
  });
  it('can be read with a guessed column mapping', () => {
    const mapping = guessMapping(rows);
    expect(mapping).toMatchObject({ hasHeader: true, dateCol: 0, descCol: 1, amountCol: -1, debitCol: 2, creditCol: 3 });
    const parsed = parseGeneric(rows, mapping);
    expect(parsed.lines).toEqual([
      { date: '2026-10-03', description: 'SAMPLE BOOKSHOP', outCents: 2499 },
      { date: '2026-10-08', description: 'SAMPLE REFUND', outCents: -1000 },
    ]);
  });
  it('respects the sign choice on a single amount column', () => {
    const simple = [['2026-10-03', 'SAMPLE SHOP', '-10.00']];
    const mapping = { ...guessMapping(simple), positiveIsSpending: false };
    expect(parseGeneric(simple, mapping).lines[0].outCents).toBe(1000);
  });
});
