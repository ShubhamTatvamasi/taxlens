import {
  AGRI_INTEGRATION_THRESHOLD,
  CESS,
  DEDUCTION_LIMITS as L,
  FAMILY_PENSION_DEDUCTION,
  GIFT_EXEMPT_LIMIT,
  LTCG_112A_EXEMPTION,
  NEW_REGIME_MAX_SURCHARGE,
  NEW_REGIME_SLABS,
  OLD_REGIME_SLABS,
  PRESUMPTIVE,
  PROFESSIONAL_TAX_MAX,
  REBATE,
  SPECIAL_INCOME_SURCHARGE_CAP,
  SPECIAL_RATES as R,
  STANDARD_DEDUCTION,
  SURCHARGE,
  type Slab,
} from './rules';

export type Regime = 'new' | 'old';
export type TaxpayerType = 'individual' | 'huf';
export type AgeGroup = 'below60' | 'senior' | 'superSenior';

export interface Profile {
  type: TaxpayerType;
  /** Ignored for HUF */
  age: AgeGroup;
  resident: boolean;
}

export interface SalaryInput {
  gross: number;
  basicDA: number;
  hraReceived: number;
  rentPaid: number;
  metro: boolean;
  /** LTA, children allowance etc. already computed as exempt (old regime only) */
  otherExempt: number;
  professionalTax: number;
  employerNps: number;
}

export interface HousePropertyInput {
  letOutRent: number;
  municipalTax: number;
  letOutInterest: number;
  selfOccupiedInterest: number;
}

export type BusinessMode = 'none' | 'regular' | '44AD' | '44ADA';

export interface BusinessInput {
  mode: BusinessMode;
  /** Regular books: net profit (may be negative) */
  netProfit: number;
  /** 44AD */
  turnoverDigital: number;
  turnoverCash: number;
  /** 44ADA */
  grossReceipts: number;
  /** Optional higher income declared under 44AD/44ADA */
  declaredIncome: number;
  /** Intraday equity etc. Losses cannot be set off against other income. */
  speculative: number;
  audit: boolean;
}

export interface CapitalGainsInput {
  /** Listed equity / equity MF STCG, STT paid */
  stcg111A: number;
  /** Listed equity / equity MF LTCG before the ₹1.25L exemption */
  ltcg112A: number;
  /** Debt MF (post Apr-2023), short-term on other assets — taxed at slab */
  stcgOther: number;
  /** Other LTCG at 12.5% without indexation (gold, unlisted shares, etc.) */
  ltcg112: number;
  /** LTCG on land/building acquired before 23-Jul-2024 — gain without indexation */
  ltcgProperty: number;
  /** Same property — gain with indexation (20% option for resident individual/HUF) */
  ltcgPropertyIndexed: number;
}

export interface OtherSourcesInput {
  savingsInterest: number;
  /** FD, RD, post office, bonds */
  depositInterest: number;
  dividend: number;
  familyPension: number;
  /** Interest on income-tax refund */
  refundInterest: number;
  /** Aggregate gifts from non-relatives. Fully taxable if above ₹50,000. */
  giftsFromOthers: number;
  other: number;
  /** Lottery, game shows, betting — flat 30% */
  winnings: number;
  /** Crypto / VDA gains — flat 30%, no set-off */
  vda: number;
  /** Exempt, but used for rate purposes (partial integration) */
  agricultural: number;
}

export interface DeductionsInput {
  d80C: number;
  d80CCD1B: number;
  d80DSelf: number;
  d80DParents: number;
  parentsSenior: boolean;
  d80E: number;
  /** Eligible amount after 50%/100% and qualifying limits */
  d80G: number;
  /** Rent paid when no HRA is received — used for 80GG */
  rentPaidNoHra: number;
  d80CCH: number;
  /** 80U / 80DD / 80DDB */
  disability: number;
  /** 80EEA, 80EEB, 80GGA, 80GGC etc. */
  other: number;
}

export interface TaxInput {
  profile: Profile;
  salary: SalaryInput;
  house: HousePropertyInput;
  business: BusinessInput;
  gains: CapitalGainsInput;
  other: OtherSourcesInput;
  deductions: DeductionsInput;
  /** TDS + TCS credits (Form 26AS / AIS) */
  tdsTcs: number;
}

export interface Line {
  label: string;
  amount: number;
  kind?: 'head' | 'sub' | 'total' | 'minus';
  note?: string;
}

export interface RegimeResult {
  regime: Regime;
  lines: Line[];
  heads: {
    salary: number;
    house: number;
    business: number;
    capitalGains: number;
    otherSources: number;
  };
  grossTotalIncome: number;
  deductions: number;
  totalIncome: number;
  normalIncome: number;
  slabTax: number;
  specialTax: number;
  rebate: number;
  marginalRelief: number;
  surcharge: number;
  surchargeRelief: number;
  cess: number;
  totalTax: number;
  tdsTcs: number;
  netPayable: number;
  /** Highest rate at which the next rupee of slab income is taxed (incl. surcharge & cess) */
  marginalRate: number;
  warnings: string[];
  carryForward: { label: string; amount: number }[];
}

const pos = (n: number) => (n > 0 ? n : 0);
const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
export const roundTo10 = (n: number) => Math.round(n / 10) * 10;

export function slabTax(income: number, slabs: readonly Slab[]): number {
  let tax = 0;
  let prev = 0;
  for (const [upTo, rate] of slabs) {
    if (income <= prev) break;
    tax += (Math.min(income, upTo) - prev) * rate;
    prev = upTo;
  }
  return tax;
}

export function slabsFor(regime: Regime, profile: Profile): readonly Slab[] {
  if (regime === 'new') return NEW_REGIME_SLABS;
  // Higher exemption for senior citizens is only for resident individuals.
  if (profile.type === 'individual' && profile.resident) {
    if (profile.age === 'senior') return OLD_REGIME_SLABS.senior;
    if (profile.age === 'superSenior') return OLD_REGIME_SLABS.superSenior;
  }
  return OLD_REGIME_SLABS.below60;
}

export function surchargeRate(totalIncome: number, regime: Regime): number {
  let rate = 0;
  for (const s of SURCHARGE) if (totalIncome > s.above) rate = s.rate;
  return regime === 'new' ? Math.min(rate, NEW_REGIME_MAX_SURCHARGE) : rate;
}

/** Income split into taxable buckets after set-off and deductions. */
interface Parts {
  normal: number;
  agri: number;
  dividend: number;
  stcg111A: number;
  ltcg112: number;
  propUnindexed: number;
  propIndexed: number;
  ltcg112A: number;
  winnings: number;
  vda: number;
}

const totalOf = (p: Parts) =>
  p.normal + p.stcg111A + p.ltcg112 + p.propUnindexed + p.ltcg112A + p.winnings + p.vda;

interface Core {
  slabTax: number;
  specialTax: number;
  rebate: number;
  marginalRelief: number;
  /** Tax after rebate, before surcharge */
  tax: number;
  surcharge: number;
}

function computeCore(p: Parts, regime: Regime, profile: Profile): Core {
  const slabs = slabsFor(regime, profile);
  const basic = slabs[0][0];
  const ti = totalOf(p);

  const normalTaxGross =
    p.agri > AGRI_INTEGRATION_THRESHOLD && p.normal > basic
      ? slabTax(p.normal + p.agri, slabs) - slabTax(basic + p.agri, slabs)
      : slabTax(p.normal, slabs);
  let normalTax = normalTaxGross;

  // Unused basic exemption can absorb 111A / 112 / 112A gains (residents only).
  let shortfall = profile.resident ? pos(basic - p.normal) : 0;
  const absorb = (amount: number) => {
    const used = Math.min(shortfall, amount);
    shortfall -= used;
    return amount - used;
  };
  const stcgTax = absorb(p.stcg111A) * R.stcg111A;
  // Pre-23-Jul-2024 land/building: lower of 12.5% without or 20% with indexation.
  let propTax = 0;
  if (p.propUnindexed > 0) {
    const s0 = shortfall;
    const unindexed = pos(p.propUnindexed - s0) * R.ltcg112;
    const indexed = p.propIndexed >= 0 ? pos(p.propIndexed - s0) * R.ltcg112Indexed : Infinity;
    if (indexed < unindexed) {
      propTax = indexed;
      shortfall = pos(s0 - p.propIndexed);
    } else {
      propTax = unindexed;
      shortfall = pos(s0 - p.propUnindexed);
    }
  }
  const ltcgTax = absorb(p.ltcg112) * R.ltcg112;
  const ltcg112ATax = pos(absorb(p.ltcg112A) - LTCG_112A_EXEMPTION) * R.ltcg112A;
  const flatTax = p.winnings * R.winnings + p.vda * R.vda;

  let rebate = 0;
  let marginalRelief = 0;
  if (profile.type === 'individual' && profile.resident) {
    if (regime === 'new') {
      // Not available against tax on special-rate income.
      if (ti <= REBATE.new.incomeLimit) rebate = Math.min(REBATE.new.max, normalTax);
      else if (normalTax > ti - REBATE.new.incomeLimit && p.normal > 0)
        marginalRelief = normalTax - (ti - REBATE.new.incomeLimit);
    } else if (ti <= REBATE.old.incomeLimit) {
      rebate = Math.min(REBATE.old.max, normalTax + stcgTax + ltcgTax + propTax + flatTax);
    }
  }

  // Apply rebate to normal tax first, remainder to other non-112A tax.
  let rebateLeft = rebate + marginalRelief;
  const take = (t: number) => {
    const used = Math.min(rebateLeft, t);
    rebateLeft -= used;
    return t - used;
  };
  normalTax = take(normalTax);
  const specialCapped = take(stcgTax) + take(ltcgTax) + take(propTax) + ltcg112ATax;
  const flatNet = take(flatTax);

  const rate = surchargeRate(ti, regime);
  const capped = Math.min(rate, SPECIAL_INCOME_SURCHARGE_CAP);
  const divShare = p.normal > 0 ? normalTax * Math.min(1, p.dividend / p.normal) : 0;
  const surcharge =
    (normalTax - divShare) * rate + (specialCapped + divShare) * capped + flatNet * rate;

  return {
    slabTax: normalTaxGross,
    specialTax: stcgTax + ltcgTax + propTax + ltcg112ATax + flatTax,
    rebate,
    marginalRelief,
    tax: normalTax + specialCapped + flatNet,
    surcharge,
  };
}

/** Reduce income parts by `by`, normal income first, used for surcharge marginal relief. */
function reduceParts(p: Parts, by: number): Parts {
  const q = { ...p };
  const order: (keyof Parts)[] = ['normal', 'vda', 'winnings', 'stcg111A', 'ltcg112', 'ltcg112A'];
  for (const k of order) {
    const cut = Math.min(by, q[k]);
    q[k] -= cut;
    by -= cut;
    if (by <= 0) break;
  }
  return q;
}

function surchargeMarginalRelief(p: Parts, regime: Regime, profile: Profile, core: Core): number {
  if (core.surcharge <= 0) return 0;
  const ti = totalOf(p);
  const rate = surchargeRate(ti, regime);
  const tiers = SURCHARGE.filter((s) => ti > s.above && surchargeRate(s.above + 1, regime) === rate);
  const threshold = tiers.length ? tiers[0].above : 0;
  if (!threshold) return 0;
  const atThreshold = computeCore(reduceParts(p, ti - threshold), regime, profile);
  const limit = atThreshold.tax + atThreshold.surcharge + (ti - threshold);
  return pos(core.tax + core.surcharge - limit);
}

function salaryIncome(input: TaxInput, regime: Regime, lines: Line[]): number {
  const s = input.salary;
  if (input.profile.type !== 'individual' || num(s.gross) <= 0) return 0;
  let taxable = s.gross;
  lines.push({ label: 'Gross salary', amount: s.gross, kind: 'sub' });
  if (regime === 'old') {
    const hra =
      s.hraReceived > 0 && s.rentPaid > 0
        ? pos(Math.min(s.hraReceived, s.rentPaid - 0.1 * s.basicDA, (s.metro ? 0.5 : 0.4) * s.basicDA))
        : 0;
    if (hra) lines.push({ label: 'HRA exemption', amount: -hra, kind: 'minus' });
    if (s.otherExempt) lines.push({ label: 'Other exempt allowances', amount: -s.otherExempt, kind: 'minus' });
    taxable -= hra + s.otherExempt;
  }
  const std = Math.min(STANDARD_DEDUCTION[regime], pos(taxable));
  lines.push({ label: `Standard deduction`, amount: -std, kind: 'minus' });
  taxable -= std;
  if (regime === 'old' && s.professionalTax) {
    const pt = Math.min(PROFESSIONAL_TAX_MAX, s.professionalTax);
    lines.push({ label: 'Professional tax', amount: -pt, kind: 'minus' });
    taxable -= pt;
  }
  return pos(taxable);
}

function houseIncome(input: TaxInput, regime: Regime, lines: Line[], cf: RegimeResult['carryForward']): number {
  const h = input.house;
  let letOut = 0;
  if (h.letOutRent > 0 || h.letOutInterest > 0) {
    const nav = pos(h.letOutRent - h.municipalTax);
    letOut = nav - 0.3 * nav - h.letOutInterest;
    lines.push({ label: 'Let-out property (NAV − 30% − interest)', amount: letOut, kind: 'sub' });
  }
  let selfOcc = 0;
  if (h.selfOccupiedInterest > 0) {
    if (regime === 'old') {
      selfOcc = -Math.min(h.selfOccupiedInterest, L.houseLoanSelfOccupied);
      lines.push({ label: 'Self-occupied home-loan interest (max ₹2L)', amount: selfOcc, kind: 'sub' });
    } else {
      lines.push({ label: 'Self-occupied home-loan interest', amount: 0, kind: 'sub', note: 'Not allowed in new regime' });
    }
  }
  const total = letOut + selfOcc;
  if (total >= 0) return total;
  if (regime === 'old') {
    const allowed = Math.max(total, -L.houseLossSetOff);
    if (allowed > total) cf.push({ label: 'House property loss (8 years)', amount: allowed - total });
    return allowed;
  }
  cf.push({ label: 'House property loss (8 years, same head only)', amount: -total });
  return 0;
}

export function businessIncome(input: TaxInput, warnings: string[]): { income: number; speculative: number } {
  const b = input.business;
  const { type } = input.profile;
  switch (b.mode) {
    case 'regular':
      return { income: b.netProfit, speculative: b.speculative };
    case '44AD': {
      const turnover = b.turnoverDigital + b.turnoverCash;
      const lowCash = b.turnoverCash <= 0.05 * turnover;
      const limit = lowCash ? PRESUMPTIVE.ad44.limitLowCash : PRESUMPTIVE.ad44.limit;
      if (turnover > limit) warnings.push(`44AD turnover exceeds ₹${(limit / 1e7).toFixed(0)} Cr — presumptive scheme is not available; books and audit apply.`);
      if (!input.profile.resident) warnings.push('44AD is only available to residents.');
      const deemed = b.turnoverDigital * PRESUMPTIVE.ad44.digitalRate + b.turnoverCash * PRESUMPTIVE.ad44.cashRate;
      return { income: Math.max(deemed, b.declaredIncome), speculative: b.speculative };
    }
    case '44ADA': {
      if (type === 'huf') warnings.push('44ADA is not available to an HUF — use regular books or 44AD (if business, not profession).');
      if (!input.profile.resident) warnings.push('44ADA is only available to residents.');
      if (b.grossReceipts > PRESUMPTIVE.ada44.limitLowCash) warnings.push('44ADA gross receipts exceed ₹75 lakh (₹50 lakh if cash receipts > 5%).');
      const deemed = b.grossReceipts * PRESUMPTIVE.ada44.rate;
      return { income: Math.max(deemed, b.declaredIncome), speculative: b.speculative };
    }
    default:
      return { income: 0, speculative: 0 };
  }
}

export function taxableGifts(giftsFromOthers: number): number {
  return giftsFromOthers > GIFT_EXEMPT_LIMIT ? giftsFromOthers : 0;
}

export function computeRegime(input: TaxInput, regime: Regime): RegimeResult {
  const { profile } = input;
  const isInd = profile.type === 'individual';
  const lines: Line[] = [];
  const warnings: string[] = [];
  const cf: RegimeResult['carryForward'] = [];
  const o = input.other;
  const g = input.gains;

  // ---- Heads of income ----
  lines.push({ label: 'Salary', amount: 0, kind: 'head' });
  const salary = salaryIncome(input, regime, lines);
  lines[lines.findIndex((l) => l.label === 'Salary' && l.kind === 'head')].amount = salary;

  const hpIdx = lines.push({ label: 'House property', amount: 0, kind: 'head' }) - 1;
  let house = houseIncome(input, regime, lines, cf);

  const bizIdx = lines.push({ label: 'Business / profession', amount: 0, kind: 'head' }) - 1;
  const biz = businessIncome(input, warnings);
  let business = biz.income + pos(biz.speculative);
  if (biz.speculative < 0) cf.push({ label: 'Speculative loss (4 years)', amount: -biz.speculative });

  const fpDed = Math.min(o.familyPension / 3, FAMILY_PENSION_DEDUCTION[regime]);
  const gifts = taxableGifts(o.giftsFromOthers);
  const otherSlab =
    o.savingsInterest + o.depositInterest + o.dividend + (o.familyPension - fpDed) + o.refundInterest + gifts + o.other;

  // Set off business loss against other non-salary heads; HP loss (old) against everything.
  let otherSources = otherSlab;
  let stcgOther = g.stcgOther;
  if (business < 0) {
    let loss = -business;
    const cut = (v: number) => {
      const used = Math.min(loss, pos(v));
      loss -= used;
      return v - used;
    };
    house = cut(house);
    otherSources = cut(otherSources);
    stcgOther = cut(stcgOther);
    business = 0;
    if (loss > 0) cf.push({ label: 'Business loss (8 years)', amount: loss });
  }
  lines[hpIdx].amount = house;
  lines[bizIdx].amount = business;

  const capitalGains = stcgOther + g.stcg111A + g.ltcg112A + g.ltcg112 + g.ltcgProperty;
  lines.push({ label: 'Capital gains', amount: capitalGains, kind: 'head' });
  if (g.stcg111A) lines.push({ label: 'STCG on listed equity (20%)', amount: g.stcg111A, kind: 'sub' });
  if (g.ltcg112A) lines.push({ label: 'LTCG on listed equity (12.5% above ₹1.25L)', amount: g.ltcg112A, kind: 'sub' });
  if (g.ltcg112) lines.push({ label: 'Other LTCG (12.5%)', amount: g.ltcg112, kind: 'sub' });
  if (g.ltcgProperty) lines.push({ label: 'LTCG on land/building', amount: g.ltcgProperty, kind: 'sub' });
  if (stcgOther) lines.push({ label: 'STCG at slab rates', amount: stcgOther, kind: 'sub' });

  const flat = o.winnings + pos(o.vda);
  lines.push({ label: 'Other sources', amount: otherSources + flat, kind: 'head' });
  if (o.savingsInterest) lines.push({ label: 'Savings interest', amount: o.savingsInterest, kind: 'sub' });
  if (o.depositInterest) lines.push({ label: 'FD / deposit interest', amount: o.depositInterest, kind: 'sub' });
  if (o.dividend) lines.push({ label: 'Dividends', amount: o.dividend, kind: 'sub' });
  if (o.familyPension) lines.push({ label: 'Family pension (net of deduction)', amount: o.familyPension - fpDed, kind: 'sub' });
  if (o.refundInterest) lines.push({ label: 'Interest on tax refund', amount: o.refundInterest, kind: 'sub' });
  if (gifts) lines.push({ label: 'Gifts from non-relatives (> ₹50k, fully taxable)', amount: gifts, kind: 'sub' });
  if (o.other) lines.push({ label: 'Other income', amount: o.other, kind: 'sub' });
  if (o.winnings) lines.push({ label: 'Winnings (30%)', amount: o.winnings, kind: 'sub' });
  if (o.vda > 0) lines.push({ label: 'Crypto / VDA gains (30%)', amount: o.vda, kind: 'sub' });
  if (o.giftsFromOthers > 0 && !gifts)
    lines.push({ label: 'Gifts from non-relatives', amount: 0, kind: 'sub', note: `Exempt — total ≤ ₹${GIFT_EXEMPT_LIMIT.toLocaleString('en-IN')}` });

  // An old-regime HP loss (already capped at ₹2L) also reduces salary here.
  const normalBeforeDed = pos(salary + house + business + otherSources + stcgOther);

  const grossTotalIncome = normalBeforeDed + g.stcg111A + g.ltcg112A + g.ltcg112 + g.ltcgProperty + flat;
  lines.push({ label: 'Gross total income', amount: grossTotalIncome, kind: 'total' });

  // ---- Deductions ----
  const d = input.deductions;
  const dl: Line[] = [];
  const add = (label: string, amount: number, note?: string) => {
    if (amount > 0) dl.push({ label, amount: -amount, kind: 'minus', note });
    return pos(amount);
  };
  let ded = 0;
  const basicDA = input.salary.basicDA > 0 ? input.salary.basicDA : input.salary.gross;
  if (isInd) {
    ded += add('80CCD(2) employer NPS', Math.min(input.salary.employerNps, L.d80CCD2Pct[regime] * basicDA));
    ded += add('80CCH Agniveer', d.d80CCH);
  }
  if (regime === 'old') {
    ded += add('80C / 80CCC / 80CCD(1)', Math.min(d.d80C, L.d80C));
    if (isInd) ded += add('80CCD(1B) NPS', Math.min(d.d80CCD1B, L.d80CCD1B));
    const selfSenior = isInd ? profile.age !== 'below60' : false;
    const selfCap = selfSenior ? L.d80D.senior : L.d80D.normal;
    ded += add('80D health insurance (self/family)', Math.min(d.d80DSelf, selfCap));
    if (isInd) ded += add('80D health insurance (parents)', Math.min(d.d80DParents, d.parentsSenior ? L.d80D.senior : L.d80D.normal));
    if (isInd) ded += add('80E education loan interest', d.d80E);
    ded += add('80G donations', d.d80G);
    ded += add('80U / 80DD / 80DDB', d.disability);
    ded += add('Other Chapter VI-A', d.other);
    const seniorResident = isInd && profile.resident && profile.age !== 'below60';
    if (seniorResident) {
      ded += add('80TTB deposit interest (senior)', Math.min(L.d80TTB, o.savingsInterest + o.depositInterest));
    } else {
      ded += add('80TTA savings interest', Math.min(L.d80TTA, o.savingsInterest));
    }
    if (isInd && d.rentPaidNoHra > 0 && input.salary.hraReceived <= 0) {
      const ati = pos(normalBeforeDed - ded);
      const gg = pos(Math.min(L.d80GG.perMonth * 12, L.d80GG.pctOfIncome * ati, d.rentPaidNoHra - 0.1 * ati));
      ded += add('80GG rent paid', gg);
    }
  }
  const deductions = Math.min(ded, normalBeforeDed);
  if (deductions < ded) dl.push({ label: 'Limited to income eligible for deductions', amount: ded - deductions, kind: 'sub' });
  lines.push(...dl);

  const normal = normalBeforeDed - deductions;
  const parts: Parts = {
    normal,
    agri: o.agricultural,
    dividend: Math.min(o.dividend, normal),
    stcg111A: pos(g.stcg111A),
    ltcg112: pos(g.ltcg112),
    propUnindexed: pos(g.ltcgProperty),
    propIndexed: g.ltcgProperty > 0 && profile.resident ? pos(g.ltcgPropertyIndexed || g.ltcgProperty) : -1,
    ltcg112A: pos(g.ltcg112A),
    winnings: pos(o.winnings),
    vda: pos(o.vda),
  };
  const totalIncome = roundTo10(totalOf(parts));
  lines.push({ label: 'Total taxable income', amount: totalIncome, kind: 'total' });

  // ---- Tax ----
  const core = computeCore(parts, regime, profile);
  const sRelief = surchargeMarginalRelief(parts, regime, profile, core);
  const beforeCess = core.tax + core.surcharge - sRelief;
  const cess = beforeCess * CESS;
  const totalTax = roundTo10(beforeCess + cess);
  const normalGross = core.slabTax;

  lines.push({ label: 'Tax at slab rates', amount: normalGross, kind: 'sub' });
  if (core.specialTax) lines.push({ label: 'Tax at special rates (CG / winnings / VDA)', amount: core.specialTax, kind: 'sub' });
  if (core.rebate) lines.push({ label: 'Rebate u/s 87A', amount: -core.rebate, kind: 'minus' });
  if (core.marginalRelief) lines.push({ label: 'Marginal relief (87A)', amount: -core.marginalRelief, kind: 'minus' });
  if (core.surcharge) lines.push({ label: `Surcharge (${(surchargeRate(totalIncome, regime) * 100).toFixed(0)}%)`, amount: core.surcharge, kind: 'sub' });
  if (sRelief) lines.push({ label: 'Marginal relief on surcharge', amount: -sRelief, kind: 'minus' });
  lines.push({ label: 'Health & education cess (4%)', amount: cess, kind: 'sub' });
  lines.push({ label: 'Total tax liability', amount: totalTax, kind: 'total' });
  if (input.tdsTcs) lines.push({ label: 'Less: TDS / TCS', amount: -input.tdsTcs, kind: 'minus' });

  // Marginal rate on the next ₹1,000 of slab income
  const bump = computeCore({ ...parts, normal: parts.normal + 1000 }, regime, profile);
  const bumpRelief = surchargeMarginalRelief({ ...parts, normal: parts.normal + 1000 }, regime, profile, bump);
  const marginalRate = pos(((bump.tax + bump.surcharge - bumpRelief) * (1 + CESS) - beforeCess * (1 + CESS)) / 1000);

  if (profile.type === 'huf') {
    if (regime === 'new') warnings.push('HUF does not get the 87A rebate — tax is payable once income crosses ₹4 lakh.');
  }

  return {
    regime,
    lines,
    heads: { salary, house, business, capitalGains, otherSources: otherSources + flat },
    grossTotalIncome,
    deductions,
    totalIncome,
    normalIncome: normal,
    slabTax: normalGross,
    specialTax: core.specialTax,
    rebate: core.rebate,
    marginalRelief: core.marginalRelief,
    surcharge: core.surcharge,
    surchargeRelief: sRelief,
    cess,
    totalTax,
    tdsTcs: input.tdsTcs,
    netPayable: totalTax - input.tdsTcs,
    marginalRate,
    warnings,
    carryForward: cf,
  };
}

export interface Comparison {
  new: RegimeResult;
  old: RegimeResult;
  better: Regime;
  saving: number;
  /** Extra old-regime deductions needed to match the new regime (0 if old is already better) */
  oldBreakEven: number | null;
}

export function compareRegimes(input: TaxInput): Comparison {
  const n = computeRegime(input, 'new');
  const o = computeRegime(input, 'old');
  const better: Regime = o.totalTax < n.totalTax ? 'old' : 'new';
  let oldBreakEven: number | null = 0;
  if (better === 'new' && o.totalTax > n.totalTax) {
    // Binary search the additional deduction that makes old regime tax ≤ new regime tax.
    const withExtra = (x: number) =>
      computeRegime({ ...input, deductions: { ...input.deductions, other: input.deductions.other + x } }, 'old').totalTax;
    let lo = 0;
    let hi = Math.max(o.normalIncome, 0) + 1;
    if (withExtra(hi) > n.totalTax) oldBreakEven = null;
    else {
      while (hi - lo > 100) {
        const mid = (lo + hi) / 2;
        if (withExtra(mid) > n.totalTax) lo = mid;
        else hi = mid;
      }
      oldBreakEven = Math.ceil(hi / 100) * 100;
    }
  }
  return { new: n, old: o, better, saving: Math.abs(n.totalTax - o.totalTax), oldBreakEven };
}

export const emptyInput = (): TaxInput => ({
  profile: { type: 'individual', age: 'below60', resident: true },
  salary: { gross: 0, basicDA: 0, hraReceived: 0, rentPaid: 0, metro: false, otherExempt: 0, professionalTax: 0, employerNps: 0 },
  house: { letOutRent: 0, municipalTax: 0, letOutInterest: 0, selfOccupiedInterest: 0 },
  business: { mode: 'none', netProfit: 0, turnoverDigital: 0, turnoverCash: 0, grossReceipts: 0, declaredIncome: 0, speculative: 0, audit: false },
  gains: { stcg111A: 0, ltcg112A: 0, stcgOther: 0, ltcg112: 0, ltcgProperty: 0, ltcgPropertyIndexed: 0 },
  other: { savingsInterest: 0, depositInterest: 0, dividend: 0, familyPension: 0, refundInterest: 0, giftsFromOthers: 0, other: 0, winnings: 0, vda: 0, agricultural: 0 },
  deductions: { d80C: 0, d80CCD1B: 0, d80DSelf: 0, d80DParents: 0, parentsSenior: false, d80E: 0, d80G: 0, rentPaidNoHra: 0, d80CCH: 0, disability: 0, other: 0 },
  tdsTcs: 0,
});
