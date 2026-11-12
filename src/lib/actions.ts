// Every change to the app's data goes through a function in this file.
// Each one takes the current data and returns a new copy, which keeps
// undo simple (keep the old copy) and makes the logic easy to test.

import { DEFAULT_CATEGORIES, guessCategory } from './categories';
import { daysBetween, shortDate } from './money';
import { displayName, isGenericKey, merchantKey } from './normalize';
import {
  INCOME,
  NOT_SPENDING,
  OTHER,
  type Account,
  type AppData,
  type Category,
  type ParseResult,
  type Txn,
} from './types';

export function emptyData(): AppData {
  return {
    version: 1,
    setupDone: false,
    people: { you: '', partner: '' },
    accounts: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    rules: {},
    txns: [],
    monthTotals: {},
    imports: [],
    keepRows: true,
    theme: null,
    dismissedChecks: [],
    lastBackupOn: null,
  };
}

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// A payment arriving on a credit card. Not spending, or it would be counted twice.
const CARD_PAYMENT = /PAYMENT\s*(RECEIVED|-?\s*THANK YOU)|PAIEMENT\s*RE[CÇ]U|AUTOMATIC PAYMENT|PRE-?AUTHORIZED PAYMENT|PAYMENT FROM|ONLINE PAYMENT/i;
// A payment leaving the bank account towards a credit card.
const BANK_TO_CARD = /CREDIT CARD|\bVISA\b|\bAMEX\b|AMERICAN EXPRESS|MASTERCARD|\bM\/C\b|LOC PAY/i;

/**
 * True for a line that only moves money between your own accounts and a card:
 * a payment arriving on a card, or a payment to a card leaving the bank.
 * These are never spending, or every card purchase would be counted twice.
 */
export function isCardPaymentLine(kind: Account['kind'], description: string, outCents: number): boolean {
  if (kind === 'card') return outCents < 0 && CARD_PAYMENT.test(description);
  return outCents > 0 && BANK_TO_CARD.test(description);
}

/** Per-month totals by category, rebuilt for every month that has rows in memory. */
function withTotals(data: AppData): AppData {
  const fresh: Record<string, Record<string, number>> = {};
  for (const t of data.txns) {
    if (!t.categoryId) continue;
    const month = t.date.slice(0, 7);
    fresh[month] ??= {};
    fresh[month][t.categoryId] = (fresh[month][t.categoryId] ?? 0) + t.cents;
  }
  return { ...data, monthTotals: { ...data.monthTotals, ...fresh } };
}

export interface ImportOutcome {
  data: AppData;
  added: number;
  duplicates: number;
  skipped: number;
  warnings: string[];
  /** "Oct 2 to Oct 30" */
  range: string;
}

/** Adds one parsed statement to an account: cleans, categorizes, and drops rows already seen. */
export function addStatement(data: AppData, account: Account, parsed: ParseResult): ImportOutcome {
  const signature = (t: { date: string; key: string; cents: number }) => `${t.date}|${t.key}|${t.cents}`;

  // Overlapping statements repeat rows. Two identical purchases on one day
  // are real though, so rows are matched by count, not just by presence.
  const seen = new Map<string, number>();
  for (const t of data.txns) {
    if (t.accountId !== account.id) continue;
    seen.set(signature(t), (seen.get(signature(t)) ?? 0) + 1);
  }

  const fresh: Txn[] = [];
  let duplicates = 0;
  for (const line of parsed.lines) {
    if (line.outCents === 0) continue;
    let key = merchantKey(line.description);
    let categoryId: string | null = null;
    let status: Txn['status'] = 'unknown';

    if (account.kind === 'card' && isCardPaymentLine('card', line.description, line.outCents)) {
      key = 'CARD PAYMENT';
      categoryId = NOT_SPENDING;
      status = 'auto';
    } else if (account.kind === 'bank' && isCardPaymentLine('bank', line.description, line.outCents)) {
      key = 'PAYMENT TO CARD';
      categoryId = NOT_SPENDING;
      status = 'auto';
    } else if (account.kind === 'bank' && line.outCents < 0) {
      categoryId = INCOME;
      status = 'auto';
    } else if (data.rules[key] && !isGenericKey(key)) {
      categoryId = data.rules[key].categoryId;
      status = 'rule';
    } else {
      const guess = guessCategory(key, data.categories);
      if (guess.sureCategoryId) {
        categoryId = guess.sureCategoryId;
        status = 'guess';
      }
    }

    const candidate = { date: line.date, key, cents: line.outCents };
    const left = seen.get(signature(candidate)) ?? 0;
    if (left > 0) {
      seen.set(signature(candidate), left - 1);
      duplicates++;
      continue;
    }
    fresh.push({
      id: newId(),
      date: line.date,
      merchant: displayName(key),
      key,
      cents: line.outCents,
      accountId: account.id,
      categoryId,
      status,
    });
  }

  const dates = parsed.lines.map((l) => l.date).sort();
  const warnings: string[] = [];
  if (dates.length >= 8) {
    for (let i = 1; i < dates.length; i++) {
      if (daysBetween(dates[i - 1], dates[i]) >= 10) {
        warnings.push(
          `Nothing between ${shortDate(dates[i - 1])} and ${shortDate(dates[i])}. A page might be missing.`,
        );
        break;
      }
    }
  }
  if (parsed.skipped > 0) {
    warnings.push(`${parsed.skipped} ${parsed.skipped === 1 ? 'row' : 'rows'} had no readable date or amount, so I left ${parsed.skipped === 1 ? 'it' : 'them'} out.`);
  }

  const months = new Map<string, number>();
  for (const t of fresh) months.set(t.date.slice(0, 7), (months.get(t.date.slice(0, 7)) ?? 0) + 1);
  const imports = [...data.imports];
  for (const [month, lines] of months) {
    const existing = imports.findIndex((r) => r.accountId === account.id && r.month === month);
    if (existing >= 0) imports[existing] = { ...imports[existing], lines: imports[existing].lines + lines };
    else imports.push({ accountId: account.id, month, lines, format: parsed.format });
  }

  return {
    data: withTotals({ ...data, txns: [...data.txns, ...fresh], imports }),
    added: fresh.length,
    duplicates,
    skipped: parsed.skipped,
    warnings,
    range: dates.length ? `${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])}` : '',
  };
}

export interface Question {
  /** Unique within the queue. */
  id: string;
  /** True for e-transfers and the like: this question covers one line only. */
  single: boolean;
  key: string;
  merchant: string;
  /** Number of waiting lines from this merchant. */
  count: number;
  totalCents: number;
  /** Most recent line, shown on the card. */
  latest: Txn;
  suggestions: Category[];
}

/** The review queue: one question per unknown merchant, biggest total first. */
export function reviewQueue(data: AppData): Question[] {
  const groups = new Map<string, Txn[]>();
  for (const t of data.txns) {
    if (t.status !== 'unknown') continue;
    // Generic lines (e-transfers and similar) each get their own question.
    const group = isGenericKey(t.key) ? `one:${t.id}` : t.key;
    const list = groups.get(group);
    if (list) list.push(t);
    else groups.set(group, [t]);
  }
  const byId = new Map(data.categories.map((c) => [c.id, c]));
  const questions: Question[] = [];
  for (const [id, list] of groups) {
    const latest = list.reduce((a, b) => (b.date > a.date ? b : a));
    const key = latest.key;
    const ids = guessCategory(key, data.categories).suggestions;
    questions.push({
      id,
      single: id !== key,
      key,
      merchant: latest.merchant,
      count: list.length,
      totalCents: list.reduce((sum, t) => sum + t.cents, 0),
      latest,
      suggestions: ids.map((id) => byId.get(id)).filter((c): c is Category => !!c),
    });
  }
  return questions.sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents) || a.id.localeCompare(b.id));
}

/**
 * Files every line from one merchant. With `remember`, the choice is saved
 * as a rule and used for all future uploads too.
 * Lines the owner fixed one by one are left alone.
 */
export function assignMerchant(data: AppData, key: string, categoryId: string, remember: boolean): AppData {
  if (isGenericKey(key)) remember = false;
  const txns = data.txns.map((t) =>
    t.key === key && t.status !== 'confirmed' && t.status !== 'auto'
      ? { ...t, categoryId, status: remember ? ('rule' as const) : ('confirmed' as const) }
      : t,
  );
  const rules = { ...data.rules };
  if (remember) rules[key] = { merchant: displayName(key), categoryId };
  return withTotals({ ...data, txns, rules });
}

/** Fixes a single line without touching the merchant's rule. */
export function assignOne(data: AppData, txnId: string, categoryId: string): AppData {
  const txns = data.txns.map((t) => (t.id === txnId ? { ...t, categoryId, status: 'confirmed' as const } : t));
  return withTotals({ ...data, txns });
}

/** Removes a rule. Lines already filed keep their category. */
export function deleteRule(data: AppData, key: string): AppData {
  const rules = { ...data.rules };
  delete rules[key];
  return { ...data, rules };
}

export function renameCategory(data: AppData, id: string, name: string): AppData {
  const clean = name.trim();
  if (!clean) return data;
  return { ...data, categories: data.categories.map((c) => (c.id === id ? { ...c, name: clean } : c)) };
}

export function addCategory(data: AppData, name: string, group: 'fixed' | 'everyday'): AppData {
  const clean = name.trim();
  if (!clean || data.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return data;
  const category: Category = { id: `c-${newId()}`, name: clean, group };
  const firstSystem = data.categories.findIndex((c) => c.group === 'system');
  const categories = [...data.categories];
  categories.splice(firstSystem < 0 ? categories.length : firstSystem, 0, category);
  return { ...data, categories };
}

/** Removes a category. Its lines and rules move to Other. */
export function removeCategory(data: AppData, id: string): AppData {
  const target = data.categories.find((c) => c.id === id);
  if (!target || target.group === 'system' || id === OTHER) return data;
  const rules: AppData['rules'] = {};
  for (const [key, rule] of Object.entries(data.rules)) {
    rules[key] = rule.categoryId === id ? { ...rule, categoryId: OTHER } : rule;
  }
  const txns = data.txns.map((t) => (t.categoryId === id ? { ...t, categoryId: OTHER } : t));
  const monthTotals: AppData['monthTotals'] = {};
  for (const [month, totals] of Object.entries(data.monthTotals)) {
    const next = { ...totals };
    if (next[id] !== undefined) {
      next[OTHER] = (next[OTHER] ?? 0) + next[id];
      delete next[id];
    }
    monthTotals[month] = next;
  }
  return withTotals({ ...data, categories: data.categories.filter((c) => c.id !== id), rules, txns, monthTotals });
}

/** Removes an account and everything uploaded for it. */
export function removeAccount(data: AppData, accountId: string): AppData {
  const txns = data.txns.filter((t) => t.accountId !== accountId);
  const months = new Set(data.txns.filter((t) => t.accountId === accountId).map((t) => t.date.slice(0, 7)));
  const monthTotals = { ...data.monthTotals };
  for (const month of months) delete monthTotals[month];
  return withTotals({
    ...data,
    accounts: data.accounts.filter((a) => a.id !== accountId),
    imports: data.imports.filter((r) => r.accountId !== accountId),
    txns,
    monthTotals,
  });
}

/** Months that have any data, newest first. */
export function monthsWithData(data: AppData): string[] {
  const months = new Set(Object.keys(data.monthTotals));
  for (const t of data.txns) months.add(t.date.slice(0, 7));
  return [...months].sort().reverse();
}

/** Total real spending for a month: everything except transfers, card payments and money in. */
export function spendingTotal(totals: Record<string, number>): number {
  let sum = 0;
  for (const [id, cents] of Object.entries(totals)) {
    if (id !== NOT_SPENDING && id !== INCOME) sum += cents;
  }
  return sum;
}
