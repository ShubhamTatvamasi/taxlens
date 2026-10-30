import type { Transaction } from './hdfc';

export type Category =
  // credits
  | 'salary'
  | 'family_pension'
  | 'savings_interest'
  | 'fd_interest'
  | 'dividend'
  | 'rent'
  | 'business_receipt'
  | 'refund_interest'
  | 'other_taxable'
  | 'gift_nonrelative'
  | 'agri'
  | 'sale_proceeds'
  | 'own_transfer_in'
  | 'gift_relative'
  | 'tax_refund'
  | 'cashback'
  | 'fd_maturity'
  | 'loan'
  | 'reversal'
  | 'review'
  // debits
  | 'tax_advance'
  | 'tax_self_assessment'
  | 'tax_other'
  | 'fd_booked'
  | 'investment'
  | 'ded_80c'
  | 'ded_80d'
  | 'ded_80g'
  | 'rent_paid'
  | 'own_transfer_out'
  | 'expense';

export type Kind = 'taxable' | 'exempt' | 'review' | 'tax' | 'deduction' | 'neutral' | 'business' | 'gift';

export interface CategoryInfo {
  label: string;
  dir: 'cr' | 'dr';
  kind: Kind;
  help: string;
  /** Sensible default for projecting the rest of the year */
  recurring?: boolean;
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  salary: { label: 'Salary / pension', dir: 'cr', kind: 'taxable', recurring: true, help: 'Bank credit is net of TDS. For accuracy enter gross salary from Form 16 / payslips in Details.' },
  family_pension: { label: 'Family pension', dir: 'cr', kind: 'taxable', recurring: true, help: 'Pension received as a family member — other sources, with ⅓ / ₹25k deduction (not salary).' },
  savings_interest: { label: 'Savings interest', dir: 'cr', kind: 'taxable', recurring: true, help: 'Taxable under "Other sources". 80TTA/80TTB deduction in old regime.' },
  fd_interest: { label: 'FD / RD / bond interest', dir: 'cr', kind: 'taxable', help: 'Taxable. Do not also add the same FD in the FD planner.' },
  dividend: { label: 'Dividend', dir: 'cr', kind: 'taxable', help: 'Taxable at slab rates. TDS at 10% above ₹10,000 per company.' },
  rent: { label: 'Rent received', dir: 'cr', kind: 'taxable', recurring: true, help: 'Taxed under house property after 30% standard deduction.' },
  business_receipt: { label: 'Business / professional receipt', dir: 'cr', kind: 'business', help: 'Gross receipts — profit is computed in Details (regular books or 44AD/44ADA).' },
  refund_interest: { label: 'Interest on IT refund', dir: 'cr', kind: 'taxable', help: 'The interest part of an income-tax refund is taxable.' },
  other_taxable: { label: 'Other taxable income', dir: 'cr', kind: 'taxable', help: 'Commission, freelance one-offs, prize money with TDS, etc.' },
  gift_nonrelative: { label: 'Gift from non-relative', dir: 'cr', kind: 'gift', help: 'All such gifts are fully taxable if the year’s total exceeds ₹50,000.' },
  agri: { label: 'Agricultural income', dir: 'cr', kind: 'exempt', help: 'Exempt, but above ₹5,000 it raises the rate on other income (partial integration).' },
  sale_proceeds: { label: 'Investment sale / redemption', dir: 'cr', kind: 'neutral', help: 'Sale value is not income. Enter the capital gain (from broker/CAS report) in Details.' },
  own_transfer_in: { label: 'Own account / family member transfer', dir: 'cr', kind: 'exempt', help: 'Not income. For an HUF, money from a member is an exempt gift — but see clubbing note.' },
  gift_relative: { label: 'Gift from relative', dir: 'cr', kind: 'exempt', help: 'Exempt without limit (relatives as defined; for HUF, any member).' },
  tax_refund: { label: 'Income-tax refund', dir: 'cr', kind: 'exempt', help: 'Not income. Any interest included is taxable — split it out if known.' },
  cashback: { label: 'Cashback / rewards', dir: 'cr', kind: 'exempt', help: 'Card cashback and rewards are generally a discount, not income. Mark taxable if earned as a business.' },
  fd_maturity: { label: 'FD maturity / closure', dir: 'cr', kind: 'neutral', help: 'Principal is not income. Interest is covered by the FD planner.' },
  loan: { label: 'Loan received / repaid to you', dir: 'cr', kind: 'exempt', help: 'Not income. Cash loans ≥ ₹20,000 are barred (269SS).' },
  reversal: { label: 'Refund / reversal', dir: 'cr', kind: 'exempt', help: 'Purchase refunds and failed-transaction reversals.' },
  review: { label: 'Needs review', dir: 'cr', kind: 'review', help: 'Unrecognised credit. Choose what it is — it is excluded from income until you do.' },

  tax_advance: { label: 'Advance tax (this year, this PAN)', dir: 'dr', kind: 'tax', help: 'Counted as advance tax paid on the transaction date.' },
  tax_self_assessment: { label: 'Tax for an earlier year', dir: 'dr', kind: 'neutral', help: 'Self-assessment or demand for a previous year — not credited to this year.' },
  tax_other: { label: 'Tax paid for another PAN', dir: 'dr', kind: 'neutral', help: 'Payment on behalf of someone else — ignored.' },
  fd_booked: { label: 'FD booked', dir: 'dr', kind: 'neutral', help: 'Add it in the FD planner to include accrued interest.' },
  investment: { label: 'Investment (MF / shares / broker)', dir: 'dr', kind: 'neutral', help: 'Not an expense. ELSS/PPF/NPS? use the 80C category instead.' },
  ded_80c: { label: '80C payment (PPF, LIC, ELSS, …)', dir: 'dr', kind: 'deduction', help: 'Added to 80C in the old-regime calculation.' },
  ded_80d: { label: 'Health insurance (80D)', dir: 'dr', kind: 'deduction', help: 'Added to 80D (self/family) in the old regime. Cash premiums don’t qualify.' },
  ded_80g: { label: 'Donation (80G)', dir: 'dr', kind: 'deduction', help: 'Enter the eligible amount after 50%/100% rules in Details if different.' },
  rent_paid: { label: 'Rent paid', dir: 'dr', kind: 'deduction', recurring: true, help: 'Used for HRA (salaried) or 80GG in the old regime.' },
  own_transfer_out: { label: 'Transfer to own / family account', dir: 'dr', kind: 'neutral', help: 'Not an expense.' },
  expense: { label: 'Spend / other debit', dir: 'dr', kind: 'neutral', help: 'No tax effect.' },
};

export const CREDIT_CATEGORIES = (Object.keys(CATEGORIES) as Category[]).filter((c) => CATEGORIES[c].dir === 'cr');
export const DEBIT_CATEGORIES = (Object.keys(CATEGORIES) as Category[]).filter((c) => CATEGORIES[c].dir === 'dr');

export interface ClassifyContext {
  /** Statement holder names, e.g. ["A B HUF", "A B"] */
  ownNames: string[];
}

export const compact = (s: string) => s.toUpperCase().replace(/[^A-Z0-9@]/g, '');

/** Names that represent "self": the holder, and for an HUF the karta's name too. */
export function ownNamesFromHolder(holder: string): string[] {
  const h = holder.replace(/^(M\/S\.?|MR\.?|MRS\.?|MS\.?)\s+/i, '').trim();
  if (!h) return [];
  const names = [h];
  const huf = /^(.*?)\s*\(?HUF\)?$/i.exec(h);
  if (huf && huf[1].trim() && huf[1].trim() !== h) names.push(huf[1].trim());
  return names;
}

type Rule = { cat: Category; dir: 'cr' | 'dr'; re: RegExp; not?: RegExp };

const RULES: Rule[] = [
  // Credits
  { cat: 'tax_refund', dir: 'cr', re: /ITDTAX\s*REFUND|INCOME\s*TAX\s*REFUND|CBDT.*REFUND|TAX\s*REFUND|REFUND.*ITD|CPC.*REFUND/i },
  { cat: 'savings_interest', dir: 'cr', re: /INTEREST\s*PAID\s*TILL|^\s*INT\.?\s*PD|CREDIT\s*INTEREST|SB\s*INT|SAVINGS?\s*INT/i },
  { cat: 'fd_interest', dir: 'cr', re: /\b(FD|TD|DEPOSIT|RD|BOND|NCD)\b.{0,20}\bINT(EREST)?\b|INT(EREST)?\.?\s*(ON|FOR)\s*(FD|TD|DEPOSIT|RD)|INTEREST\s*PAYOUT/i },
  { cat: 'fd_maturity', dir: 'cr', re: /FD\s*(CLOS|MATUR|PREMAT|LIQ|REDEEM)|CLOSURE\s*PROCEEDS|TD\s*(CLOS|MAT)|DEPOSIT\s*(CLOS|MATUR)|SWEEP\s*IN/i },
  { cat: 'family_pension', dir: 'cr', re: /FAMILY\s*PENSION|\bFAM\s*PEN/i },
  { cat: 'salary', dir: 'cr', re: /SALARY|\bSAL\b|PAYROLL|SAL\s*CR|PENSION/i },
  { cat: 'dividend', dir: 'cr', re: /DIVIDEND|\bDIV\b|\bINT\s*DIV|FINAL\s*DIV|INTERIM\s*DIV/i },
  { cat: 'cashback', dir: 'cr', re: /CASH\s*BACK|CASHBACK|REWARDS?\s*(PAYOUT|CREDIT)?|SCRATCH\s*CARD|\bCB\s*CREDIT/i },
  { cat: 'sale_proceeds', dir: 'cr', re: /ZERODHA|BROKING|SECURITIES|CLEARING|\bICCL\b|NSE\s*CL|BSE\s*CL|REDEMPTION|REDEMP|\bCAMS\b|KFIN|MUTUAL\s*FUND|GROWW|UPSTOX|ANGEL\s*ONE|\bMF\b/i },
  { cat: 'reversal', dir: 'cr', re: /REVERSAL|\bREV\b|REFUND|RETURNED|CHARGEBACK|FAILED/i },
  { cat: 'rent', dir: 'cr', re: /\bRENT\b|\bRENTAL\b|\bLEASE\s*RENT/i },
  { cat: 'loan', dir: 'cr', re: /LOAN\s*DISB|DISBURSAL|DISBURSEMENT/i },
  // Debits
  { cat: 'tax_advance', dir: 'dr', re: /CBDT|ITNS\s*28|INCOME\s*TAX|OLTAS|E-?PAY\s*TAX|\bTIN\s*2|CHALLAN\s*280|\bITD\b/i, not: /PROPERTY|\bGST|CBIC|MUNICIPAL|PROFESSION|WATER|ROAD\s*TAX|NAGAR/i },
  { cat: 'fd_booked', dir: 'dr', re: /FD\s*BOOK|FD\s*THROUGH|TD\s*BOOK|DEPOSIT\s*BOOK|SWEEP\s*OUT|FD\s*CREATION|NEW\s*FD/i },
  { cat: 'ded_80c', dir: 'dr', re: /\bLIC\b|LIFE\s*INS|\bPPF\b|SUKANYA\s*SAM|\bSSY\b|ELSS|TAX\s*SAVER|\bNPS\b|\bPRAN\b|\bNSC\b|TUITION/i },
  { cat: 'ded_80d', dir: 'dr', re: /HEALTH\s*INS|MEDICLAIM|STAR\s*HEALTH|NIVA\s*BUPA|CARE\s*HEALTH|ERGO|LOMBARD|ADITYA\s*BIRLA\s*HEALTH|MANIPAL\s*CIGNA|HEALTH\s*CHECK/i },
  { cat: 'ded_80g', dir: 'dr', re: /DONAT|PM\s*CARES|PMNRF|CHARIT/i },
  { cat: 'investment', dir: 'dr', re: /ZERODHA|ZERNSE|BROKING|SECURITIES|CLEARING|\bICCL\b|^MFD|MUTUAL\s*FUND|\bMF\b|\bSIP\b|\bSTP\b|GROWW|UPSTOX|KUVERA|INDMONEY|ANGEL\s*ONE|BSE\s*STAR|NSE|\bCAMS\b|KFIN|SMALLCASE|GOLD|SGB/i },
  { cat: 'rent_paid', dir: 'dr', re: /\bRENT\b|NOBROKER|HOUSING\s*RENT/i },
];

export function classify(t: Transaction, ctx: ClassifyContext): Category {
  const isCredit = t.deposit > 0;
  const text = `${t.narration} ${t.ref}`;
  const flat = compact(text);
  const dir = isCredit ? 'cr' : 'dr';

  // Transfers to/from one's own name (or, for an HUF, the karta) come first.
  const own = ctx.ownNames.map(compact).filter((n) => n.length >= 6);
  const mentionsOwn = own.some((n) => flat.includes(n));
  const strongerSignal =
    /CBDT|ITDTAX|INCOMETAX|REFUND|INTEREST|FDBOOK|DIVIDEND|SALARY|ZERODHA|BROKING|CLEARING|SECURITIES|MUTUALFUND|REDEMPTION/.test(flat);
  if (mentionsOwn && !strongerSignal) {
    return isCredit ? 'own_transfer_in' : 'own_transfer_out';
  }

  for (const r of RULES) {
    if (r.dir === dir && r.re.test(text) && !r.not?.test(text)) return r.cat;
  }
  return isCredit ? 'review' : 'expense';
}

/** A stable key for "apply to similar transactions": UPI handle, account or leading words. */
export function counterpartyKey(narration: string): string {
  const n = narration.toUpperCase();
  const vpa = /([A-Z0-9._]+@[A-Z]+)/.exec(n);
  if (vpa) return vpa[1];
  const acct = /^(\d{9,18})-TPT/.exec(n);
  if (acct) return acct[1];
  return n
    .replace(/\d+/g, '')
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

/** "FD BOOKED - 12345" style narrations → deposit number */
export function fdNumberFrom(narration: string): string {
  return /FD\s*BOOKED\s*-?\s*(\d{6,})/i.exec(narration)?.[1] ?? '';
}

export const isCashDeposit = (t: Transaction) =>
  t.deposit > 0 && /CASH\s*DEP|BY\s*CASH|\bCDM\b|CASH\s*DEPOSIT|\bCSH\s*DEP/i.test(t.narration);
