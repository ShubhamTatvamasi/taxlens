import { describe, expect, it } from 'vitest';
import { computeAdvanceTax, monthsAfter, monthsOrPart, type AdvanceInput } from '../src/lib/tax/advance';

const base: AdvanceInput = {
  assessedTax: 1_00_000,
  payments: [],
  presumptive: false,
  seniorExempt: false,
  asOf: '2026-10-30',
  filingDate: '2027-07-31',
  returnDue: '2027-07-31',
  totalIncome: 15_00_000,
  basicExemption: 4_00_000,
};

describe('advance tax', () => {
  it('on track: next instalment is December', () => {
    const r = computeAdvanceTax({ ...base, payments: [{ date: '2026-06-15', amount: 15_000 }, { date: '2026-09-15', amount: 30_000 }] });
    expect(r.rows.map((x) => x.status)).toEqual(['met', 'met', 'due-next', 'upcoming']);
    expect(r.next?.due).toBe('2026-12-15');
    expect(r.next?.payNow).toBe(30_000);
    expect(r.locked234C).toBe(0);
    expect(r.interest234B).toBe(0);
  });

  it('234C on missed June and September', () => {
    const r = computeAdvanceTax({ ...base, payments: [{ date: '2026-07-01', amount: 10_000 }] });
    expect(r.rows[0].interest).toBe(450);
    expect(r.rows[1].interest).toBe(1_050);
    expect(r.locked234C).toBe(1_500);
  });

  it('234B when less than 90% is paid by 31 March', () => {
    const r = computeAdvanceTax({ ...base, asOf: '2027-04-10', payments: [{ date: '2027-03-10', amount: 50_000 }] });
    expect(r.interest234B).toBe(2_000);
  });

  it('234A and 234F for late filing', () => {
    const r = computeAdvanceTax({ ...base, assessedTax: 5_000, filingDate: '2027-09-05' });
    expect(r.liable).toBe(false);
    expect(r.interest234A).toBe(100);
    expect(r.fee234F).toBe(5_000);
  });

  it('below ₹10,000 is not liable', () => {
    expect(computeAdvanceTax({ ...base, assessedTax: 9_999 }).liable).toBe(false);
  });

  it('senior without business is exempt', () => {
    expect(computeAdvanceTax({ ...base, seniorExempt: true }).liable).toBe(false);
  });

  it('presumptive has a single March instalment', () => {
    const r = computeAdvanceTax({ ...base, presumptive: true });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].due).toBe('2027-03-15');
  });

  it('counts months or part', () => {
    expect(monthsOrPart('2027-04-01', '2027-07-31')).toBe(4);
    expect(monthsAfter('2027-07-31', '2027-08-01')).toBe(1);
    expect(monthsAfter('2027-07-31', '2027-07-31')).toBe(0);
  });
});
