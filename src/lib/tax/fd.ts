import { TAX_YEAR, TDS_BANK_INTEREST_THRESHOLD } from './rules';

export type FdPayout = 'cumulative' | 'quarterly' | 'monthly';

export interface FixedDeposit {
  id: string;
  label: string;
  principal: number;
  /** Annual rate in percent, e.g. 7.1 */
  ratePct: number;
  /** ISO dates */
  start: string;
  maturity: string;
  payout: FdPayout;
  include: boolean;
}

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(iso + 'T00:00:00Z');
const days = (a: string, b: string) => Math.max(0, (t(b) - t(a)) / DAY);

/**
 * Value of a cumulative FD `elapsed` days after booking. Indian banks compound
 * quarterly; deposits under 6 months earn simple interest.
 */
function cumulativeValue(fd: FixedDeposit, elapsed: number): number {
  const r = fd.ratePct / 100;
  const tenure = days(fd.start, fd.maturity);
  if (tenure < 182) return fd.principal * (1 + (r * elapsed) / 365);
  return fd.principal * Math.pow(1 + r / 4, (4 * elapsed) / 365);
}

/** Interest accruing on the FD between two dates (accrual basis, as banks report in AIS/26AS). */
export function fdInterestBetween(fd: FixedDeposit, from: string, to: string): number {
  if (!fd.principal || !fd.ratePct || !fd.start || !fd.maturity) return 0;
  const a = from > fd.start ? from : fd.start;
  const b = to < fd.maturity ? to : fd.maturity;
  if (b <= a) return 0;
  if (fd.payout === 'cumulative') {
    return cumulativeValue(fd, days(fd.start, b)) - cumulativeValue(fd, days(fd.start, a));
  }
  return (fd.principal * (fd.ratePct / 100) * days(a, b)) / 365;
}

/** Interest for the tax year, with the FY end inclusive. */
export function fdInterestForYear(fd: FixedDeposit): number {
  const end = new Date(t(TAX_YEAR.end) + DAY).toISOString().slice(0, 10);
  return fdInterestBetween(fd, TAX_YEAR.start, end);
}

export function fdMaturityValue(fd: FixedDeposit): number {
  if (fd.payout !== 'cumulative') return fd.principal;
  return cumulativeValue(fd, days(fd.start, fd.maturity));
}

/** Rough TDS a bank would deduct (10%) once yearly interest crosses the threshold. */
export function estimatedBankTds(totalInterestAtBank: number, senior: boolean, panGiven = true): number {
  const limit = senior ? TDS_BANK_INTEREST_THRESHOLD.senior : TDS_BANK_INTEREST_THRESHOLD.normal;
  if (totalInterestAtBank <= limit) return 0;
  return totalInterestAtBank * (panGiven ? 0.1 : 0.2);
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(t(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
