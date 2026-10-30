import { ADVANCE_TAX as A, LATE_FEE } from './rules';

export interface Payment {
  /** ISO date yyyy-mm-dd */
  date: string;
  amount: number;
  label?: string;
}

export interface AdvanceInput {
  /** Total tax liability minus TDS/TCS — "assessed tax" for 234B/234C */
  assessedTax: number;
  payments: Payment[];
  /** Income under 44AD / 44ADA: a single instalment by 15 March */
  presumptive: boolean;
  /** Resident individual aged 60+ with no business/profession income */
  seniorExempt: boolean;
  /** "Today" for planning purposes */
  asOf: string;
  /** Expected date of filing the return */
  filingDate: string;
  returnDue: string;
  totalIncome: number;
  basicExemption: number;
}

export type InstalmentStatus = 'met' | 'short' | 'due-next' | 'upcoming';

export interface InstalmentRow {
  due: string;
  pct: number;
  required: number;
  paidByDue: number;
  shortfall: number;
  interest: number;
  status: InstalmentStatus;
}

export interface AdvanceResult {
  liable: boolean;
  reason: string;
  rows: InstalmentRow[];
  paidAdvance: number;
  interest234C: number;
  /** 234C already locked in by missed past instalments */
  locked234C: number;
  interest234B: number;
  interest234A: number;
  fee234F: number;
  balanceTax: number;
  totalDueAtFiling: number;
  next: { due: string; cumulativeRequired: number; paidSoFar: number; payNow: number; daysLeft: number } | null;
  /** What happens if nothing more is paid until filing */
  ifNothingMore: { interest234C: number; interest234B: number; interest234A: number; total: number };
}

const floor100 = (n: number) => Math.max(0, Math.floor(n / 100) * 100);
const sumUntil = (payments: Payment[], date: string) =>
  payments.filter((p) => p.date <= date).reduce((s, p) => s + p.amount, 0);

const ym = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return { y, m };
};

/** Months or part of a month from `fromIso` (inclusive) to `toIso` (inclusive). */
export function monthsOrPart(fromIso: string, toIso: string): number {
  if (toIso < fromIso) return 0;
  const a = ym(fromIso);
  const b = ym(toIso);
  return (b.y - a.y) * 12 + (b.m - a.m) + 1;
}

/** Months or part after a due date (due date itself excluded). */
export function monthsAfter(dueIso: string, toIso: string): number {
  if (toIso <= dueIso) return 0;
  const next = new Date(dueIso + 'T00:00:00Z');
  next.setUTCDate(next.getUTCDate() + 1);
  return monthsOrPart(next.toISOString().slice(0, 10), toIso);
}

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

function schedule(input: AdvanceInput) {
  return input.presumptive
    ? [{ due: A.presumptiveDue, pct: 1, safePct: 1, months: 1 }]
    : A.instalments.map((i) => ({ ...i }));
}

function interestFor(input: AdvanceInput, payments: Payment[]) {
  const tax = Math.max(0, input.assessedTax);
  let c = 0;
  const rows = schedule(input).map((s) => {
    const required = tax * s.pct;
    const paid = sumUntil(payments, s.due);
    const shortfall = Math.max(0, required - paid);
    const safe = paid >= tax * s.safePct;
    const interest = safe ? 0 : floor100(shortfall) * A.interestPerMonth * s.months;
    c += interest;
    return { ...s, required, paid, shortfall: safe ? 0 : shortfall, interest };
  });
  const advance = sumUntil(payments, A.fyEnd);
  const b =
    advance < A.shortfallTrigger * tax
      ? floor100(tax - advance) * A.interestPerMonth * monthsOrPart('2027-04-01', input.filingDate)
      : 0;
  const a = floor100(tax - advance) * A.interestPerMonth * monthsAfter(input.returnDue, input.filingDate);
  return { rows, c, b, a, advance };
}

export function computeAdvanceTax(input: AdvanceInput): AdvanceResult {
  const tax = Math.max(0, input.assessedTax);
  const payments = [...input.payments].sort((x, y) => x.date.localeCompare(y.date));
  const fee234F =
    input.filingDate > input.returnDue && input.totalIncome > input.basicExemption
      ? input.totalIncome <= LATE_FEE.smallIncomeLimit
        ? LATE_FEE.smallIncome
        : LATE_FEE.normal
      : 0;

  let liable = true;
  let reason = '';
  if (input.seniorExempt) {
    liable = false;
    reason = 'Resident senior citizen with no business or professional income — advance tax is not required. Pay any balance as self-assessment tax before filing.';
  } else if (tax < A.threshold) {
    liable = false;
    reason = `Tax payable after TDS/TCS is below ₹${A.threshold.toLocaleString('en-IN')} — advance tax is not required.`;
  } else {
    reason = input.presumptive
      ? 'Presumptive income (44AD/44ADA): pay 100% of advance tax by 15 March. Earlier payments are fine too.'
      : 'Tax payable after TDS/TCS is ₹10,000 or more — advance tax is due in four instalments.';
  }

  const paidAdvance = sumUntil(payments, A.fyEnd);
  const balanceTax = Math.max(0, tax - paidAdvance);

  if (!liable) {
    const a = floor100(balanceTax) * A.interestPerMonth * monthsAfter(input.returnDue, input.filingDate);
    return {
      liable, reason, rows: [], paidAdvance, interest234C: 0, locked234C: 0, interest234B: 0,
      interest234A: a, fee234F, balanceTax, totalDueAtFiling: balanceTax + a + fee234F, next: null,
      ifNothingMore: { interest234C: 0, interest234B: 0, interest234A: a, total: a },
    };
  }

  // Actual: past instalments use real payments; future ones assume you pay on schedule.
  const sched = schedule(input);
  const paidSoFar = sumUntil(payments, input.asOf);
  const assumed: Payment[] = [...payments];
  let running = paidSoFar;
  for (const s of sched) {
    if (s.due < input.asOf) continue;
    const need = tax * s.pct - running;
    if (need > 0) {
      assumed.push({ date: s.due, amount: need });
      running += need;
    }
  }
  const planned = interestFor(input, assumed);
  const nothing = interestFor(input, payments);

  const nextIdx = sched.findIndex((s) => s.due >= input.asOf);
  const rows: InstalmentRow[] = planned.rows.map((r, i) => {
    const isPast = r.due < input.asOf;
    const actualPaid = sumUntil(payments, r.due);
    let status: InstalmentStatus = 'upcoming';
    if (isPast) status = r.interest > 0 ? 'short' : 'met';
    else if (i === nextIdx) status = 'due-next';
    return {
      due: r.due,
      pct: r.pct,
      required: r.required,
      paidByDue: isPast ? actualPaid : Math.min(actualPaid, r.required),
      shortfall: isPast ? r.shortfall : Math.max(0, r.required - paidSoFar),
      interest: isPast ? r.interest : 0,
      status,
    };
  });
  const locked234C = rows.reduce((s, r) => s + r.interest, 0);

  let next: AdvanceResult['next'] = null;
  if (nextIdx >= 0) {
    const s = sched[nextIdx];
    next = {
      due: s.due,
      cumulativeRequired: tax * s.pct,
      paidSoFar,
      payNow: Math.max(0, tax * s.pct - paidSoFar),
      daysLeft: daysBetween(input.asOf, s.due),
    };
  } else if (input.asOf <= A.fyEnd && balanceTax > 0) {
    next = { due: A.fyEnd, cumulativeRequired: tax, paidSoFar, payNow: balanceTax, daysLeft: daysBetween(input.asOf, A.fyEnd) };
  }

  return {
    liable,
    reason,
    rows,
    paidAdvance,
    interest234C: planned.c,
    locked234C,
    interest234B: planned.b,
    interest234A: planned.a,
    fee234F,
    balanceTax,
    next,
    totalDueAtFiling: balanceTax + planned.b + planned.a + planned.c + fee234F,
    ifNothingMore: {
      interest234C: nothing.c,
      interest234B: nothing.b,
      interest234A: nothing.a,
      total: nothing.c + nothing.b + nothing.a,
    },
  };
}
