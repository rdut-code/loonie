// The numbers behind the Home screen: one month, summed up by category.

import { INCOME, type AppData, type Category, type Owner } from './types';

export type PersonFilter = 'all' | Exclude<Owner, 'shared'>;

/** Category totals for a month. For one person, only lines from the accounts they own are counted. */
export function totalsFor(data: AppData, month: string, who: PersonFilter): Record<string, number> {
  if (who === 'all') return data.monthTotals[month] ?? {};
  const theirs = new Set(data.accounts.filter((a) => a.owner === who).map((a) => a.id));
  const totals: Record<string, number> = {};
  for (const t of data.txns) {
    if (!t.categoryId || !t.date.startsWith(month) || !theirs.has(t.accountId)) continue;
    totals[t.categoryId] = (totals[t.categoryId] ?? 0) + t.cents;
  }
  return totals;
}

/**
 * What a category usually comes to: the average of its last few months
 * (up to three) in which it had any spending at all.
 *
 * Months where the category is empty are left out. An empty month nearly
 * always means that account's statement was not uploaded for that month,
 * and counting it as zero would halve the "usual" for something like rent.
 */
export function usualFor(
  data: AppData,
  month: string,
  categoryId: string,
  who: PersonFilter = 'all',
): { cents: number; months: string[] } | null {
  const used: string[] = [];
  let sum = 0;
  for (const m of earlierMonths(data, month, 12)) {
    const cents = totalsFor(data, m, who)[categoryId] ?? 0;
    if (cents <= 0) continue;
    used.push(m);
    sum += cents;
    if (used.length === 3) break;
  }
  return used.length ? { cents: Math.round(sum / used.length), months: used } : null;
}

/** Up to three earlier months that have data, newest first. */
export function earlierMonths(data: AppData, month: string, limit = 3): string[] {
  return Object.keys(data.monthTotals)
    .filter((m) => m < month)
    .sort()
    .reverse()
    .slice(0, limit);
}

export interface CategoryLine {
  category: Category;
  cents: number;
  lines: number;
  /** What this category usually comes to (see usualFor), or null when there is nothing to compare with. */
  usual: number | null;
}

export interface MonthSummary {
  month: string;
  /** Real spending: everything except transfers, card payments and money in. */
  spent: number;
  fixed: number;
  everyday: number;
  /** Deposits into bank accounts, as a positive number. */
  moneyIn: number;
  categories: CategoryLine[];
  /** False when only totals were kept for this month. */
  hasRows: boolean;
  waiting: { lines: number; cents: number };
}

export function monthSummary(data: AppData, month: string, who: PersonFilter): MonthSummary {
  const totals = totalsFor(data, month, who);
  const theirs = who === 'all' ? null : new Set(data.accounts.filter((a) => a.owner === who).map((a) => a.id));
  const rows = data.txns.filter((t) => t.date.startsWith(month) && (!theirs || theirs.has(t.accountId)));

  const categories: CategoryLine[] = [];
  let fixed = 0;
  let everyday = 0;
  for (const category of data.categories) {
    if (category.group === 'system') continue;
    const cents = totals[category.id] ?? 0;
    const lines = rows.filter((t) => t.categoryId === category.id).length;
    if (category.group === 'fixed') fixed += cents;
    else everyday += cents;
    const usual = usualFor(data, month, category.id, who)?.cents ?? null;
    if (cents !== 0 || lines > 0 || (usual ?? 0) > 0) categories.push({ category, cents, lines, usual });
  }

  const waiting = rows.filter((t) => t.status === 'unknown');
  return {
    month,
    spent: fixed + everyday,
    fixed,
    everyday,
    moneyIn: Math.max(0, -(totals[INCOME] ?? 0)),
    categories,
    hasRows: data.txns.some((t) => t.date.startsWith(month)),
    waiting: { lines: waiting.length, cents: waiting.reduce((sum, t) => sum + t.cents, 0) },
  };
}

/**
 * How a category compares with its usual amount. Small wobbles are "usual":
 * a change has to be at least $25 and 15% to be called up or down.
 */
export function trendOf(line: CategoryLine): { kind: 'up' | 'down' | 'usual'; byCents: number } | null {
  if (line.usual === null) return null;
  const diff = line.cents - line.usual;
  const threshold = Math.max(2500, Math.round(line.usual * 0.15));
  if (diff >= threshold) return { kind: 'up', byCents: diff };
  if (diff <= -threshold) return { kind: 'down', byCents: -diff };
  return { kind: 'usual', byCents: 0 };
}

