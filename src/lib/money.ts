// Money and date helpers. No floating point maths on dollar amounts.

/**
 * Turns statement text like "$1,234.56", "(12.34)", "12.34 CR" or "-5" into cents.
 * Returns null when the text is not an amount.
 */
export function parseCents(text: string): number | null {
  let s = text.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/CR$/i.test(s)) {
    negative = !negative;
    s = s.replace(/CR$/i, '');
  }
  s = s.replace(/[$\s,]|CAD/gi, '');
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const m = /^(\d*)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m || (m[1] === '' && m[2] === undefined)) return null;
  const dollars = m[1] === '' ? 0 : Number(m[1]);
  const cents = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  const total = dollars * 100 + cents;
  return negative ? -total : total;
}

const cadCents = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const cadWhole = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

/** "$46.18", used on individual transactions. */
export function formatCents(cents: number): string {
  return cadCents.format(cents / 100).replace('CA', '');
}

/** "$1,234", used on summaries. */
export function formatDollars(cents: number): string {
  return cadWhole.format(Math.round(cents / 100)).replace('CA', '');
}

export type DateOrder = 'MDY' | 'DMY';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // French short names that differ, since Canadian statements can be bilingual.
  janv: 1, fev: 2, fév: 2, mars: 3, avr: 4, mai: 5, juin: 6,
  juil: 7, aout: 8, août: 8, sept: 9, déc: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Reads the date styles banks use and returns YYYY-MM-DD, or null.
 * `order` only matters for all-number dates like 03/04/2026.
 */
export function parseDate(text: string, order: DateOrder = 'MDY'): string | null {
  const s = text.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return order === 'MDY' ? iso(Number(m[3]), a, b) : iso(Number(m[3]), b, a);
  }
  // 04 Nov 2026, 4-Nov-26, 04 Nov. 2026
  m = /^(\d{1,2})[\s-]+([A-Za-zéûÉ]{3,5})\.?[\s,-]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()] ?? MONTHS[m[2].toLowerCase().slice(0, 3)];
    return month ? iso(Number(m[3]), month, Number(m[1])) : null;
  }
  // Nov 4, 2026 and November 4 2026
  m = /^([A-Za-zéûÉ]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()] ?? MONTHS[m[1].toLowerCase().slice(0, 3)];
    return month ? iso(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

/**
 * Works out whether all-number dates are month-first or day-first.
 * A number above 12 settles it. Otherwise the order that gives the
 * tighter date range wins, since a statement covers about a month.
 */
export function inferDateOrder(samples: string[], fallback: DateOrder): DateOrder {
  let sawBigFirst = false;
  let sawBigSecond = false;
  for (const s of samples) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/.exec(s.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) sawBigFirst = true;
    if (Number(m[2]) > 12) sawBigSecond = true;
  }
  if (sawBigFirst && !sawBigSecond) return 'DMY';
  if (sawBigSecond && !sawBigFirst) return 'MDY';

  const span = (order: DateOrder): number => {
    const dates = samples.map((s) => parseDate(s, order)).filter((d): d is string => !!d);
    if (dates.length < 2) return Infinity;
    dates.sort();
    return Date.parse(dates[dates.length - 1]) - Date.parse(dates[0]);
  };
  const mdy = span('MDY');
  const dmy = span('DMY');
  if (mdy === dmy) return fallback;
  return mdy < dmy ? 'MDY' : 'DMY';
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10-03" -> "Oct 3" */
export function shortDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

/** "2026-10" -> "October 2026" */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${LONG_MONTHS[m - 1]} ${y}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
