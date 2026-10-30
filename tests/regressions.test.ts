import { describe, expect, it } from 'vitest';
import { computeRegime, emptyInput, type TaxInput } from '../src/lib/tax/engine';
import { classify } from '../src/lib/statement/classify';
import type { Transaction } from '../src/lib/statement/hdfc';
import { parseAmount } from '../src/lib/format';

const make = (patch: (i: TaxInput) => void): TaxInput => {
  const i = emptyInput();
  patch(i);
  return i;
};
const tx = (narration: string, credit: boolean): Transaction => ({
  id: narration, date: '2026-06-01', valueDate: '2026-06-01', narration, ref: '', balance: 0, balanceOk: true, source: 't',
  withdrawal: credit ? 0 : 1000, deposit: credit ? 1000 : 0,
});
const cls = (n: string, credit: boolean) => classify(tx(n, credit), { ownNames: ['SOME PERSON'] });

describe('classifier regressions', () => {
  it('bare ACH credits are not dividends', () => {
    expect(cls('ACH C- ICCL ZERODHA BROKING', true)).toBe('sale_proceeds');
    expect(cls('ACH C- EXAMPLE LTD FINAL DIVIDEND', true)).toBe('dividend');
  });
  it('property tax / GST are not advance income tax', () => {
    expect(cls('BILLDESK-CITY PROPERTY TAX PAYMENT', false)).not.toBe('tax_advance');
    expect(cls('GST TAX PAYMENT CBIC', false)).not.toBe('tax_advance');
    expect(cls('POS 400000XXXXXX0000 PAY*CBDT TIN 2 0', false)).toBe('tax_advance');
  });
  it('names and words are not mistaken for deductions or rent', () => {
    expect(cls('UPI-PRANAV KUMAR-pranav@okfake-LUNCH', false)).toBe('expense');
    expect(cls('UPI-SUKANYA S-suk@okfake-DINNER', false)).toBe('expense');
    expect(cls('SUKANYA SAMRIDDHI DEPOSIT', false)).toBe('ded_80c');
    expect(cls('NEFT CR-EXAMPLE FUND RELEASE', true)).not.toBe('rent');
    expect(cls('EXAMPLE EDUCATIONAL TRUST-SCHOOL FEE', false)).not.toBe('ded_80g');
  });
  it('family pension has its own category', () => {
    expect(cls('NEFT CR-TREASURY FAMILY PENSION', true)).toBe('family_pension');
    expect(cls('NEFT CR-TREASURY PENSION', true)).toBe('salary');
  });
});

describe('engine regressions', () => {
  it('an indexed property gain of 0 is respected', () => {
    const r = computeRegime(make((i) => {
      i.other.other = 20_00_000;
      i.gains.ltcgProperty = 10_00_000;
      i.gains.ltcgPropertyIndexed = 0;
      i.gains.indexationOption = true;
    }), 'new');
    expect(r.totalTax).toBe(2_08_000);
  });
  it('surcharge marginal relief applies to property LTCG', () => {
    const r = computeRegime(make((i) => (i.gains.ltcgProperty = 50_10_000)), 'new');
    expect(r.totalTax).toBe(6_08_400);
  });
  it('business loss is set off against special-rate gains', () => {
    const withLoss = computeRegime(make((i) => {
      i.salary.gross = 10_75_000;
      i.business.mode = 'regular';
      i.business.netProfit = -5_00_000;
      i.gains.stcg111A = 5_00_000;
    }), 'new');
    const salaryOnly = computeRegime(make((i) => (i.salary.gross = 10_75_000)), 'new');
    expect(withLoss.carryForward).toEqual([]);
    expect(withLoss.heads.capitalGains).toBe(0);
    expect(withLoss.totalTax).toBe(salaryOnly.totalTax);
  });
  it('old-regime 87A does not cover winnings', () => {
    expect(computeRegime(make((i) => (i.other.winnings = 3_00_000)), 'old').totalTax).toBe(93_600);
  });
  it('negative amounts can be typed for losses', () => {
    expect(parseAmount('-5,00,000')).toBe(-5_00_000);
    expect(parseAmount('−1.5L')).toBe(-1_50_000);
  });
});
