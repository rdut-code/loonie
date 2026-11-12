import { describe, expect, it } from 'vitest';
import { formatCents, formatDollars, inferDateOrder, parseCents, parseDate } from '../src/lib/money';

describe('parseCents', () => {
  it('reads plain and formatted amounts', () => {
    expect(parseCents('46.18')).toBe(4618);
    expect(parseCents('$1,234.56')).toBe(123456);
    expect(parseCents('12')).toBe(1200);
    expect(parseCents('12.5')).toBe(1250);
    expect(parseCents('.99')).toBe(99);
  });
  it('reads every way a bank writes a negative', () => {
    expect(parseCents('-46.18')).toBe(-4618);
    expect(parseCents('-$1,250.00')).toBe(-125000);
    expect(parseCents('(46.18)')).toBe(-4618);
    expect(parseCents('46.18 CR')).toBe(-4618);
    expect(parseCents('46.18-')).toBe(-4618);
  });
  it('avoids floating point drift', () => {
    expect(parseCents('0.29')).toBe(29);
    expect(parseCents('1.15')).toBe(115);
    expect(parseCents('19.99')).toBe(1999);
  });
  it('rejects text that is not an amount', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('TIM HORTONS')).toBeNull();
    expect(parseCents('-')).toBeNull();
    expect(parseCents('12.345')).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads ISO style dates', () => {
    expect(parseDate('2026-10-03')).toBe('2026-10-03');
    expect(parseDate('2026/10/03')).toBe('2026-10-03');
    expect(parseDate('20261003')).toBe('2026-10-03');
  });
  it('reads named months', () => {
    expect(parseDate('03 Oct 2026')).toBe('2026-10-03');
    expect(parseDate('3 Oct. 2026')).toBe('2026-10-03');
    expect(parseDate('Oct 3, 2026')).toBe('2026-10-03');
    expect(parseDate('3-Oct-26')).toBe('2026-10-03');
  });
  it('uses the given order for all-number dates', () => {
    expect(parseDate('10/03/2026', 'MDY')).toBe('2026-10-03');
    expect(parseDate('10/03/2026', 'DMY')).toBe('2026-03-10');
  });
  it('rejects impossible dates', () => {
    expect(parseDate('31/02/2026', 'DMY')).toBeNull();
    expect(parseDate('13/13/2026', 'MDY')).toBeNull();
    expect(parseDate('hello')).toBeNull();
  });
});

describe('inferDateOrder', () => {
  it('is settled by a number above 12', () => {
    expect(inferDateOrder(['10/03/2026', '10/21/2026'], 'DMY')).toBe('MDY');
    expect(inferDateOrder(['03/10/2026', '21/10/2026'], 'MDY')).toBe('DMY');
  });
  it('otherwise picks the order with the tighter range', () => {
    // Month first: Oct 2 to Oct 9. Day first: Feb 10 to Sep 10.
    expect(inferDateOrder(['10/02/2026', '10/05/2026', '10/09/2026'], 'DMY')).toBe('MDY');
  });
  it('falls back when there is no evidence', () => {
    expect(inferDateOrder(['05/05/2026'], 'DMY')).toBe('DMY');
  });
});

describe('formatting', () => {
  it('shows cents on transactions and none on summaries', () => {
    expect(formatCents(4618)).toBe('$46.18');
    expect(formatDollars(241530)).toBe('$2,415');
    expect(formatDollars(123456)).toBe('$1,235');
  });
});
