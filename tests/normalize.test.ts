import { describe, expect, it } from 'vitest';
import { displayName, isGenericKey, maskDigits, merchantKey } from '../src/lib/normalize';

describe('merchantKey', () => {
  it('strips store numbers, cities and provinces', () => {
    expect(merchantKey('TIM HORTONS #1234        TORONTO ON')).toBe('TIM HORTONS');
    expect(merchantKey('TIM HORTONS #0098        NORTH YORK ON')).toBe('TIM HORTONS');
    expect(merchantKey('TIM HORTONS 4471 MISSISSAUGA ON')).toBe('TIM HORTONS');
    expect(merchantKey('NORTHSIDE PHARMACY #204')).toBe('NORTHSIDE PHARMACY');
  });
  it('strips payment processor prefixes', () => {
    expect(merchantKey('SQ *LITTLE SPROUTS PLAY')).toBe('LITTLE SPROUTS PLAY');
    expect(merchantKey('TST* SAMPLE NOODLE HOUSE  TORONTO ON')).toBe('SAMPLE NOODLE HOUSE');
    expect(merchantKey('PAYPAL *SAMPLESHOP')).toBe('SAMPLESHOP');
    expect(merchantKey('FPOS SAMPLE GAS BAR TORONTO ON')).toBe('SAMPLE GAS BAR');
  });
  it('maps every visit to one key', () => {
    const a = merchantKey('SQ *LITTLE SPROUTS PLAY #204  TORONTO ON');
    const b = merchantKey('LITTLE SPROUTS PLAY 0031 TORONTO ON');
    expect(a).toBe(b);
  });
  it('drops order codes after a star', () => {
    expect(merchantKey('AMZN MKTP CA*1A2B3C4D5')).toBe('AMZN MKTP CA');
    expect(merchantKey('UBER *EATS')).toBe('UBER EATS');
  });
  it('never keeps long digit runs', () => {
    expect(merchantKey('SAMPLE UTILITY 4500123456789012')).toBe('SAMPLE UTILITY');
    expect(merchantKey('TRANSFER TO 123456789')).toBe('TRANSFER TO');
    expect(merchantKey('SAMPLE CO 4500 1234 5678 9012')).toBe('SAMPLE CO');
  });
  it('keeps names that only look like places', () => {
    expect(merchantKey('TORONTO HYDRO')).toBe('TORONTO HYDRO');
    expect(merchantKey('LONDON DRUGS')).toBe('LONDON DRUGS');
  });
  it('never returns an empty key', () => {
    expect(merchantKey('123456789')).toBe('UNKNOWN MERCHANT');
  });
});

describe('online banking wording', () => {
  it('keeps just the payee, so recurring bills can be remembered', () => {
    expect(merchantKey('Auto-withdrawal by SAMPLE ENERGY CO')).toBe('SAMPLE ENERGY CO');
    expect(merchantKey('Direct deposit from SAMPLE EMPLOYER INC')).toBe('SAMPLE EMPLOYER INC');
    expect(isGenericKey(merchantKey('Auto-withdrawal by SAMPLE ENERGY CO'))).toBe(false);
  });
  it('still treats e-transfers and cash withdrawals as one-offs', () => {
    expect(isGenericKey(merchantKey('Interac e-Transfer sent to Sample Person'))).toBe(true);
    expect(isGenericKey(merchantKey('ATM WITHDRAWAL'))).toBe(true);
    expect(isGenericKey('WITHDRAWAL')).toBe(true);
  });
});

describe('maskDigits', () => {
  it('hides runs of six or more digits and card-like groups', () => {
    expect(maskDigits('statement_4500123412341234.csv')).toBe('statement_••••.csv');
    expect(maskDigits('acct 123456')).toBe('acct ••••');
    expect(maskDigits('4500 1234 5678 9012')).toBe('••••');
  });
  it('leaves short numbers alone', () => {
    expect(maskDigits('october-2026.csv')).toBe('october-2026.csv');
  });
});

describe('displayName', () => {
  it('title-cases but keeps known short forms', () => {
    expect(displayName('LITTLE SPROUTS PLAY')).toBe('Little Sprouts Play');
    expect(displayName('LCBO')).toBe('LCBO');
    expect(displayName('NETFLIX.COM')).toBe('netflix.com');
  });
});
