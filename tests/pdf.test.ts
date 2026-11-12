import { describe, expect, it } from 'vitest';
import { buildLines, type TextBit } from '../src/lib/pdf/lines';
import { parseStatement } from '../src/lib/pdf/statement';

// Builds positioned text the way the PDF reader hands it over. All data is invented.
type CellSpec = [x: number, text: string, align?: 'r'];
const width = (s: string) => s.length * 5;
function page(rows: CellSpec[][]) {
  const bits: TextBit[] = [];
  rows.forEach((row, i) => {
    for (const [x, str, align] of row) {
      bits.push({ str, x: align === 'r' ? x - width(str) : x, y: 700 - i * 14, width: width(str) });
    }
  });
  return buildLines(bits);
}

const TODAY = '2026-11-10';

describe('buildLines', () => {
  it('joins bits on one row and keeps columns apart', () => {
    const lines = buildLines([
      { str: '46.18', x: 500, y: 100, width: 25 },
      { str: 'Oct', x: 50, y: 100.4, width: 15 },
      { str: '3', x: 68, y: 100, width: 5 },
      { str: 'NORTHSIDE PHARMACY', x: 110, y: 100, width: 90 },
      { str: 'Next row', x: 50, y: 86, width: 40 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(['Oct 3  NORTHSIDE PHARMACY  46.18', 'Next row']);
  });
});

describe('card statement', () => {
  const card = (newBalance: string) =>
    page([
      [[50, 'Scotiabank Scene+ Visa card']],
      [[50, 'Statement Period: Sep 28, 2026 - Oct 27, 2026']],
      [[50, 'Payment due date: Nov 20, 2026']],
      [[50, 'Previous balance'], [560, '$500.00', 'r']],
      [[50, 'REF'], [85, 'TRANS'], [140, 'POST'], [195, 'DETAILS'], [560, 'AMOUNT', 'r']],
      [[50, '001'], [85, 'Sep 29'], [140, 'Sep 30'], [195, 'NETFLIX.COM TORONTO ON'], [560, '20.99', 'r']],
      [[50, '002'], [85, 'Oct 4'], [140, 'Oct 5'], [195, 'SAMPLE HARDWARE STORE 12 MISSISSAUGA ON'], [560, '58.23', 'r']],
      [[50, '003'], [85, 'Oct 15'], [140, 'Oct 15'], [195, 'PAYMENT - THANK YOU'], [560, '500.00-', 'r']],
      [[50, '004'], [85, 'Oct 21'], [140, 'Oct 22'], [195, 'TST* SAMPLE NOODLE HOUSE TORONTO ON'], [560, '41.75', 'r']],
      [[50, 'New balance'], [560, newBalance, 'r']],
      [[50, 'Minimum payment'], [560, '$10.00', 'r']],
      [[50, 'Credit limit'], [560, '$5,000.00', 'r']],
    ]);

  const s = parseStatement(card('$120.97'), TODAY);
  it('recognises the bank and that it is a card', () => {
    expect(s.bank).toBe('scotia');
    expect(s.kind).toBe('card');
  });
  it('reads each transaction with the transaction date and the right sign', () => {
    expect(s.lines).toEqual([
      { date: '2026-09-29', description: 'NETFLIX.COM TORONTO ON', outCents: 2099 },
      { date: '2026-10-04', description: 'SAMPLE HARDWARE STORE 12 MISSISSAUGA ON', outCents: 5823 },
      { date: '2026-10-15', description: 'PAYMENT - THANK YOU', outCents: -50000 },
      { date: '2026-10-21', description: 'TST* SAMPLE NOODLE HOUSE TORONTO ON', outCents: 4175 },
    ]);
  });
  it('does not mistake summary lines for transactions', () => {
    expect(s.lines.some((l) => /balance|minimum|limit/i.test(l.description))).toBe(false);
  });
  it('passes the totals check when the lines add up to the new balance', () => {
    expect(s.check.status).toBe('match');
  });
  it('fails the totals check when they do not, and says by how much', () => {
    const off = parseStatement(card('$140.97'), TODAY);
    expect(off.check.status).toBe('mismatch');
    expect(off.check.message).toContain('$20.00');
  });
  it('says so when there are no balances to check against', () => {
    const bare = parseStatement(page([[[50, 'Oct 4'], [195, 'SAMPLE SHOP'], [560, '10.00', 'r']]]), TODAY, 'card');
    expect(bare.lines).toHaveLength(1);
    expect(bare.check.status).toBe('none');
  });
  it('puts December lines on a January statement in the year before', () => {
    const jan = parseStatement(
      page([
        [[50, 'Statement Period: Dec 28, 2025 - Jan 27, 2026']],
        [[50, 'Dec 30'], [195, 'SAMPLE SHOP'], [560, '10.00', 'r']],
        [[50, 'Jan 5'], [195, 'SAMPLE SHOP'], [560, '12.00', 'r']],
      ]),
      TODAY,
      'card',
    );
    expect(jan.lines.map((l) => l.date)).toEqual(['2025-12-30', '2026-01-05']);
  });
});

describe('bank statement', () => {
  const lines = page([
    [[50, 'Scotiabank chequing account']],
    [[50, 'Statement Period: Oct 1, 2026 to Oct 31, 2026']],
    [[50, 'Date'], [110, 'Description'], [400, 'Withdrawals', 'r'], [480, 'Deposits', 'r'], [560, 'Balance', 'r']],
    [[50, 'Oct 1'], [110, 'Opening Balance'], [560, '5,000.00', 'r']],
    [[50, 'Oct 1'], [110, 'Misc payment'], [400, '2,350.00', 'r'], [560, '2,650.00', 'r']],
    [[110, 'SAMPLE PROPERTY MGMT']],
    [[50, 'Oct 5'], [110, 'Bill payment'], [400, '1,250.00', 'r'], [560, '1,400.00', 'r']],
    [[110, 'AMEX']],
    [[50, 'Oct 15'], [110, 'Payroll deposit'], [480, '4,200.00', 'r'], [560, '5,600.00', 'r']],
    [[50, 'Oct 22'], [110, 'Point of sale purchase'], [400, '63.10', 'r']],
    [[110, 'FPOS SAMPLE GAS BAR TORONTO ON']],
    [[50, 'Oct 31'], [110, 'Closing Balance'], [560, '5,536.90', 'r']],
  ]);
  const s = parseStatement(lines, TODAY);

  it('is recognised as a Scotia bank account, even with an Amex payment in the list', () => {
    expect(s.kind).toBe('bank');
    expect(s.bank).toBe('scotia');
  });
  it('uses the column an amount sits in to tell money out from money in', () => {
    expect(s.lines.map((l) => l.outCents)).toEqual([235000, 125000, -420000, 6310]);
  });
  it('joins the payee from the line underneath', () => {
    expect(s.lines[0].description).toBe('Misc payment SAMPLE PROPERTY MGMT');
    expect(s.lines[3].description).toBe('Point of sale purchase FPOS SAMPLE GAS BAR TORONTO ON');
  });
  it('checks against opening and closing balance', () => {
    expect(s.check.status).toBe('match');
  });
  it('falls back to the running balance when there are no column headings', () => {
    const noHeader = parseStatement(
      page([
        [[50, 'Oct 1'], [110, 'Opening Balance'], [560, '1,000.00', 'r']],
        [[50, 'Oct 2'], [110, 'SAMPLE SHOP'], [400, '100.00', 'r'], [560, '900.00', 'r']],
        [[50, 'Oct 3'], [110, 'SAMPLE EMPLOYER'], [480, '500.00', 'r'], [560, '1,400.00', 'r']],
        [[50, 'Oct 31'], [110, 'Closing Balance'], [560, '1,400.00', 'r']],
      ]),
      TODAY,
      'bank',
    );
    expect(noHeader.lines.map((l) => l.outCents)).toEqual([10000, -50000]);
    expect(noHeader.check.status).toBe('match');
  });
});

import { buildLinesFromWords, fixOcrWord, type OcrWord } from '../src/lib/pdf/lines';

describe('photo words', () => {
  // Words as a photo reader returns them: a box in pixels and a confidence score.
  const word = (text: string, x0: number, y0: number, confidence = 95): OcrWord => ({
    text, x0, y0, x1: x0 + text.length * 14, y1: y0 + 30, confidence,
  });

  it('repairs common slips on amounts', () => {
    expect(fixOcrWord('S46.18')).toBe('$46.18');
    expect(fixOcrWord('46,18')).toBe('46.18');
    expect(fixOcrWord('1,234,56')).toBe('1,234.56');
    expect(fixOcrWord('1,234.56')).toBe('1,234.56');
    expect(fixOcrWord('|')).toBe('');
  });

  it('rebuilds a table row even when the page is slightly tilted', () => {
    const lines = buildLinesFromWords([
      word('46.18', 1400, 212),
      word('Oct', 100, 200),
      word('3', 160, 202),
      word('NORTHSIDE', 300, 204),
      word('PHARMACY', 450, 206),
      word('Oct', 100, 260),
      word('9', 160, 262),
      word('LITTLE', 300, 264),
      word('SPROUTS', 400, 266),
      word('32.00', 1400, 272),
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'Oct 3  NORTHSIDE PHARMACY  46.18',
      'Oct 9  LITTLE SPROUTS  32.00',
    ]);
  });

  it('keeps rows apart on a crooked photo once the tilt is known', () => {
    // 2 degrees down to the right: across 1300 pixels a row drops about 45, more than the row spacing.
    const tilt = (2 * Math.PI) / 180;
    const drop = (x: number) => Math.round(x * Math.tan(tilt));
    const w = (text: string, x: number, y: number) => word(text, x, y + drop(x));
    const crooked = [
      w('Oct', 100, 200), w('3', 160, 200), w('SAMPLE', 300, 200), w('SHOP', 400, 200), w('46.18', 1400, 200),
      w('Oct', 100, 240), w('9', 160, 240), w('SAMPLE', 300, 240), w('CAFE', 400, 240), w('32.00', 1400, 240),
    ];
    expect(buildLinesFromWords(crooked, tilt).map((l) => l.text)).toEqual([
      'Oct 3  SAMPLE SHOP  46.18',
      'Oct 9  SAMPLE CAFE  32.00',
    ]);
    // Without the correction the amounts land on the wrong rows.
    expect(buildLinesFromWords(crooked, 0).map((l) => l.text)).not.toContain('Oct 3  SAMPLE SHOP  46.18');
  });

  it('flags a line when its amount was hard to read, and carries that to the statement', () => {
    const lines = buildLinesFromWords([
      word('Oct', 100, 200), word('3', 160, 200), word('SAMPLE', 300, 200), word('SHOP', 400, 200), word('46.18', 1400, 200, 61),
      word('Oct', 100, 260), word('9', 160, 260), word('SAMPLE', 300, 260, 40), word('CAFE', 400, 260), word('32.00', 1400, 260),
    ]);
    expect(lines.map((l) => l.unsure)).toEqual([true, false]);
    const s = parseStatement(lines, TODAY, 'card');
    expect(s.lines.map((l) => l.outCents)).toEqual([4618, 3200]);
    expect(s.doubtful).toEqual([0]);
  });
});

describe('online banking list (newest first, signed amounts, running balance)', () => {
  // The layout of a bank's web page screenshot. Names and numbers are invented.
  const list = (dropRow = -1, loseDecimal = false) => {
    const rows: CellSpec[][] = [
      [[40, '01 NOV 2026'], [200, 'Interest received'], [550, loseDecimal ? '+$1250' : '+ $12.50'], [1020, '$4,512.50', 'r']],
      [[40, '23 OCT 2026'], [200, 'Payment to AMERICAN'], [740, '- $700.00'], [1020, '$4,500.00', 'r']],
      [[200, 'EXPRESS CARDS INCL LOC']],
      [[200, 'PRO']],
      [[40, '22 OCT 2026'], [200, 'Direct deposit from SAMPLE'], [550, '+ $3,000.00'], [1020, '$5,200.00', 'r']],
      [[200, 'EMPLOYER INC']],
      [[40, '21 OCT 2026'], [200, 'Auto-withdrawal by SAMPLE'], [740, '- $70.00'], [1020, '$2,200.00', 'r']],
      [[200, 'ENERGY CO']],
      [[40, '20 OCT 2026'], [200, 'Interac e-Transfer sent to'], [740, '- $350.00'], [1020, '$2,270.00', 'r']],
      [[200, 'Sample Person']],
    ];
    return page(dropRow < 0 ? rows : rows.filter((_, i) => i !== dropRow && i !== dropRow + 1));
  };

  const s = parseStatement(list(), TODAY, 'bank');
  it('reads plus as money in and minus as money out', () => {
    expect(s.lines.map((l) => l.outCents)).toEqual([-1250, 70000, -300000, 7000, 35000]);
  });
  it('joins a payee wrapped over several lines and keeps the sign out of the name', () => {
    expect(s.lines.map((l) => l.description)).toEqual([
      'Interest received',
      'Payment to AMERICAN EXPRESS CARDS INCL LOC PRO',
      'Direct deposit from SAMPLE EMPLOYER INC',
      'Auto-withdrawal by SAMPLE ENERGY CO',
      'Interac e-Transfer sent to Sample Person',
    ]);
  });
  it('passes the check when every line follows the running balance', () => {
    expect(s.check.status).toBe('match');
  });
  it('notices a missing line from the running balance and says where', () => {
    const holed = parseStatement(list(6), TODAY, 'bank');
    expect(holed.lines).toHaveLength(4);
    expect(holed.check.status).toBe('mismatch');
    expect(holed.check.message).toContain('between Oct 20 and Oct 22');
  });
  it('recovers an amount that lost its decimal point, and marks it for a look', () => {
    const fuzzy = parseStatement(list(-1, true), TODAY, 'bank');
    expect(fuzzy.lines[0]).toEqual({ date: '2026-11-01', description: 'Interest received', outCents: -1250 });
    expect(fuzzy.doubtful).toEqual([0]);
  });
  it('repairs a month read with a zero for the letter O', () => {
    expect(fixOcrWord('210CT')).toBe('21 OCT');
    expect(fixOcrWord('N0V')).toBe('NOV');
    expect(fixOcrWord('2026')).toBe('2026');
  });
});

describe('signs on card statements', () => {
  it('does not take a dash inside the name for a minus sign', () => {
    const s = parseStatement(page([[[50, 'Oct 15'], [195, 'SAMPLE - SHOP 12.00']]]), TODAY, 'card');
    expect(s.lines).toEqual([{ date: '2026-10-15', description: 'SAMPLE - SHOP', outCents: 1200 }]);
  });
  it('treats minus as a purchase on an online card list, where most lines carry one', () => {
    const s = parseStatement(
      page([
        [[40, '05 OCT 2026'], [200, 'SAMPLE SHOP'], [740, '- $20.00']],
        [[40, '04 OCT 2026'], [200, 'SAMPLE CAFE'], [740, '- $5.00']],
        [[40, '03 OCT 2026'], [200, 'PAYMENT - THANK YOU'], [550, '+ $300.00']],
        [[40, '02 OCT 2026'], [200, 'SAMPLE GROCER'], [740, '- $60.00']],
      ]),
      TODAY,
      'card',
    );
    expect(s.lines.map((l) => l.outCents)).toEqual([2000, 500, -30000, 6000]);
  });
});
