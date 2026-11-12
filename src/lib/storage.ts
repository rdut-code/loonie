// Everything the app remembers lives in this browser's storage, under one key.
// Raw statement files are never written here. Only: rules, categories,
// accounts (nicknames), settings, monthly totals, and (if switched on)
// cleaned transaction rows.

import { emptyData } from './actions';
import type { AppData } from './types';

const KEY = 'loonie:v1';

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    if (parsed.version !== 1) return emptyData();
    return { ...emptyData(), ...parsed };
  } catch {
    return emptyData();
  }
}

/** Returns false when the browser refused to save (for example, storage is full or blocked). */
export function saveData(data: AppData): boolean {
  try {
    const toStore: AppData = data.keepRows ? data : { ...data, txns: [] };
    localStorage.setItem(KEY, JSON.stringify(toStore));
    return true;
  } catch {
    return false;
  }
}

export function wipeEverything(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored, nothing to remove.
  }
}

/** The backup file: rules and settings only. Never transactions or totals. */
export interface Backup {
  app: 'loonie';
  version: 1;
  exportedOn: string;
  people: AppData['people'];
  accounts: AppData['accounts'];
  categories: AppData['categories'];
  rules: AppData['rules'];
  keepRows: boolean;
}

export function makeBackup(data: AppData, today: string): Backup {
  return {
    app: 'loonie',
    version: 1,
    exportedOn: today,
    people: data.people,
    accounts: data.accounts,
    categories: data.categories,
    rules: data.rules,
    keepRows: data.keepRows,
  };
}

/** Reads a backup file's text. Throws a friendly message when it is not one of ours. */
export function readBackup(text: string): Backup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Loonie backup. I couldn't read it.");
  }
  const b = parsed as Partial<Backup>;
  if (
    !b ||
    b.app !== 'loonie' ||
    b.version !== 1 ||
    !Array.isArray(b.categories) ||
    !Array.isArray(b.accounts) ||
    typeof b.rules !== 'object' ||
    b.rules === null
  ) {
    throw new Error("That file isn't a Loonie backup. I couldn't read it.");
  }
  return b as Backup;
}

/** Puts a backup's rules and settings in place. Uploaded rows and totals are kept as they are. */
export function applyBackup(data: AppData, backup: Backup): AppData {
  return {
    ...data,
    setupDone: true,
    people: backup.people ?? data.people,
    accounts: backup.accounts,
    categories: backup.categories,
    rules: backup.rules,
    keepRows: backup.keepRows ?? data.keepRows,
  };
}
