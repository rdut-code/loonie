// The full backup: everything the app knows, in one small file.
//
// It is built to survive a cleared browser. Restoring it on a clean browser
// brings back every transaction, category, rule, account and setting.
//
// How it stays small:
//  - each merchant name is stored once, and transactions point to it by number
//  - a transaction is six small numbers (day, merchant, cents, account, category, status)
//  - the whole thing is gzip-compressed by the browser's built-in compressor
// A typical month of about 200 lines adds roughly 2 KB.
//
// How it stays trustworthy:
//  - a version number, so newer apps can still read older files
//  - a line count and a sum of all amounts, checked on restore
//  - restore builds the complete data first and only then replaces what is
//    on the device, so a damaged file changes nothing

import { emptyData, newId } from './actions';
import { daysBetween } from './money';
import { displayName } from './normalize';
import { applyBackup, readBackup, type Backup } from './storage';
import type { AppData, Txn, TxnStatus } from './types';

const STATUSES: TxnStatus[] = ['rule', 'confirmed', 'auto', 'guess', 'unknown'];
const NOT_OURS = "That file isn't a Loonie backup. I couldn't read it.";
const DAMAGED = "That backup is damaged: its contents don't add up. Nothing was changed.";

interface FullBackup {
  app: 'loonie';
  kind: 'full';
  version: 2;
  exportedOn: string;
  people: AppData['people'];
  accounts: AppData['accounts'];
  categories: AppData['categories'];
  /** [merchant key, category id] */
  rules: [string, string][];
  monthTotals: AppData['monthTotals'];
  imports: AppData['imports'];
  dismissedChecks: string[];
  keepRows: boolean;
  theme: AppData['theme'];
  /** Every merchant key, once. */
  keys: string[];
  /** The earliest date. Transaction days count from here. */
  base: string;
  /** Six numbers per transaction: day, key, cents, account, category (-1 for none), status. */
  rows: number[];
  check: { count: number; sum: number };
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Packs all data into the backup shape. Pure, so it can be tested without a browser. */
export function toFullBackup(data: AppData, today: string): FullBackup {
  const keys: string[] = [];
  const keyIndex = new Map<string, number>();
  const accountIndex = new Map(data.accounts.map((a, i) => [a.id, i]));
  const categoryIndex = new Map(data.categories.map((c, i) => [c.id, i]));
  const txns = data.txns.filter((t) => accountIndex.has(t.accountId));
  const base = txns.reduce((min, t) => (t.date < min ? t.date : min), txns[0]?.date ?? today);

  const rows: number[] = [];
  let sum = 0;
  for (const t of txns) {
    let k = keyIndex.get(t.key);
    if (k === undefined) {
      k = keys.length;
      keys.push(t.key);
      keyIndex.set(t.key, k);
    }
    rows.push(
      daysBetween(base, t.date),
      k,
      t.cents,
      accountIndex.get(t.accountId)!,
      t.categoryId ? (categoryIndex.get(t.categoryId) ?? -1) : -1,
      STATUSES.indexOf(t.status),
    );
    sum += t.cents;
  }

  return {
    app: 'loonie',
    kind: 'full',
    version: 2,
    exportedOn: today,
    people: data.people,
    accounts: data.accounts,
    categories: data.categories,
    rules: Object.entries(data.rules).map(([key, rule]) => [key, rule.categoryId]),
    monthTotals: data.monthTotals,
    imports: data.imports,
    dismissedChecks: data.dismissedChecks,
    keepRows: data.keepRows,
    theme: data.theme,
    keys,
    base,
    rows,
    check: { count: txns.length, sum },
  };
}

/** Rebuilds the app's data from a backup. Throws a friendly message if anything is off. */
export function fromFullBackup(b: FullBackup): AppData {
  const shapeOk =
    Array.isArray(b.accounts) && Array.isArray(b.categories) && Array.isArray(b.rules) && Array.isArray(b.keys) &&
    Array.isArray(b.rows) && b.rows.length % 6 === 0 && typeof b.base === 'string' && b.check && typeof b.monthTotals === 'object';
  if (!shapeOk) throw new Error(DAMAGED);

  const txns: Txn[] = [];
  let sum = 0;
  for (let i = 0; i < b.rows.length; i += 6) {
    const [day, k, cents, a, c, s] = b.rows.slice(i, i + 6);
    const key = b.keys[k];
    const account = b.accounts[a];
    const status = STATUSES[s];
    if (key === undefined || !account || !status || !Number.isInteger(cents) || !Number.isInteger(day)) throw new Error(DAMAGED);
    const category = c === -1 ? null : b.categories[c];
    if (category === undefined) throw new Error(DAMAGED);
    txns.push({
      id: newId(),
      date: addDays(b.base, day),
      merchant: displayName(key),
      key,
      cents,
      accountId: account.id,
      categoryId: category ? category.id : null,
      status,
    });
    sum += cents;
  }
  if (txns.length !== b.check.count || sum !== b.check.sum) throw new Error(DAMAGED);

  const rules: AppData['rules'] = {};
  for (const [key, categoryId] of b.rules) rules[key] = { merchant: displayName(key), categoryId };

  return {
    ...emptyData(),
    setupDone: true,
    people: b.people ?? { you: '', partner: '' },
    accounts: b.accounts,
    categories: b.categories,
    rules,
    txns,
    monthTotals: b.monthTotals ?? {},
    imports: b.imports ?? [],
    dismissedChecks: b.dismissedChecks ?? [],
    keepRows: b.keepRows ?? true,
    theme: b.theme ?? null,
  };
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** The bytes of the backup file. Compressed where the browser can, plain JSON otherwise. */
export async function packBackup(data: AppData, today: string): Promise<Uint8Array> {
  const text = JSON.stringify(toFullBackup(data, today));
  if (typeof CompressionStream === 'undefined') return new TextEncoder().encode(text);
  return gzip(text);
}

export type Restored =
  | { kind: 'full'; data: AppData; exportedOn: string; lines: number; months: number }
  | { kind: 'rules'; backup: Backup };

/** Reads either kind of backup file: the full one, or the older rules-only one. */
export async function unpackBackup(bytes: Uint8Array): Promise<Restored> {
  let text: string;
  try {
    const zipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    text = zipped ? await gunzip(bytes) : new TextDecoder().decode(bytes);
  } catch {
    throw new Error(DAMAGED);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(NOT_OURS);
  }
  const b = parsed as Partial<FullBackup>;
  if (!b || b.app !== 'loonie') throw new Error(NOT_OURS);
  if (b.kind === 'full') {
    if (b.version !== 2) throw new Error('That backup was made by a newer version of Loonie. Update the app, then try again.');
    const data = fromFullBackup(b as FullBackup);
    return {
      kind: 'full',
      data,
      exportedOn: b.exportedOn ?? '',
      lines: data.txns.length,
      months: Object.keys(data.monthTotals).length,
    };
  }
  return { kind: 'rules', backup: readBackup(text) };
}

/** Puts a restored backup in place. A full backup replaces everything. A rules-only one keeps your rows. */
export function applyRestored(current: AppData, restored: Restored): AppData {
  return restored.kind === 'full' ? restored.data : applyBackup(current, restored.backup);
}
