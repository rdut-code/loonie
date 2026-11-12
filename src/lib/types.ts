// Shared data shapes. Money is always whole cents, dates are always YYYY-MM-DD.

export type Owner = 'you' | 'partner' | 'shared';
export type AccountKind = 'card' | 'bank';
export type BankId = 'amex' | 'scotia' | 'other';

export interface Account {
  id: string;
  /** A nickname the owner typed. Never a card or account number. */
  name: string;
  kind: AccountKind;
  bank: BankId;
  owner: Owner;
}

export type CategoryGroup = 'fixed' | 'everyday' | 'system';

export interface Category {
  id: string;
  name: string;
  group: CategoryGroup;
}

/** System categories that are never counted as spending. */
export const NOT_SPENDING = 'not-spending';
export const INCOME = 'income';
export const OTHER = 'other';

/**
 * How a transaction got its category:
 *  rule      a saved merchant rule matched
 *  confirmed the owner picked it by hand
 *  auto      the app is sure (card payments, deposits)
 *  guess     a keyword match, shown as unconfirmed
 *  unknown   waiting in the review queue
 */
export type TxnStatus = 'rule' | 'confirmed' | 'auto' | 'guess' | 'unknown';

export interface Txn {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Cleaned merchant name for display, digit runs masked. */
  merchant: string;
  /** Stable key used to match rules, for example "TIM HORTONS". */
  key: string;
  /** Positive means money out. Negative means a refund or money in. */
  cents: number;
  accountId: string;
  categoryId: string | null;
  status: TxnStatus;
}

export interface Rule {
  merchant: string;
  categoryId: string;
}

export interface ImportRecord {
  accountId: string;
  /** YYYY-MM */
  month: string;
  lines: number;
  format: string;
}

export interface AppData {
  version: 1;
  setupDone: boolean;
  people: { you: string; partner: string };
  accounts: Account[];
  categories: Category[];
  /** The "brain": merchant key to category. */
  rules: Record<string, Rule>;
  txns: Txn[];
  /** month -> categoryId -> cents. Kept even when rows are not. */
  monthTotals: Record<string, Record<string, number>>;
  imports: ImportRecord[];
  /** When false, transaction rows live in memory only and vanish with the tab. */
  keepRows: boolean;
  theme: 'light' | 'dark' | null;
  /** Checks the owner has waved through with "Got it", so they are not shown again. */
  dismissedChecks: string[];
  /** YYYY-MM-DD of the last full backup, shown as a gentle reminder. */
  lastBackupOn: string | null;
}

/** One line as read from a statement, before cleanup. Lives in memory only. */
export interface RawLine {
  date: string;
  description: string;
  /** Positive means money out of the account. */
  outCents: number;
}

export interface ParseResult {
  format: string;
  lines: RawLine[];
  /** Rows that could not be read (bad date or amount). */
  skipped: number;
}
