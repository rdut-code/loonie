// The short "worth a look" list at the top of the monthly summary.
// Everything here is plain arithmetic on rows already in this browser.

import { daysBetween, formatCents, formatDollars, monthName, shortDate } from './money';
import { isGenericKey } from './normalize';
import { earlierMonths, usualFor } from './summary';
import { INCOME, NOT_SPENDING, type AppData, type Txn } from './types';

export type CheckKind = 'changed' | 'duplicate' | 'jump' | 'new';

export interface Check {
  /** Stable, so "Got it" can hide this exact check for good. */
  id: string;
  kind: CheckKind;
  title: string;
  detail: string;
  /** The category this is about, and by how much it moved. Used to avoid saying the same thing twice. */
  categoryId?: string;
  diffCents?: number;
}

const DUPLICATE_WINDOW_DAYS = 3;
const DUPLICATE_MIN_CENTS = 1000;
// Categories where a brand-new merchant usually means a new standing charge.
const STANDING_CATEGORIES = new Set(['subscriptions', 'phone-internet', 'car-insurance', 'car-loan', 'rent', 'daycare']);

function isSpending(t: Txn): boolean {
  return t.cents > 0 && t.categoryId !== NOT_SPENDING && t.categoryId !== INCOME;
}

/** Same merchant, same amount, same account, within a few days. */
function duplicates(rows: Txn[]): Check[] {
  const checks: Check[] = [];
  const groups = new Map<string, Txn[]>();
  for (const t of rows) {
    if (!isSpending(t) || t.cents < DUPLICATE_MIN_CENTS) continue;
    const group = `${t.accountId}|${t.key}|${t.cents}`;
    const list = groups.get(group);
    if (list) list.push(t);
    else groups.set(group, [t]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (daysBetween(a.date, b.date) > DUPLICATE_WINDOW_DAYS) continue;
      const when = a.date === b.date ? `twice on ${shortDate(a.date)}` : `on ${shortDate(a.date)} and ${shortDate(b.date)}`;
      checks.push({
        id: `duplicate:${a.accountId}|${a.key}|${a.cents}|${a.date}|${b.date}`,
        kind: 'duplicate',
        title: `${a.merchant} charged ${formatCents(a.cents)} twice`,
        detail: `Same amount ${when}. Fine if you went twice, worth a call if you didn't.`,
      });
    }
  }
  return checks;
}

/** One charge per merchant per month, for merchants that are not one-offs. */
function monthlyCharges(data: AppData, month: string): Map<string, Txn> {
  const seen = new Map<string, Txn | null>();
  for (const t of data.txns) {
    if (!t.date.startsWith(month) || !isSpending(t) || isGenericKey(t.key)) continue;
    // More than one charge in the month means it is not a simple standing charge.
    seen.set(t.key, seen.has(t.key) ? null : t);
  }
  const single = new Map<string, Txn>();
  for (const [key, t] of seen) if (t) single.set(key, t);
  return single;
}

/**
 * A standing charge whose amount moved: the same single charge in each of
 * the last two months at a steady amount, and a different amount now.
 */
function changedRecurring(data: AppData, month: string, earlier: string[]): Check[] {
  if (earlier.length < 2) return [];
  const now = monthlyCharges(data, month);
  const last = monthlyCharges(data, earlier[0]);
  const before = monthlyCharges(data, earlier[1]);
  const checks: Check[] = [];
  for (const [key, t] of now) {
    const a = last.get(key);
    const b = before.get(key);
    if (!a || !b || Math.abs(a.cents - b.cents) > 50) continue;
    const diff = t.cents - a.cents;
    if (Math.abs(diff) < Math.max(100, Math.round(a.cents * 0.02))) continue;
    checks.push({
      id: `changed:${key}:${month}`,
      kind: 'changed',
      title: `${t.merchant} went ${diff > 0 ? 'up' : 'down'} by ${formatCents(Math.abs(diff))}`,
      detail: `It was ${formatCents(a.cents)} the last two months and ${formatCents(t.cents)} this time.`,
      categoryId: t.categoryId ?? undefined,
      diffCents: diff,
    });
  }
  return checks;
}

/** A merchant never seen before, in a category where charges tend to repeat. */
function newStanding(data: AppData, month: string, earlier: string[]): Check[] {
  if (earlier.length === 0) return [];
  const known = new Set(data.txns.filter((t) => t.date.slice(0, 7) < month).map((t) => t.key));
  // Without any earlier rows on this device there is nothing to compare with.
  if (known.size === 0) return [];
  const checks: Check[] = [];
  const done = new Set<string>();
  for (const t of data.txns) {
    if (!t.date.startsWith(month) || !isSpending(t) || !t.categoryId) continue;
    if (!STANDING_CATEGORIES.has(t.categoryId) || known.has(t.key) || done.has(t.key) || isGenericKey(t.key)) continue;
    done.add(t.key);
    checks.push({
      id: `new:${t.key}:${month}`,
      kind: 'new',
      title: `${t.merchant} is new`,
      detail: `${formatCents(t.cents)} on ${shortDate(t.date)}. First time I've seen it, and charges like this tend to repeat.`,
    });
  }
  return checks;
}

/** A category well above its usual: at least $50 and 25% over (see usualFor for what "usual" means). */
function categoryJumps(data: AppData, month: string): Check[] {
  const totals = data.monthTotals[month] ?? {};
  const checks: Check[] = [];
  for (const category of data.categories) {
    if (category.group === 'system') continue;
    const now = totals[category.id] ?? 0;
    const basis = usualFor(data, month, category.id);
    if (!basis) continue;
    const usual = basis.cents;
    const diff = now - usual;
    if (diff < 5000 || diff < usual * 0.25) continue;
    const versus = basis.months.length === 1 ? monthName(basis.months[0]).split(' ')[0] : `your usual ${formatDollars(usual)}`;
    checks.push({
      id: `jump:${category.id}:${month}`,
      kind: 'jump',
      title: `${category.name} ran ${formatDollars(diff)} higher`,
      detail:
        basis.months.length === 1
          ? `${formatDollars(now)} this month, ${formatDollars(usual)} in ${versus}.`
          : `${formatDollars(now)} this month against ${versus}.`,
      categoryId: category.id,
      diffCents: diff,
    });
  }
  return checks;
}

const ORDER: CheckKind[] = ['changed', 'duplicate', 'jump', 'new'];

/** Every check for a month, most useful first, minus the ones already waved through. */
export function checksFor(data: AppData, month: string): Check[] {
  const earlier = earlierMonths(data, month);
  const rows = data.txns.filter((t) => t.date.startsWith(month));
  const changed = changedRecurring(data, month, earlier);
  // When one bill going up explains most of a category's rise, the bill is the news. Say it once.
  const jumps = categoryJumps(data, month).filter((jump) => {
    const explained = changed
      .filter((c) => c.categoryId === jump.categoryId && (c.diffCents ?? 0) > 0)
      .reduce((sum, c) => sum + (c.diffCents ?? 0), 0);
    return explained < (jump.diffCents ?? 0) * 0.8;
  });
  const all = [...changed, ...duplicates(rows), ...jumps, ...newStanding(data, month, earlier)];
  const hidden = new Set(data.dismissedChecks);
  return all.filter((c) => !hidden.has(c.id)).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

export function dismissCheck(data: AppData, id: string): AppData {
  if (data.dismissedChecks.includes(id)) return data;
  return { ...data, dismissedChecks: [...data.dismissedChecks, id] };
}
