// Finds the transactions in the text of a PDF statement.
//
// Bank layouts differ, so this does not rely on one. A transaction is any
// line that starts with a date and ends with an amount. The result is then
// checked against the balances printed on the statement, and the owner is
// asked to look it over whenever that check cannot be passed.

import { parseCents, parseDate } from '../money';
import type { AccountKind, BankId, RawLine } from '../types';
import type { Cell, TextLine } from './lines';

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
// "Oct 3", "Oct. 03, 2026", "3 Oct", "10/03", "10/03/2026", "2026-10-03"
const DATE = `(?:${MONTH}\\s*\\d{1,2}(?:,?\\s*\\d{4})?|\\d{1,2}\\s*${MONTH}(?:,?\\s*\\d{4})?|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?)`;
const LINE_START = new RegExp(`^(?:\\d{1,4}\\s+)?(${DATE})\\s+(?:(${DATE})\\s+)?`, 'i');
const AMOUNT = /(?:^|\s)([+-])?(\s?)(\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s?(CR|-)?$/i;
const AMOUNT_CELL = /^(?:[+-]\s?)?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\s?(?:CR|-)?$/i;

const OPENING = /opening balance|balance forward|previous (?:statement )?balance|previous balance/i;
const CLOSING = /closing balance|ending balance|new balance/i;
const NOT_A_PURCHASE = /^(?:total|sub-?total|minimum|credit limit|available credit|amount due|payment due)/i;
const MONEY_IN_WORDS = /deposit|payroll|refund|rebate|interest (?:paid|received|earned)|e-?transfer (?:received|from)|credit memo|reversal/i;

const MONTH_NUMBER: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export interface TotalsCheck {
  /** match: adds up to the statement. mismatch: it does not. none: no balances found to check. */
  status: 'match' | 'mismatch' | 'none';
  message: string;
}

export interface PdfStatement {
  bank: BankId | null;
  kind: AccountKind;
  lines: RawLine[];
  check: TotalsCheck;
  /** Positions in `lines` where a number was hard to read (photos only). */
  doubtful: number[];
}

/** How an amount was marked on the page. */
type Mark = 'plus' | 'minus' | 'cr' | null;

interface Found {
  /** Always positive. The mark says which way the money went. */
  cents: number;
  mark: Mark;
  /** The line with this amount cut off the end. */
  rest: string;
}

/** Reads the last amount on a line: "46.18", "- $728.86", "+ $26.13", "500.00-" or "500.00 CR". */
function lastAmount(text: string): Found | null {
  const m = AMOUNT.exec(text);
  if (!m) return null;
  const cents = parseCents(m[3].replace(/\s/g, ''));
  if (cents === null) return null;
  let cut = m.index;
  let mark: Mark = m[4] ? (m[4] === '-' ? 'minus' : 'cr') : null;
  if (m[1]) {
    const signAt = text.indexOf(m[1], m.index);
    const before = text.slice(0, signAt);
    // A sign belongs to the amount when it touches it ("-$5.00") or sits in the
    // amount's own column ("  - $5.00"). The dash in "PAYMENT - THANK YOU 5.00" does not.
    const ownColumn = before.trim() === '' || /\s{2}$/.test(before);
    if (m[2] === '' || ownColumn) mark = m[1] === '+' ? 'plus' : 'minus';
    else cut = signAt + 1;
  }
  return { cents, mark, rest: text.slice(0, cut).trimEnd() };
}

/** A number that lost its decimal point in a photo, such as "+$2613". Digits only, for comparing. */
function looseAmount(text: string): { digits: string; mark: Mark; rest: string } | null {
  const m = /(?:^|\s)([+-])?\s?\$\s?([\d,. ]*\d)$/.exec(text);
  if (!m) return null;
  return {
    digits: m[2].replace(/\D/g, ''),
    mark: m[1] === '+' ? 'plus' : m[1] === '-' ? 'minus' : null,
    rest: text.slice(0, m.index).trimEnd(),
  };
}

/** The statement's end date, used to give "Oct 3" its year. */
function findAnchor(lines: TextLine[], today: string): string {
  const full = new RegExp(`${MONTH}\\s*\\d{1,2},?\\s*\\d{4}|\\d{1,2}\\s*${MONTH},?\\s*\\d{4}|\\d{4}-\\d{2}-\\d{2}`, 'gi');
  let fromPeriodLine: string | null = null;
  let latest: string | null = null;
  for (const line of lines) {
    const found = (line.text.match(full) ?? [])
      .map((s) => parseDate(s.replace(/([a-z])(\d)/i, '$1 $2').replace(/(\d)([a-z])/i, '$1 $2')))
      .filter((d): d is string => !!d && d <= addDays(today, 62));
    if (found.length === 0) continue;
    const max = found.sort()[found.length - 1];
    if (/statement|period|closing date/i.test(line.text) && (!fromPeriodLine || max > fromPeriodLine)) fromPeriodLine = max;
    if (!latest || max > latest) latest = max;
  }
  return fromPeriodLine ?? latest ?? today;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Gives a date without a year the right one, so December lines on a January statement land in last year. */
function resolveDate(text: string, anchor: string): string | null {
  const spaced = text.replace(/([a-z.])(\d)/i, '$1 $2').replace(/(\d)([a-z])/i, '$1 $2').trim();
  const withYear = parseDate(spaced) ?? parseDate(spaced, 'MDY');
  if (withYear) return withYear;

  let month = 0;
  let day = 0;
  let m = /^([a-z]{3})[a-z]*\.?\s*(\d{1,2})$/i.exec(spaced);
  if (m) {
    month = MONTH_NUMBER[m[1].toLowerCase()] ?? 0;
    day = Number(m[2]);
  } else if ((m = /^(\d{1,2})\s*([a-z]{3})[a-z]*\.?$/i.exec(spaced))) {
    month = MONTH_NUMBER[m[2].toLowerCase()] ?? 0;
    day = Number(m[1]);
  } else if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(spaced))) {
    month = Number(m[1]);
    day = Number(m[2]);
  }
  if (!month || !day) return null;
  const year = Number(anchor.slice(0, 4));
  const candidate = parseDate(`${year}-${month}-${day}`);
  if (!candidate) return null;
  // A date well past the statement end belongs to the year before.
  return candidate > addDays(anchor, 31) ? parseDate(`${year - 1}-${month}-${day}`) : candidate;
}

interface Columns {
  out: number;
  in: number;
  balance: number | null;
}

/** Finds the right-hand edges of the money out, money in and balance columns on a bank statement. */
function findColumns(lines: TextLine[]): Columns | null {
  for (const line of lines) {
    const out = line.cells.find((c) => /withdraw|debit|money out|paid out/i.test(c.str));
    const inn = line.cells.find((c) => /deposit|credit|money in|paid in/i.test(c.str));
    if (out && inn && out !== inn) {
      const balance = line.cells.find((c) => /balance/i.test(c.str));
      return { out: out.right, in: inn.right, balance: balance ? balance.right : null };
    }
  }
  return null;
}

function nearestColumn(cell: Cell, columns: Columns): 'out' | 'in' | 'balance' {
  const options: ['out' | 'in' | 'balance', number][] = [
    ['out', Math.abs(cell.right - columns.out)],
    ['in', Math.abs(cell.right - columns.in)],
  ];
  if (columns.balance !== null) options.push(['balance', Math.abs(cell.right - columns.balance)]);
  return options.sort((a, b) => a[1] - b[1])[0][0];
}

function detectBank(text: string): BankId | null {
  if (/american express|amex/i.test(text)) return 'amex';
  if (/scotiabank|scotia|scene\+/i.test(text)) return 'scotia';
  return null;
}

function detectKind(text: string): AccountKind {
  if (/credit limit|minimum payment|card ?member|available credit|new balance/i.test(text)) return 'card';
  return 'bank';
}

function money(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Row {
  date: string;
  description: string;
  founds: Found[];
  line: TextLine;
}

function shortDay(iso: string): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

/**
 * @param forceKind  set when the owner already said which account this is
 * @param today      YYYY-MM-DD, passed in so tests are repeatable
 */
export function parseStatement(lines: TextLine[], today: string, forceKind?: AccountKind): PdfStatement {
  const allText = lines.map((l) => l.text).join('\n');
  const kind = forceKind ?? detectKind(allText);
  const anchor = findAnchor(lines, today);
  const columns = kind === 'bank' ? findColumns(lines) : null;

  // Step 1: find the transaction rows.
  const rows: Row[] = [];
  let opening: number | null = null;
  let closing: number | null = null;
  let extraLines = -1; // how many payee lines were joined to the last row. -1: not after a row.

  for (const line of lines) {
    const text = line.text.replace(/\s{3,}/g, '  ').trim();

    // Balances printed on the statement, kept for the totals check.
    if (OPENING.test(text) || CLOSING.test(text)) {
      const amount = lastAmount(text);
      if (amount) {
        const value = amount.mark === 'minus' || amount.mark === 'cr' ? -amount.cents : amount.cents;
        if (OPENING.test(text) && opening === null) opening = value;
        else if (CLOSING.test(text)) closing = value;
      }
      extraLines = -1;
      continue;
    }

    const start = LINE_START.exec(text);
    if (!start) {
      // Banks often wrap the payee onto the lines under the transaction.
      const joins =
        kind === 'bank' && extraLines >= 0 && extraLines < 3 && !lastAmount(text) && /[a-z]/i.test(text) && text.length <= 60;
      if (joins) {
        rows[rows.length - 1].description += ' ' + text;
        extraLines++;
      } else {
        extraLines = -1;
      }
      continue;
    }

    const date = resolveDate(start[1], anchor);
    let rest = text.slice(start[0].length);
    const founds: Found[] = [];
    for (let i = 0; i < 3; i++) {
      const found = lastAmount(rest);
      if (!found) break;
      founds.unshift(found);
      rest = found.rest;
    }
    const description = rest.replace(/\s+/g, ' ').trim();
    if (!date || founds.length === 0 || !/[a-z]/i.test(description) || NOT_A_PURCHASE.test(description)) {
      extraLines = -1;
      continue;
    }
    rows.push({ date, description, founds, line });
    extraLines = 0;
  }

  // Step 2: work out the amount and direction of each row.
  const out: RawLine[] = [];
  const doubtful: number[] = [];
  let chain: TotalsCheck | null = null;

  if (kind === 'card') {
    // Printed statements show a purchase as a plain number and a payment with a minus or CR.
    // Online lists do the opposite and put a minus on every purchase. Purchases are the
    // majority either way, so the majority decides which style this is.
    const marked = rows.filter((r) => r.founds[r.founds.length - 1].mark === 'minus').length;
    const minusIsPurchase = rows.length >= 3 && marked > rows.length / 2;
    rows.forEach((row, i) => {
      const f = row.founds[row.founds.length - 1];
      const credit = minusIsPurchase ? f.mark !== 'minus' : f.mark === 'minus' || f.mark === 'cr';
      out.push({ date: row.date, description: row.description, outCents: credit ? -f.cents : f.cents });
      if (row.line.unsure) doubtful.push(i);
    });
  } else {
    // Does this list carry a running balance after each amount?
    const withBalance = rows.filter((r) => r.founds.length >= 2);
    const hasBalanceColumn = rows.length >= 2 && withBalance.length >= rows.length / 2;
    const rightEdge = (row: Row): number => {
      const cells = row.line.cells.filter((c) => AMOUNT_CELL.test(c.str));
      return cells.length ? cells[cells.length - 1].right : NaN;
    };
    const edges = withBalance.map(rightEdge).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    const balanceEdge = edges.length ? edges[Math.floor(edges.length / 2)] : NaN;

    interface Entry {
      row: Row;
      description: string;
      cents: number | null;
      mark: Mark;
      balance: number | null;
      looseDigits: string | null;
      moneyIn: boolean | null;
      unsure: boolean;
    }
    const entries: Entry[] = rows.map((row) => {
      const e: Entry = {
        row, description: row.description, cents: null, mark: null, balance: null,
        looseDigits: null, moneyIn: null, unsure: !!row.line.unsure,
      };
      const first = row.founds[0];
      const last = row.founds[row.founds.length - 1];
      if (row.founds.length >= 2 && hasBalanceColumn) {
        e.cents = first.cents;
        e.mark = first.mark;
        e.balance = last.mark === 'minus' ? -last.cents : last.cents;
      } else if (hasBalanceColumn && Math.abs(rightEdge(row) - balanceEdge) < 12) {
        // The only number on the row sits in the balance column, so the amount itself was not readable.
        e.balance = last.mark === 'minus' ? -last.cents : last.cents;
        const loose = looseAmount(row.description);
        if (loose) {
          e.looseDigits = loose.digits;
          e.mark = loose.mark;
          e.description = loose.rest;
        }
        e.unsure = true;
      } else {
        e.cents = first.cents;
        e.mark = first.mark;
      }
      return e;
    });

    // Direction from the page itself: a plus or minus, CR, or the column the amount sits in.
    for (const e of entries) {
      if (e.mark === 'plus' || e.mark === 'cr') e.moneyIn = true;
      else if (e.mark === 'minus') e.moneyIn = false;
      else if (columns && e.cents !== null) {
        const cell = e.row.line.cells.filter((c) => AMOUNT_CELL.test(c.str)).find((c) => nearestColumn(c, columns) !== 'balance');
        if (cell) e.moneyIn = nearestColumn(cell, columns) === 'in';
      }
    }

    // The running balance is the strongest check there is: each row's balance must be the
    // neighbouring row's balance plus or minus this row's amount. Lists can run newest
    // first (online banking) or oldest first (statements).
    const newestFirst = entries.length >= 2 && entries[0].row.date > entries[entries.length - 1].row.date;
    let agreed = 0;
    let firstBreak = '';
    entries.forEach((e, i) => {
      const neighbour = newestFirst ? entries[i + 1] : entries[i - 1];
      const before = neighbour ? neighbour.balance : newestFirst ? null : opening;
      if (e.balance === null || before === null || before === undefined) return;
      const change = e.balance - before; // positive: money came in
      if (e.cents === null) {
        // Fill in an amount the reader lost, as long as its digits do not contradict the balance.
        if (change !== 0 && (e.looseDigits === null || e.looseDigits === String(Math.abs(change)))) {
          e.cents = Math.abs(change);
          e.moneyIn = change > 0;
          agreed++;
        }
        return;
      }
      if (Math.abs(change) === e.cents && (e.moneyIn === null || e.moneyIn === change > 0)) {
        e.moneyIn = change > 0;
        agreed++;
      } else if (!firstBreak) {
        const other = neighbour ? neighbour.row.date : e.row.date;
        firstBreak =
          other === e.row.date
            ? `around ${shortDay(e.row.date)}`
            : `between ${shortDay(other < e.row.date ? other : e.row.date)} and ${shortDay(other < e.row.date ? e.row.date : other)}`;
      }
    });
    if (firstBreak) {
      chain = {
        status: 'mismatch',
        message: `The running balance doesn't follow ${firstBreak}, so a line may be missing there or an amount misread.`,
      };
    } else if (agreed >= 2) {
      chain = { status: 'match', message: 'Every line agrees with the running balance on the page.' };
    }

    for (const e of entries) {
      if (e.cents === null) continue; // no readable amount and no balance to recover it from
      const moneyIn = e.moneyIn ?? MONEY_IN_WORDS.test(e.description);
      out.push({ date: e.row.date, description: e.description, outCents: moneyIn ? -e.cents : e.cents });
      if (e.unsure) doubtful.push(out.length - 1);
    }
    const lost = entries.filter((e) => e.cents === null).length;
    if (lost > 0 && (!chain || chain.status === 'match')) {
      chain = {
        status: 'mismatch',
        message: `I couldn't read the amount on ${lost} ${lost === 1 ? 'line' : 'lines'}, so ${lost === 1 ? "it's" : "they're"} missing from this list.`,
      };
    }
  }

  // Step 3: check the result against what the statement itself says.
  const net = out.reduce((sum, l) => sum + l.outCents, 0);
  let check: TotalsCheck;
  if (opening !== null && closing !== null) {
    // A card balance grows with spending. A bank balance shrinks with it.
    const expected = kind === 'card' ? opening + net : opening - net;
    check =
      expected === closing
        ? { status: 'match', message: 'These add up to the balance printed on the statement.' }
        : {
            status: 'mismatch',
            message: `These lines bring the balance to ${money(expected)}, but the statement says ${money(closing)}. I'm off by ${money(expected - closing)}, so a line may be missing or misread.`,
          };
  } else if (chain) {
    check = chain;
  } else {
    check = { status: 'none', message: "I couldn't find the statement's balances to check my reading against." };
  }

  // The bank's name is in the page header, above the first dated line. Looking
  // further down would mistake a payee such as "AMEX" on a chequing statement for the bank.
  const firstDated = lines.findIndex((l) => LINE_START.test(l.text.trim()));
  const headerText = lines.slice(0, firstDated < 0 ? 15 : Math.min(firstDated, 40)).map((l) => l.text).join('\n');
  return { bank: detectBank(headerText), kind, lines: out, check, doubtful };
}
