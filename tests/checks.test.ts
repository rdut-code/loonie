import { describe, expect, it } from 'vitest';
import { addStatement, assignMerchant, emptyData } from '../src/lib/actions';
import { checksFor, dismissCheck } from '../src/lib/checks';
import { monthSummary, trendOf, usualFor } from '../src/lib/summary';
import type { Account, AppData, RawLine } from '../src/lib/types';

// All merchants and amounts are invented.
const mine: Account = { id: 'a1', name: 'Card A', kind: 'card', bank: 'other', owner: 'you' };
const theirs: Account = { id: 'a2', name: 'Card B', kind: 'card', bank: 'other', owner: 'partner' };
const bank: Account = { id: 'a3', name: 'Chequing', kind: 'bank', bank: 'other', owner: 'shared' };

const line = (date: string, description: string, dollars: number): RawLine => ({
  date, description, outCents: Math.round(dollars * 100),
});

function build(steps: [Account, RawLine[]][], rules: Record<string, string> = {}): AppData {
  let d: AppData = { ...emptyData(), setupDone: true, accounts: [mine, theirs, bank] };
  for (const [key, categoryId] of Object.entries(rules)) d = assignMerchant(d, key, categoryId, true);
  for (const [account, lines] of steps) d = addStatement(d, account, { format: 'CSV', lines, skipped: 0 }).data;
  return d;
}

const RULES = {
  'SAMPLE INSURANCE CO': 'car-insurance',
  'SAMPLE BISTRO': 'dining',
  'SAMPLE STREAMING': 'subscriptions',
  'SAMPLE GYM': 'subscriptions',
  'SAMPLE GARAGE': 'transport',
};

describe('monthly summary', () => {
  const d = build(
    [
      [mine, [line('2026-10-03', 'LOBLAWS', 100), line('2026-10-05', 'SAMPLE INSURANCE CO', 210), line('2026-10-09', 'SAMPLE MYSTERY', 40)]],
      [theirs, [line('2026-10-04', 'LOBLAWS', 60), line('2026-10-10', 'PAYMENT - THANK YOU', -500)]],
      [bank, [line('2026-10-15', 'SAMPLE EMPLOYER', -4000), line('2026-10-12', 'PAYMENT TO VISA', 500)]],
    ],
    RULES,
  );
  const all = monthSummary(d, '2026-10', 'all');

  it('adds up spending and splits fixed from everyday', () => {
    expect(all.spent).toBe(37000);
    expect(all.fixed).toBe(21000);
    expect(all.everyday).toBe(16000);
  });
  it('reports money in, and leaves card payments out of spending on both sides', () => {
    expect(all.moneyIn).toBe(400000);
  });
  it('lists only categories that have something in them', () => {
    expect(all.categories.map((c) => [c.category.id, c.cents, c.lines])).toEqual([
      ['car-insurance', 21000, 1],
      ['groceries', 16000, 2],
    ]);
  });
  it('counts lines still waiting for an answer separately', () => {
    expect(all.waiting).toEqual({ lines: 1, cents: 4000 });
  });
  it('filters by who owns the account, with shared accounts in Household only', () => {
    expect(monthSummary(d, '2026-10', 'you').spent).toBe(31000);
    expect(monthSummary(d, '2026-10', 'partner').spent).toBe(6000);
    expect(monthSummary(d, '2026-10', 'partner').moneyIn).toBe(0);
  });
  it('has no "usual" to compare with in the first month', () => {
    expect(all.categories.every((c) => c.usual === null)).toBe(true);
    expect(trendOf(all.categories[0])).toBeNull();
  });
  it('compares with the average of earlier months once there are some', () => {
    const two = build(
      [
        [mine, [line('2026-09-03', 'LOBLAWS', 200), line('2026-10-03', 'LOBLAWS', 300), line('2026-10-04', 'SAMPLE BISTRO', 20)]],
      ],
      RULES,
    );
    const s = monthSummary(two, '2026-10', 'all');
    const groceries = s.categories.find((c) => c.category.id === 'groceries')!;
    expect(groceries.usual).toBe(20000);
    expect(trendOf(groceries)).toEqual({ kind: 'up', byCents: 10000 });
    const sept = monthSummary(two, '2026-09', 'all');
    expect(sept.categories.find((c) => c.category.id === 'groceries')!.usual).toBeNull();
  });
  it('leaves empty months out of "usually", so a missing statement does not halve the rent', () => {
    // September has card spending but no chequing statement, so no rent was seen that month.
    const d = build(
      [
        [mine, [line('2026-09-03', 'LOBLAWS', 200)]],
        [bank, [line('2026-10-01', 'SAMPLE LANDLORD', 2302), line('2026-11-01', 'SAMPLE LANDLORD', 2302)]],
        [mine, [line('2026-10-03', 'LOBLAWS', 220), line('2026-11-03', 'LOBLAWS', 210)]],
      ],
      { ...RULES, 'SAMPLE LANDLORD': 'rent' },
    );
    const nov = monthSummary(d, '2026-11', 'all');
    const rent = nov.categories.find((c) => c.category.id === 'rent')!;
    expect(rent.usual).toBe(230200);
    expect(trendOf(rent)?.kind).toBe('usual');
    // Groceries appeared in both earlier months, so both count.
    expect(nov.categories.find((c) => c.category.id === 'groceries')!.usual).toBe(21000);
    expect(usualFor(d, '2026-11', 'rent')).toEqual({ cents: 230200, months: ['2026-10'] });
    expect(usualFor(d, '2026-11', 'travel')).toBeNull();
  });
  it('uses the last three months that had spending, not just the last three months', () => {
    const d = build(
      [[mine, [
        line('2026-06-10', 'SAMPLE BISTRO', 100), line('2026-07-10', 'SAMPLE BISTRO', 200),
        line('2026-08-10', 'LOBLAWS', 50), line('2026-09-10', 'SAMPLE BISTRO', 300),
        line('2026-10-10', 'SAMPLE BISTRO', 400), line('2026-11-10', 'SAMPLE BISTRO', 10),
      ]]],
      RULES,
    );
    expect(usualFor(d, '2026-11', 'dining')).toEqual({ cents: 30000, months: ['2026-10', '2026-09', '2026-07'] });
  });
  it('calls small wobbles usual', () => {
    const cat = emptyData().categories[0];
    expect(trendOf({ category: cat, cents: 21000, lines: 1, usual: 20000 })?.kind).toBe('usual');
    expect(trendOf({ category: cat, cents: 15000, lines: 1, usual: 20000 })).toEqual({ kind: 'down', byCents: 5000 });
  });
});

describe('checks', () => {
  it('flags the same merchant and amount within a few days on one account', () => {
    const d = build([[mine, [line('2026-10-03', 'SAMPLE GARAGE', 214.9), line('2026-10-05', 'SAMPLE GARAGE', 214.9)]]], RULES);
    const checks = checksFor(d, '2026-10');
    expect(checks).toHaveLength(1);
    expect(checks[0].kind).toBe('duplicate');
    expect(checks[0].title).toBe('Sample Garage charged $214.90 twice');
    expect(checks[0].detail).toContain('Oct 3 and Oct 5');
  });
  it('does not flag small repeats, far-apart repeats, or the same charge on two cards', () => {
    const d = build(
      [
        [mine, [
          line('2026-10-03', 'TIM HORTONS', 4.1), line('2026-10-03', 'TIM HORTONS', 4.1),
          line('2026-10-02', 'SAMPLE GARAGE', 80), line('2026-10-20', 'SAMPLE GARAGE', 80),
          line('2026-10-06', 'SAMPLE BISTRO', 55),
        ]],
        [theirs, [line('2026-10-06', 'SAMPLE BISTRO', 55)]],
      ],
      RULES,
    );
    expect(checksFor(d, '2026-10')).toEqual([]);
  });
  it('flags a steady monthly charge that changed, like insurance going up', () => {
    const d = build(
      [[mine, [
        line('2026-08-05', 'SAMPLE INSURANCE CO', 210), line('2026-09-05', 'SAMPLE INSURANCE CO', 210),
        line('2026-10-05', 'SAMPLE INSURANCE CO', 269),
      ]]],
      RULES,
    );
    const changed = checksFor(d, '2026-10').filter((c) => c.kind === 'changed');
    expect(changed).toHaveLength(1);
    expect(changed[0].title).toBe('Sample Insurance Co went up by $59.00');
    // The category rose only because of that bill, so it is not reported a second time.
    expect(checksFor(d, '2026-10').filter((c) => c.kind === 'jump')).toEqual([]);
    expect(checksFor(d, '2026-09').filter((c) => c.kind === 'changed')).toEqual([]);
  });
  it('needs two steady earlier months before calling a charge changed', () => {
    const d = build(
      [[mine, [line('2026-09-05', 'SAMPLE INSURANCE CO', 210), line('2026-10-05', 'SAMPLE INSURANCE CO', 269)]]],
      RULES,
    );
    expect(checksFor(d, '2026-10').filter((c) => c.kind === 'changed')).toEqual([]);
  });
  it('flags a category well above its usual, and says against what', () => {
    const d = build(
      [[mine, [
        line('2026-08-10', 'SAMPLE BISTRO', 250), line('2026-09-10', 'SAMPLE BISTRO', 270),
        line('2026-10-10', 'SAMPLE BISTRO', 200), line('2026-10-20', 'SAMPLE BISTRO', 140),
      ]]],
      RULES,
    );
    const jumps = checksFor(d, '2026-10').filter((c) => c.kind === 'jump');
    expect(jumps).toHaveLength(1);
    expect(jumps[0].title).toBe('Dining out ran $80 higher');
    expect(jumps[0].detail).toBe('$340 this month against your usual $260.');
  });
  it('flags a new merchant in a category where charges repeat, but not in the first month', () => {
    const d = build(
      [[mine, [line('2026-09-02', 'SAMPLE STREAMING', 20.99), line('2026-10-02', 'SAMPLE STREAMING', 20.99), line('2026-10-11', 'SAMPLE GYM', 45)]]],
      RULES,
    );
    const fresh = checksFor(d, '2026-10').filter((c) => c.kind === 'new');
    expect(fresh.map((c) => c.title)).toEqual(['Sample Gym is new']);
    expect(checksFor(d, '2026-09')).toEqual([]);
  });
  it('stays hidden once waved through, and lists changed charges first', () => {
    let d = build(
      [[mine, [
        line('2026-08-05', 'SAMPLE INSURANCE CO', 210), line('2026-09-05', 'SAMPLE INSURANCE CO', 210),
        line('2026-10-05', 'SAMPLE INSURANCE CO', 269),
        line('2026-10-03', 'SAMPLE GARAGE', 90), line('2026-10-03', 'SAMPLE GARAGE', 90),
      ]]],
      RULES,
    );
    const before = checksFor(d, '2026-10');
    expect(before.map((c) => c.kind).slice(0, 2)).toEqual(['changed', 'duplicate']);
    d = dismissCheck(d, before[0].id);
    expect(checksFor(d, '2026-10').some((c) => c.id === before[0].id)).toBe(false);
  });
});
