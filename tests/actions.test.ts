import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addStatement,
  assignMerchant,
  assignOne,
  deleteRule,
  emptyData,
  removeCategory,
  reviewQueue,
  spendingTotal,
} from '../src/lib/actions';
import { guessCategory } from '../src/lib/categories';
import { detectAndParse, readCsv } from '../src/lib/parsers';
import { applyBackup, makeBackup, readBackup } from '../src/lib/storage';
import type { Account, AppData } from '../src/lib/types';

const parsed = (name: string) =>
  detectAndParse(readCsv(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')))!.result;

const amex: Account = { id: 'a1', name: 'Amex', kind: 'card', bank: 'amex', owner: 'you' };
const visa: Account = { id: 'a2', name: 'Visa', kind: 'card', bank: 'scotia', owner: 'partner' };
const chequing: Account = { id: 'a3', name: 'Chequing', kind: 'bank', bank: 'scotia', owner: 'shared' };
const start = (): AppData => ({ ...emptyData(), setupDone: true, accounts: [amex, visa, chequing] });

describe('importing a statement', () => {
  const out = addStatement(start(), amex, parsed('amex-sample.csv'));
  const byKey = (key: string) => out.data.txns.filter((t) => t.key === key);

  it('adds every line once', () => {
    expect(out.added).toBe(10);
    expect(out.duplicates).toBe(0);
    expect(out.range).toBe('Oct 2 to Oct 26');
  });
  it('does not count a card payment as spending', () => {
    const payment = byKey('CARD PAYMENT')[0];
    expect(payment.categoryId).toBe('not-spending');
    expect(payment.status).toBe('auto');
  });
  it('files well-known names as guesses and leaves the rest unknown', () => {
    expect(byKey('TIM HORTONS').map((t) => [t.categoryId, t.status])).toEqual([
      ['dining', 'guess'],
      ['dining', 'guess'],
    ]);
    expect(byKey('NORTHSIDE PHARMACY')[0].status).toBe('unknown');
  });
  it('keeps only date, merchant, amount, account and category on a row', () => {
    expect(Object.keys(out.data.txns[0]).sort()).toEqual(
      ['accountId', 'categoryId', 'cents', 'date', 'id', 'key', 'merchant', 'status'].sort(),
    );
  });
  it('skips rows already seen when statements overlap', () => {
    const again = addStatement(out.data, amex, parsed('amex-sample.csv'));
    expect(again.added).toBe(0);
    expect(again.duplicates).toBe(10);
    expect(again.data.txns).toHaveLength(10);
  });
  it('keeps two identical purchases made on the same day', () => {
    const card = addStatement(start(), visa, parsed('scotia-card-sample.csv'));
    expect(card.data.txns.filter((t) => t.key === 'SAMPLE HARDWARE STORE')).toHaveLength(2);
  });
  it('treats the same lines on another account as separate', () => {
    const other = addStatement(out.data, { ...amex, id: 'a9' }, parsed('amex-sample.csv'));
    expect(other.added).toBe(10);
  });
  it('warns about a hole in the dates', () => {
    const lines = Array.from({ length: 8 }, (_, i) => ({
      date: `2026-10-${String(i < 4 ? i + 1 : i + 20).padStart(2, '0')}`,
      description: `SAMPLE SHOP ${'ABCDEFGH'[i]}`,
      outCents: 1000 + i,
    }));
    const holed = addStatement(start(), amex, { format: 'CSV', lines, skipped: 0 });
    expect(holed.warnings[0]).toContain('Nothing between Oct 4 and Oct 24');
  });
});

describe('bank account lines', () => {
  const out = addStatement(start(), chequing, parsed('scotia-chequing-sample.csv'));
  const cat = (key: string) => out.data.txns.find((t) => t.key === key)?.categoryId;
  it('treats a payment to a credit card as a transfer, so it is not counted twice', () => {
    expect(cat('PAYMENT TO CARD')).toBe('not-spending');
  });
  it('files deposits as money in', () => {
    expect(out.data.txns.find((t) => t.cents === -420000)?.categoryId).toBe('income');
  });
  it('leaves rent and e-transfers for the owner to confirm', () => {
    expect(out.data.txns.filter((t) => t.status === 'unknown').map((t) => t.cents).sort()).toEqual([235000, 36000, 6310].sort());
  });
});

describe('a card payment seen from both sides', () => {
  it('is left out of spending on the bank account and on the card, so it never counts twice or cancels out', () => {
    let d = addStatement(start(), chequing, {
      format: 'Photo',
      skipped: 0,
      lines: [{ date: '2026-10-23', description: 'Payment to AMERICAN EXPRESS CARDS INCL LOC PRO', outCents: 70000 }],
    }).data;
    d = addStatement(d, amex, {
      format: 'CSV',
      skipped: 0,
      lines: [
        { date: '2026-10-23', description: 'PAYMENT RECEIVED - THANK YOU', outCents: -70000 },
        { date: '2026-10-20', description: 'LOBLAWS', outCents: 5000 },
      ],
    }).data;
    expect(d.txns.filter((t) => t.categoryId === 'not-spending')).toHaveLength(2);
    expect(spendingTotal(d.monthTotals['2026-10'])).toBe(5000);
  });
});

describe('the review queue and rules', () => {
  const imported = addStatement(start(), amex, parsed('amex-sample.csv')).data;

  it('asks once per merchant, biggest first', () => {
    const queue = reviewQueue(imported);
    expect(queue[0].key).toBe('HOTEL EXAMPLE PARIS');
    const grocer = queue.find((q) => q.key === 'MAPLE LEAF GROCER')!;
    expect(grocer.count).toBe(2);
    expect(grocer.totalCents).toBe(8412 - 1200);
    expect(grocer.suggestions[0].id).toBe('groceries');
  });
  it('one answer files every line from the merchant and saves a rule', () => {
    const next = assignMerchant(imported, 'MAPLE LEAF GROCER', 'groceries', true);
    expect(next.txns.filter((t) => t.key === 'MAPLE LEAF GROCER').every((t) => t.categoryId === 'groceries')).toBe(true);
    expect(next.rules['MAPLE LEAF GROCER'].categoryId).toBe('groceries');
    expect(reviewQueue(next).some((q) => q.key === 'MAPLE LEAF GROCER')).toBe(false);
    // The refund reduces the category total.
    expect(next.monthTotals['2026-10'].groceries).toBe(7212);
  });
  it('without "remember" no rule is saved', () => {
    const next = assignMerchant(imported, 'MAPLE LEAF GROCER', 'groceries', false);
    expect(next.rules['MAPLE LEAF GROCER']).toBeUndefined();
  });
  it('a saved rule is applied to the next upload', () => {
    const learned = assignMerchant(start(), 'NORTHSIDE PHARMACY', 'health', true);
    const next = addStatement(learned, amex, parsed('amex-sample.csv')).data;
    const line = next.txns.find((t) => t.key === 'NORTHSIDE PHARMACY')!;
    expect([line.categoryId, line.status]).toEqual(['health', 'rule']);
  });
  it('changing a rule re-files past lines, except ones fixed by hand', () => {
    let d = assignMerchant(imported, 'TIM HORTONS', 'dining', true);
    const first = d.txns.find((t) => t.key === 'TIM HORTONS')!;
    d = assignOne(d, first.id, 'fun');
    d = assignMerchant(d, 'TIM HORTONS', 'groceries', true);
    const cats = d.txns.filter((t) => t.key === 'TIM HORTONS').map((t) => t.categoryId).sort();
    expect(cats).toEqual(['fun', 'groceries']);
  });
  it('forgetting a rule keeps filed lines but stops future matches', () => {
    let d = assignMerchant(imported, 'NORTHSIDE PHARMACY', 'health', true);
    d = deleteRule(d, 'NORTHSIDE PHARMACY');
    expect(d.rules['NORTHSIDE PHARMACY']).toBeUndefined();
    expect(d.txns.find((t) => t.key === 'NORTHSIDE PHARMACY')?.categoryId).toBe('health');
  });
  it('removing a category moves its lines and rules to Other', () => {
    let d = assignMerchant(imported, 'CORNER BISTRO & BAR', 'dining', true);
    d = removeCategory(d, 'dining');
    expect(d.rules['CORNER BISTRO & BAR'].categoryId).toBe('other');
    expect(d.txns.some((t) => t.categoryId === 'dining')).toBe(false);
    expect(d.monthTotals['2026-10'].dining).toBeUndefined();
  });
  it('asks about e-transfers one by one and never saves a rule for them', () => {
    const lines = [
      { date: '2026-10-03', description: 'E-TRANSFER SENT', outCents: 36000 },
      { date: '2026-10-09', description: 'E-TRANSFER SENT', outCents: 5000 },
    ];
    const d = addStatement(start(), chequing, { format: 'CSV', lines, skipped: 0 }).data;
    const queue = reviewQueue(d);
    expect(queue).toHaveLength(2);
    expect(queue.every((q) => q.single && q.count === 1)).toBe(true);
    const after = assignMerchant(d, 'E-TRANSFER SENT', 'family-support', true);
    expect(after.rules['E-TRANSFER SENT']).toBeUndefined();
  });
  it('spending total ignores transfers and money in', () => {
    expect(spendingTotal({ groceries: 5000, 'not-spending': -125000, income: -420000, fun: 1000 })).toBe(6000);
  });
});

describe('keyword guesses', () => {
  const cats = emptyData().categories;
  it('is sure about well-known names only', () => {
    expect(guessCategory('LOBLAWS', cats).sureCategoryId).toBe('groceries');
    expect(guessCategory('UBER EATS', cats).sureCategoryId).toBe('dining');
    expect(guessCategory('UBER TRIP', cats).sureCategoryId).toBe('transport');
    expect(guessCategory('CORNER BISTRO & BAR', cats).sureCategoryId).toBeNull();
  });
  it('always offers up to four choices', () => {
    expect(guessCategory('ZZZZ', cats).suggestions).toHaveLength(4);
    expect(guessCategory('CORNER BISTRO & BAR', cats).suggestions[0]).toBe('dining');
  });
});

describe('backup file', () => {
  it('holds rules and settings but never transactions or totals', () => {
    let d = addStatement(start(), amex, parsed('amex-sample.csv')).data;
    d = assignMerchant(d, 'NORTHSIDE PHARMACY', 'health', true);
    const text = JSON.stringify(makeBackup(d, '2026-11-10'));
    expect(text).not.toContain('txns');
    expect(text).not.toContain('monthTotals');
    expect(text).not.toContain('4618');
    const restored = applyBackup(emptyData(), readBackup(text));
    expect(restored.rules['NORTHSIDE PHARMACY'].categoryId).toBe('health');
    expect(restored.accounts).toHaveLength(3);
    expect(restored.setupDone).toBe(true);
  });
  it('rejects files that are not a backup', () => {
    expect(() => readBackup('not json')).toThrow();
    expect(() => readBackup('{"app":"other"}')).toThrow();
  });
});
