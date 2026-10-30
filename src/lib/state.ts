import { computeAdvanceTax, type AdvanceResult, type Payment } from './tax/advance';
import { compareRegimes, emptyInput, slabsFor, type Comparison, type Regime, type TaxInput } from './tax/engine';
import { estimatedBankTds, fdInterestForYear, type FixedDeposit } from './tax/fd';
import {
  CASH_RECEIPT_LIMIT_269ST,
  GIFT_EXEMPT_LIMIT,
  LTCG_112A_EXEMPTION,
  REBATE,
  RETURN_DUE,
  SFT_CASH_DEPOSIT_LIMIT,
  TAX_YEAR,
  TDS_BANK_INTEREST_THRESHOLD,
} from './tax/rules';
import { CATEGORIES, classify, isCashDeposit, ownNamesFromHolder, type Category } from './statement/classify';
import type { StatementMeta, Transaction } from './statement/hdfc';
import { money } from './format';

export interface LoadedStatement {
  meta: StatementMeta;
  warnings: string[];
}

export interface AppState {
  version: 1;
  statements: LoadedStatement[];
  transactions: Transaction[];
  /** User corrections, keyed by transaction id */
  overrides: Record<string, Category>;
  /** Split part of a tax refund that is interest, keyed by transaction id */
  refundInterest: Record<string, number>;
  recurring: Partial<Record<Category, boolean>>;
  project: boolean;
  manual: TaxInput;
  fds: FixedDeposit[];
  payments: Payment[];
  regimeChoice: 'auto' | Regime;
  asOf: string;
  filingDate: string;
  /** Senior status for the bank's TDS threshold on FDs */
  remember: boolean;
}

export const defaultState = (today: string): AppState => ({
  version: 1,
  statements: [],
  transactions: [],
  overrides: {},
  refundInterest: {},
  recurring: Object.fromEntries(
    (Object.keys(CATEGORIES) as Category[]).filter((c) => CATEGORIES[c].recurring).map((c) => [c, true]),
  ),
  project: true,
  manual: emptyInput(),
  fds: [],
  payments: [],
  regimeChoice: 'auto',
  asOf: today < TAX_YEAR.start ? TAX_YEAR.start : today,
  filingDate: RETURN_DUE.noBusiness,
  remember: false,
});

export function holderNames(state: AppState): string[] {
  return [...new Set(state.statements.flatMap((s) => ownNamesFromHolder(s.meta.holderName)))];
}

export function categoryOf(state: AppState, t: Transaction, names = holderNames(state)): Category {
  return state.overrides[t.id] ?? classify(t, { ownNames: names });
}

export const inYear = (iso: string) => iso >= TAX_YEAR.start && iso <= TAX_YEAR.end;

export interface CategoryTotal {
  category: Category;
  count: number;
  actual: number;
  projected: number;
}

export interface Insight {
  level: 'info' | 'warn' | 'action' | 'good';
  title: string;
  body: string;
}

export interface Derived {
  names: string[];
  categorized: { t: Transaction; category: Category }[];
  inYearCount: number;
  outOfYear: number;
  coverage: { from: string; to: string; days: number; factor: number };
  totals: CategoryTotal[];
  byCategory: Partial<Record<Category, CategoryTotal>>;
  fdInterest: number;
  statementPayments: Payment[];
  allPayments: Payment[];
  input: TaxInput;
  comparison: Comparison;
  regime: Regime;
  advance: AdvanceResult;
  insights: Insight[];
  estimatedFdTds: number;
}

const DAY = 86_400_000;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;

function coverageOf(state: AppState) {
  const froms = state.statements.map((s) => s.meta.from).filter(Boolean);
  const tos = state.statements.map((s) => s.meta.to).filter(Boolean);
  const txDates = state.transactions.map((t) => t.date).sort();
  let from = froms.sort()[0] ?? txDates[0] ?? TAX_YEAR.start;
  let to = tos.sort().slice(-1)[0] ?? txDates.slice(-1)[0] ?? TAX_YEAR.start;
  if (from < TAX_YEAR.start) from = TAX_YEAR.start;
  if (to > TAX_YEAR.end) to = TAX_YEAR.end;
  const days = to >= from ? dayDiff(from, to) : 0;
  const yearDays = dayDiff(TAX_YEAR.start, TAX_YEAR.end);
  return { from, to, days, factor: days > 0 && state.project ? Math.max(1, yearDays / days) : 1 };
}

export function derive(state: AppState): Derived {
  const names = holderNames(state);
  const categorized = state.transactions.map((t) => ({ t, category: categoryOf(state, t, names) }));
  const yearTx = categorized.filter((c) => inYear(c.t.date));
  const coverage = coverageOf(state);

  const byCategory: Partial<Record<Category, CategoryTotal>> = {};
  for (const { t, category } of yearTx) {
    const amt = t.deposit || t.withdrawal;
    const ct = (byCategory[category] ??= { category, count: 0, actual: 0, projected: 0 });
    ct.count++;
    ct.actual += amt;
  }
  for (const ct of Object.values(byCategory)) {
    if (!ct) continue;
    ct.projected = state.recurring[ct.category] ? ct.actual * coverage.factor : ct.actual;
  }
  const totals = Object.values(byCategory).filter(Boolean) as CategoryTotal[];
  const p = (c: Category) => byCategory[c]?.projected ?? 0;

  // Interest included in tax refunds
  const refundInterest = yearTx
    .filter((c) => c.category === 'tax_refund')
    .reduce((s, c) => s + (state.refundInterest[c.t.id] ?? 0), 0);

  const fdInterest = state.fds.filter((f) => f.include).reduce((s, f) => s + fdInterestForYear(f), 0);

  const statementPayments: Payment[] = yearTx
    .filter((c) => c.category === 'tax_advance' && c.t.date <= TAX_YEAR.end)
    .map((c) => ({ date: c.t.date, amount: c.t.withdrawal, label: 'From statement' }));
  const allPayments = [...statementPayments, ...state.payments].sort((a, b) => a.date.localeCompare(b.date));

  // ---- Build the tax input: manual values plus what the statement shows ----
  const m = state.manual;
  const mode = m.business.mode;
  const receipts = p('business_receipt');
  const rentPaid = p('rent_paid');
  const input: TaxInput = {
    ...m,
    salary: {
      ...m.salary,
      gross: m.salary.gross > 0 ? m.salary.gross : p('salary'),
      rentPaid: m.salary.rentPaid > 0 ? m.salary.rentPaid : m.salary.hraReceived > 0 ? rentPaid : 0,
    },
    house: { ...m.house, letOutRent: m.house.letOutRent + p('rent') },
    business: {
      ...m.business,
      grossReceipts: mode === '44ADA' && m.business.grossReceipts <= 0 ? receipts : m.business.grossReceipts,
      turnoverDigital: mode === '44AD' && m.business.turnoverDigital <= 0 ? receipts : m.business.turnoverDigital,
    },
    other: {
      ...m.other,
      savingsInterest: m.other.savingsInterest + p('savings_interest'),
      depositInterest: m.other.depositInterest + p('fd_interest') + fdInterest,
      dividend: m.other.dividend + p('dividend'),
      refundInterest: m.other.refundInterest + p('refund_interest') + refundInterest,
      giftsFromOthers: m.other.giftsFromOthers + p('gift_nonrelative'),
      other: m.other.other + p('other_taxable'),
      agricultural: m.other.agricultural + p('agri'),
    },
    deductions: {
      ...m.deductions,
      d80C: m.deductions.d80C + p('ded_80c'),
      d80DSelf: m.deductions.d80DSelf + p('ded_80d'),
      d80G: m.deductions.d80G + p('ded_80g'),
      rentPaidNoHra: m.deductions.rentPaidNoHra > 0 ? m.deductions.rentPaidNoHra : m.salary.hraReceived > 0 ? 0 : rentPaid,
    },
  };

  const comparison = compareRegimes(input);
  const regime: Regime = state.regimeChoice === 'auto' ? comparison.better : state.regimeChoice;
  const chosen = comparison[regime];

  const isInd = input.profile.type === 'individual';
  const senior = isInd && input.profile.age !== 'below60';
  const returnDue =
    mode === 'none' ? RETURN_DUE.noBusiness : input.business.audit ? RETURN_DUE.audit : RETURN_DUE.businessNonAudit;

  const advance = computeAdvanceTax({
    assessedTax: chosen.netPayable,
    payments: allPayments,
    presumptive: mode === '44AD' || mode === '44ADA',
    seniorExempt: senior && input.profile.resident && mode === 'none',
    asOf: state.asOf,
    filingDate: state.filingDate,
    returnDue,
    totalIncome: chosen.totalIncome,
    basicExemption: slabsFor(regime, input.profile)[0][0],
  });

  const bankInterest = input.other.depositInterest;
  const estimatedFdTds = estimatedBankTds(bankInterest, senior);

  const insights = buildInsights({ state, input, yearTx, byCategory, comparison, regime, advance, coverage, names, estimatedFdTds, returnDue });

  return {
    names,
    categorized,
    inYearCount: yearTx.length,
    outOfYear: categorized.length - yearTx.length,
    coverage,
    totals,
    byCategory,
    fdInterest,
    statementPayments,
    allPayments,
    input,
    comparison,
    regime,
    advance,
    insights,
    estimatedFdTds,
  };
}

interface InsightCtx {
  state: AppState;
  input: TaxInput;
  yearTx: { t: Transaction; category: Category }[];
  byCategory: Partial<Record<Category, CategoryTotal>>;
  comparison: Comparison;
  regime: Regime;
  advance: AdvanceResult;
  coverage: Derived['coverage'];
  names: string[];
  estimatedFdTds: number;
  returnDue: string;
}

function buildInsights(c: InsightCtx): Insight[] {
  const out: Insight[] = [];
  const { input, byCategory, comparison, state } = c;
  const isHuf = input.profile.type === 'huf';
  const chosen = comparison[c.regime];
  const sum = (k: Category) => byCategory[k]?.actual ?? 0;
  const cnt = (k: Category) => byCategory[k]?.count ?? 0;

  if (cnt('review'))
    out.push({
      level: 'action',
      title: `${plural(cnt('review'), 'credit')} need${cnt('review') === 1 ? 's' : ''} review (${money(sum('review'))})`,
      body: 'Unrecognised credits are excluded from income until you classify them — e.g. rent, professional fees, gifts, loan repayments or transfers from family. Open the Transactions tab and filter by "Needs review".',
    });

  if (cnt('tax_advance'))
    out.push({
      level: 'action',
      title: `${plural(cnt('tax_advance'), 'tax payment')} found (${money(sum('tax_advance'))})`,
      body: 'Payments to the Income Tax Department are treated as advance tax for this PAN and this year. If any were self-assessment for an earlier year or paid for someone else, re-categorise them — otherwise advance-tax credit and interest will be wrong. Cross-check in Form 26AS / AIS (Part C).',
    });

  if (state.statements.length && c.coverage.days > 0 && c.coverage.days < 360)
    out.push({
      level: 'info',
      title: `Statement covers ${c.coverage.days} days of the tax year`,
      body: state.project
        ? `Recurring categories are projected ×${c.coverage.factor.toFixed(2)} to a full year. Advance tax is based on the estimated income for the whole year.`
        : 'Projection is off — tax is computed only on income seen so far. Advance tax is based on the estimated income for the whole year, so add expected income for the remaining months.',
    });

  const fdBooked = c.yearTx.filter((x) => x.category === 'fd_booked');
  if (fdBooked.length && fdBooked.length > state.fds.length)
    out.push({
      level: 'action',
      title: `${plural(fdBooked.length, 'FD booking')} found`,
      body: 'Interest on cumulative FDs accrues every year even though it is paid at maturity, and banks report it in AIS on accrual. Add each FD with its rate and maturity in the FD planner.',
    });

  if (isHuf && cnt('own_transfer_in'))
    out.push({
      level: 'warn',
      title: 'Money received from a member — clubbing (Sec 64(2))',
      body: `${money(sum('own_transfer_in'))} came in from a member’s account. A gift from a member to the HUF is not taxable, but if a member transfers their own funds to the HUF without adequate consideration, the income earned on those funds (FD interest, gains) is clubbed with that member’s income — not the HUF’s. Funds that are gifts from relatives who aren’t members, ancestral property, or the HUF’s own earnings avoid this.`,
    });

  if (isHuf) {
    out.push({
      level: 'info',
      title: 'HUF essentials',
      body: 'An HUF gets the same slabs as an individual below 60 but no 87A rebate, no standard deduction, no 80CCD/80E/80GG and no 44ADA. 80C (members’ insurance, ELSS), 80D (members), 80G and 80TTA are allowed in the old regime. The HUF can pick the regime every year when filing if it has no business income.',
    });
    if (comparison.new.totalIncome > 4_00_000 && comparison.new.totalIncome <= REBATE.new.incomeLimit)
      out.push({
        level: 'warn',
        title: 'Income up to ₹12 lakh is not tax-free for an HUF',
        body: `The ₹12 lakh "zero tax" limit comes from the 87A rebate, which is only for resident individuals. This HUF pays ${money(comparison.new.totalTax)} in the new regime.`,
      });
  }

  const ti = comparison.new.totalIncome;
  if (!isHuf && input.profile.resident && ti > REBATE.new.incomeLimit && ti < 12_75_000)
    out.push({
      level: 'info',
      title: 'Just above the ₹12 lakh rebate limit',
      body: 'Marginal relief applies — tax cannot exceed the income above ₹12 lakh. An extra employer NPS contribution (80CCD(2)) can bring income back under ₹12 lakh in the new regime.',
    });

  if (comparison.better === 'old' && comparison.saving > 0)
    out.push({ level: 'good', title: `Old regime saves ${money(comparison.saving)}`, body: 'Your deductions outweigh the lower new-regime slabs.' + (input.business.mode !== 'none' ? ' With business income, choosing the old regime needs Form 10-IEA before the due date, and you can switch back only once.' : ' Choose it in the return itself (no business income — you can switch every year).') });
  else if (comparison.saving > 0)
    out.push({
      level: 'good',
      title: `New regime saves ${money(comparison.saving)}`,
      body: comparison.oldBreakEven
        ? `The old regime would need about ${money(comparison.oldBreakEven)} more in deductions to break even.`
        : 'No realistic amount of deductions makes the old regime better.',
    });

  if (cnt('sale_proceeds') && !input.gains.stcg111A && !input.gains.ltcg112A && !input.gains.ltcg112 && !input.gains.stcgOther)
    out.push({
      level: 'action',
      title: 'Investment sale proceeds found',
      body: 'Credits from brokers / mutual funds are sale value, not gain. Download the capital-gains report (broker P&L or CAS) and enter STCG/LTCG in Details.',
    });

  if (input.gains.ltcg112A < LTCG_112A_EXEMPTION && (cnt('investment') || input.gains.ltcg112A > 0))
    out.push({
      level: 'info',
      title: 'LTCG harvesting',
      body: `Listed equity LTCG up to ${money(LTCG_112A_EXEMPTION)} a year is tax-free. You have ${money(LTCG_112A_EXEMPTION - input.gains.ltcg112A)} of room left — selling and rebuying long-held equity before 31 March resets cost without tax.`,
    });

  const cashDeposits = c.yearTx.filter((x) => isCashDeposit(x.t));
  const cashTotal = cashDeposits.reduce((s, x) => s + x.t.deposit, 0);
  if (cashTotal >= SFT_CASH_DEPOSIT_LIMIT)
    out.push({ level: 'warn', title: 'Cash deposits ≥ ₹10 lakh', body: `Cash deposits of ${money(cashTotal)} are reported to the tax department (SFT) and will show in AIS. Keep proof of source.` });
  if (cashDeposits.some((x) => x.t.deposit >= CASH_RECEIPT_LIMIT_269ST))
    out.push({ level: 'warn', title: 'Single cash receipt ≥ ₹2 lakh', body: 'Receiving ₹2 lakh or more in cash from one person in a day/transaction/event attracts a penalty equal to the amount (Sec 269ST), unless it is from a bank.' });

  const gifts = input.other.giftsFromOthers;
  if (gifts > 0)
    out.push({
      level: gifts > GIFT_EXEMPT_LIMIT ? 'warn' : 'info',
      title: gifts > GIFT_EXEMPT_LIMIT ? 'Gifts from non-relatives are fully taxable' : 'Gifts from non-relatives within limit',
      body: `Total ${money(gifts)}. Above ${money(GIFT_EXEMPT_LIMIT)} the entire amount — not just the excess — is taxed as other income. Gifts on marriage, by will/inheritance, and from relatives are exempt.`,
    });

  if (cnt('tax_refund'))
    out.push({ level: 'info', title: 'Income-tax refund received', body: 'The refund itself is not income, but the interest the department adds (Sec 244A) is taxable this year. Find the interest in the refund intimation/AIS and enter it on the refund row in Transactions.' });

  if (cnt('cashback') && sum('cashback') > 0)
    out.push({ level: 'info', title: `Cashback / rewards: ${money(sum('cashback'))}`, body: 'Treated as a discount on spending, not income. If rewards are part of a business (e.g. card spend for business purchases), they reduce that expense instead.' });

  const interest = input.other.depositInterest;
  const tdsLimit = input.profile.type === 'individual' && input.profile.age !== 'below60' ? TDS_BANK_INTEREST_THRESHOLD.senior : TDS_BANK_INTEREST_THRESHOLD.normal;
  if (interest > tdsLimit)
    out.push({ level: 'info', title: 'Banks will deduct TDS on interest', body: `Deposit interest of ${money(interest)} is above ${money(tdsLimit)}, so expect ~10% TDS (≈${money(c.estimatedFdTds)}) per bank crossing the limit. Add actual TDS from AIS in Details.` });
  if (chosen.totalTax === 0 && interest > 0 && input.profile.resident)
    out.push({ level: 'good', title: `Form ${isHuf || input.profile.age === 'below60' ? '15G' : '15H'} can stop TDS`, body: `Your tax is nil, so you can submit Form ${isHuf || input.profile.age === 'below60' ? '15G' : '15H'} to the bank at the start of the year to avoid TDS on interest.${isHuf || input.profile.age === 'below60' ? ' 15G also needs the interest itself to be below the basic exemption limit.' : ''}` });

  if (byCategory.salary && !state.manual.salary.gross)
    out.push({ level: 'action', title: 'Salary credits are net pay', body: 'The bank shows salary after TDS and deductions. Enter gross salary and TDS from Form 16 / payslips in Details for an accurate figure.' });

  if (c.advance.liable && c.advance.next)
    out.push({
      level: c.advance.next.payNow > 0 ? 'action' : 'good',
      title: c.advance.next.payNow > 0 ? `Pay ${money(c.advance.next.payNow)} advance tax by ${c.advance.next.due.split('-').reverse().join('/')}` : 'Advance tax is on track',
      body: c.advance.next.payNow > 0
        ? `Cumulative ${money(c.advance.next.cumulativeRequired)} is due by then; ${money(c.advance.next.paidSoFar)} is paid. Pay via e-Pay Tax (Challan 280, minor head 100).`
        : `You have paid ${money(c.advance.next.paidSoFar)}, which covers the next instalment.`,
    });
  if (chosen.totalTax > 0 || c.advance.paidAdvance > 0) {
    const overpaid = c.advance.paidAdvance + chosen.tdsTcs - chosen.totalTax;
    if (overpaid > 0)
      out.push({ level: 'good', title: `Paid ${money(overpaid)} more than the estimated tax`, body: 'No further advance tax is needed on current estimates. File the return to claim the refund — the department adds interest of 0.5% a month (Sec 244A). Double-check that every tax payment was for this PAN and year.' });
  }
  if (c.advance.locked234C > 0)
    out.push({ level: 'warn', title: `234C interest already incurred: ${money(c.advance.locked234C)}`, body: 'Earlier instalments fell short. This interest is fixed now, but paying the rest on time avoids more 234C and 234B interest.' });

  if (input.profile.type === 'individual' && !input.profile.resident)
    out.push({ level: 'info', title: 'Non-resident', body: 'No 87A rebate, no senior-citizen slabs in the old regime, no unused exemption against capital gains, and no 44AD/44ADA.' });

  if (input.other.vda > 0)
    out.push({ level: 'info', title: 'Crypto / VDA', body: 'Taxed at a flat 30% with no deduction except cost, and losses can’t be set off or carried forward. 1% TDS applies on transfers.' });

  if (chosen.carryForward.length)
    out.push({ level: 'info', title: 'Losses to carry forward', body: chosen.carryForward.map((l) => `${l.label}: ${money(l.amount)}`).join('; ') + '. File the return by the due date to carry them forward.' });

  out.push({
    level: 'info',
    title: 'Return due date',
    body: `${c.returnDue.split('-').reverse().join('/')} for this profile. Late filing costs a fee of up to ₹5,000 (234F), interest of 1% a month on unpaid tax (234A), and loses carry-forward of most losses.`,
  });

  return out;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const STORAGE_KEY = 'taxlens:v1';

export function loadSaved(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AppState;
    return s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export function persist(state: AppState) {
  try {
    if (state.remember) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Deep-merge saved data over defaults so older saves pick up new fields. */
export function hydrate(saved: Partial<AppState>, base: AppState): AppState {
  const merge = (a: any, b: any): any => {
    if (Array.isArray(a) || typeof a !== 'object' || a === null) return b === undefined ? a : b;
    const out: any = { ...a };
    for (const k of Object.keys(b ?? {})) out[k] = merge(a[k], b[k]);
    return out;
  };
  return merge(base, saved);
}
