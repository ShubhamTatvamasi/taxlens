import { describe, expect, it } from 'vitest';
import { compareRegimes, computeRegime, emptyInput, type TaxInput } from '../src/lib/tax/engine';

const make = (patch: (i: TaxInput) => void): TaxInput => {
  const i = emptyInput();
  patch(i);
  return i;
};

describe('new regime', () => {
  it('zero tax up to ₹12L for a resident individual (87A)', () => {
    const r = computeRegime(make((i) => (i.other.other = 12_00_000)), 'new');
    expect(r.rebate).toBe(60_000);
    expect(r.totalTax).toBe(0);
  });

  it('applies marginal relief just above ₹12L', () => {
    const r = computeRegime(make((i) => (i.other.other = 12_10_000)), 'new');
    expect(r.marginalRelief).toBe(51_500);
    expect(r.totalTax).toBe(10_400);
  });

  it('salaried ₹12.75L is tax-free after standard deduction', () => {
    const r = computeRegime(make((i) => (i.salary.gross = 12_75_000)), 'new');
    expect(r.totalIncome).toBe(12_00_000);
    expect(r.totalTax).toBe(0);
  });

  it('HUF gets no 87A rebate', () => {
    const r = computeRegime(make((i) => {
      i.profile.type = 'huf';
      i.other.depositInterest = 7_00_000;
    }), 'new');
    expect(r.rebate).toBe(0);
    expect(r.totalTax).toBe(15_600);
  });

  it('surcharge at 10% above ₹50L', () => {
    const r = computeRegime(make((i) => (i.other.other = 60_00_000)), 'new');
    // slab tax 13.8L, surcharge 1.38L
    expect(r.surcharge).toBeCloseTo(1_38_000, 0);
    expect(r.totalTax).toBe(15_78_720);
  });

  it('marginal relief on surcharge just above ₹50L', () => {
    const r = computeRegime(make((i) => (i.other.other = 50_10_000)), 'new');
    // capped at tax on ₹50L (10.8L) + ₹10,000 excess
    expect(r.surchargeRelief).toBeCloseTo(1_01_300, 0);
    expect(r.totalTax).toBe(11_33_600);
  });

  it('unused basic exemption absorbs STCG 111A; rebate does not cover special-rate tax', () => {
    const r = computeRegime(make((i) => {
      i.other.other = 2_00_000;
      i.gains.stcg111A = 5_00_000;
    }), 'new');
    expect(r.totalIncome).toBe(7_00_000);
    expect(r.totalTax).toBe(62_400);
  });

  it('LTCG 112A exemption of ₹1.25L plus basic exemption for HUF', () => {
    const r = computeRegime(make((i) => {
      i.profile.type = 'huf';
      i.gains.ltcg112A = 3_00_000;
    }), 'new');
    expect(r.totalTax).toBe(0);
  });

  it('agricultural income partial integration', () => {
    const r = computeRegime(make((i) => {
      i.profile.type = 'huf';
      i.other.other = 10_00_000;
      i.other.agricultural = 2_00_000;
    }), 'new');
    expect(r.totalTax).toBe(52_000);
  });

  it('winnings taxed flat 30% without exemption', () => {
    const r = computeRegime(make((i) => (i.other.winnings = 1_00_000)), 'new');
    expect(r.totalTax).toBe(31_200);
  });

  it('house property loss cannot be set off in new regime', () => {
    const r = computeRegime(make((i) => {
      i.other.other = 10_00_000;
      i.house.letOutRent = 1_00_000;
      i.house.letOutInterest = 3_00_000;
    }), 'new');
    expect(r.heads.house).toBe(0);
    expect(r.carryForward.length).toBe(1);
  });
});

describe('old regime', () => {
  it('applies 80C and 80D', () => {
    const r = computeRegime(make((i) => {
      i.other.other = 10_00_000;
      i.deductions.d80C = 2_00_000;
      i.deductions.d80DSelf = 30_000;
    }), 'old');
    expect(r.deductions).toBe(1_75_000);
    expect(r.totalTax).toBe(80_600);
  });

  it('87A rebate up to ₹5L', () => {
    const r = computeRegime(make((i) => (i.other.other = 5_00_000)), 'old');
    expect(r.totalTax).toBe(0);
  });

  it('senior citizen gets ₹3L exemption and 80TTB', () => {
    const r = computeRegime(make((i) => {
      i.profile.age = 'senior';
      i.other.depositInterest = 8_00_000;
    }), 'old');
    // 7.5L after 80TTB: 10,000 + 50,000 = 60,000 + 4%
    expect(r.totalTax).toBe(62_400);
  });

  it('HUF gets 80TTA but not 80CCD(1B)', () => {
    const r = computeRegime(make((i) => {
      i.profile.type = 'huf';
      i.other.savingsInterest = 20_000;
      i.other.other = 6_00_000;
      i.deductions.d80CCD1B = 50_000;
    }), 'old');
    expect(r.deductions).toBe(10_000);
  });

  it('house property loss capped at ₹2L set-off', () => {
    const r = computeRegime(make((i) => {
      i.other.other = 10_00_000;
      i.house.selfOccupiedInterest = 3_00_000;
    }), 'old');
    expect(r.heads.house).toBe(-2_00_000);
    expect(r.totalIncome).toBe(8_00_000);
  });
});

describe('presumptive & comparison', () => {
  it('44ADA deems 50% of receipts', () => {
    const r = computeRegime(make((i) => {
      i.business.mode = '44ADA';
      i.business.grossReceipts = 40_00_000;
    }), 'new');
    expect(r.heads.business).toBe(20_00_000);
  });

  it('44AD at 6% digital / 8% cash', () => {
    const r = computeRegime(make((i) => {
      i.business.mode = '44AD';
      i.business.turnoverDigital = 1_00_00_000;
      i.business.turnoverCash = 10_00_000;
    }), 'new');
    expect(r.heads.business).toBe(6_80_000);
  });

  it('picks the cheaper regime and finds the break-even', () => {
    const c = compareRegimes(make((i) => (i.salary.gross = 20_00_000)));
    expect(c.better).toBe('new');
    expect(c.oldBreakEven).toBeGreaterThan(0);
    const withDed = compareRegimes(make((i) => {
      i.salary.gross = 20_00_000;
      i.deductions.other = c.oldBreakEven!;
    }));
    expect(withDed.old.totalTax).toBeLessThanOrEqual(withDed.new.totalTax);
  });
});
