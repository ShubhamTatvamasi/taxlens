import { describe, expect, it } from 'vitest';
import { fdInterestBetween, fdInterestForYear, type FixedDeposit } from '../src/lib/tax/fd';

const fd = (p: Partial<FixedDeposit>): FixedDeposit => ({
  id: 'x', label: 'x', principal: 1_00_000, ratePct: 7, start: '2026-04-01', maturity: '2027-04-01', payout: 'cumulative', include: true, ...p,
});

describe('FD accrual', () => {
  it('quarterly compounding over a year', () => {
    expect(fdInterestForYear(fd({}))).toBeCloseTo(7_185.9, 0);
  });
  it('payout FD is simple interest within the year', () => {
    expect(fdInterestForYear(fd({ payout: 'quarterly' }))).toBeCloseTo(7_000, 0);
  });
  it('splits accrual across years', () => {
    const f = fd({ start: '2026-10-01', maturity: '2027-10-01' });
    const thisYear = fdInterestForYear(f);
    const nextYear = fdInterestBetween(f, '2027-04-01', '2027-10-01');
    expect(thisYear + nextYear).toBeCloseTo(7_185.9, 0);
    expect(thisYear).toBeLessThan(nextYear);
  });
});
