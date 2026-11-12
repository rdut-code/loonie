import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addStatement, assignMerchant, emptyData, reviewQueue } from '../src/lib/actions';
import { applyRestored, packBackup, toFullBackup, unpackBackup } from '../src/lib/backup';
import { checksFor, dismissCheck } from '../src/lib/checks';
import { monthSummary } from '../src/lib/summary';
import { detectAndParse, readCsv } from '../src/lib/parsers';
import { makeBackup } from '../src/lib/storage';
import type { Account, AppData, RawLine } from '../src/lib/types';

// All data here is invented.
const amex: Account = { id: 'a1', name: 'Amex', kind: 'card', bank: 'amex', owner: 'you' };
const chequing: Account = { id: 'a3', name: 'Chequing', kind: 'bank', bank: 'scotia', owner: 'shared' };
const fixture = (name: string) =>
  detectAndParse(readCsv(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')))!.result;

function sample(): AppData {
  let d: AppData = { ...emptyData(), setupDone: true, people: { you: 'Sam', partner: 'Alex' }, accounts: [amex, chequing] };
  d = addStatement(d, amex, fixture('amex-sample.csv')).data;
  d = addStatement(d, chequing, fixture('scotia-chequing-sample.csv')).data;
  d = assignMerchant(d, 'NORTHSIDE PHARMACY', 'health', true);
  d = assignMerchant(d, 'MAPLE LEAF GROCER', 'groceries', true);
  d = dismissCheck(d, 'jump:dining:2026-10');
  return { ...d, theme: 'dark' };
}

/** Everything that matters about the data, ignoring row ids (they are renewed on restore). */
const essence = (d: AppData) => ({
  ...d,
  lastBackupOn: null,
  txns: d.txns.map(({ id: _id, ...rest }) => rest),
});

describe('full backup', () => {
  it('restores every detail on a clean browser', async () => {
    const before = sample();
    const bytes = await packBackup(before, '2026-11-11');
    const restored = await unpackBackup(bytes);
    expect(restored.kind).toBe('full');
    const after = applyRestored(emptyData(), restored);

    expect(essence(after)).toEqual(essence(before));
    // And the app behaves the same on top of it.
    expect(monthSummary(after, '2026-10', 'all')).toEqual(monthSummary(before, '2026-10', 'all'));
    expect(reviewQueue(after).map((q) => q.key)).toEqual(reviewQueue(before).map((q) => q.key));
    expect(checksFor(after, '2026-10')).toEqual(checksFor(before, '2026-10'));
  });

  it('skips rows already present when the same statement is uploaded after a restore', async () => {
    const restored = await unpackBackup(await packBackup(sample(), '2026-11-11'));
    const after = applyRestored(emptyData(), restored);
    const again = addStatement(after, amex, fixture('amex-sample.csv'));
    expect(again.added).toBe(0);
  });

  it('is compressed and far smaller than the data it holds', async () => {
    // Two years of busy months: 4,800 lines across 60 merchants.
    let d: AppData = { ...emptyData(), setupDone: true, accounts: [amex] };
    const lines: RawLine[] = [];
    for (let m = 0; m < 24; m++) {
      const month = `${2025 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
      for (let i = 0; i < 200; i++) {
        lines.push({
          date: `${month}-${String((i % 28) + 1).padStart(2, '0')}`,
          description: `SAMPLE MERCHANT NUMBER ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i % 26]}${i % 60 < 26 ? '' : 'X'} TORONTO ON`,
          outCents: 500 + ((i * 7919 + m * 104729) % 20000),
        });
      }
    }
    d = addStatement(d, amex, { format: 'CSV', lines, skipped: 0 }).data;
    expect(d.txns).toHaveLength(4800);
    const bytes = await packBackup(d, '2026-11-11');
    const raw = JSON.stringify(d).length;
    expect(bytes[0]).toBe(0x1f);
    expect(bytes.length).toBeLessThan(60_000);
    expect(bytes.length).toBeLessThan(raw / 15);
    const back = applyRestored(emptyData(), await unpackBackup(bytes));
    expect(back.txns).toHaveLength(4800);
    expect(back.monthTotals).toEqual(d.monthTotals);
  });

  it('refuses a damaged file and leaves the device as it was', async () => {
    const good = toFullBackup(sample(), '2026-11-11');
    const tampered = { ...good, rows: [...good.rows] };
    tampered.rows[2] += 1; // one amount changed by a cent
    const bytes = new TextEncoder().encode(JSON.stringify(tampered));
    await expect(unpackBackup(bytes)).rejects.toThrow(/damaged/);

    const cut = (await packBackup(sample(), '2026-11-11')).slice(0, 80);
    await expect(unpackBackup(cut)).rejects.toThrow();
    await expect(unpackBackup(new TextEncoder().encode('hello'))).rejects.toThrow(/isn't a Loonie backup/);
    await expect(unpackBackup(new TextEncoder().encode('{"app":"other"}'))).rejects.toThrow(/isn't a Loonie backup/);
  });

  it('still reads the older rules-only file, and keeps existing rows when applying it', async () => {
    const d = sample();
    const old = new TextEncoder().encode(JSON.stringify(makeBackup(d, '2026-11-11')));
    const restored = await unpackBackup(old);
    expect(restored.kind).toBe('rules');
    const after = applyRestored(d, restored);
    expect(after.txns).toHaveLength(d.txns.length);
  });

  it('never stores card or account numbers, because the app never had them', async () => {
    const b = toFullBackup(sample(), '2026-11-11');
    const names = JSON.stringify([b.keys, b.accounts.map((a) => a.name), b.rules]);
    expect(/\d{6,}/.test(names)).toBe(false);
  });
});
