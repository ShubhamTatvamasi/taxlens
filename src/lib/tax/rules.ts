/**
 * Tax rules for Tax Year 2026-27 (1 Apr 2026 – 31 Mar 2027).
 *
 * From 1 April 2026 the Income-tax Act, 2025 replaces the Income-tax Act, 1961.
 * "Tax year" replaces "previous year / assessment year". Budget 2026 did not change
 * slab rates, so the Finance Act 2025 rates carry forward. Section names below
 * use the familiar 1961 numbers, with the 2025 Act number where widely reported.
 */

export type Slab = readonly [upTo: number, rate: number];

export const TAX_YEAR = {
  label: '2026-27',
  legacyAY: '2027-28',
  start: '2026-04-01',
  end: '2027-03-31',
} as const;

export const NEW_REGIME_SLABS: readonly Slab[] = [
  [4_00_000, 0],
  [8_00_000, 0.05],
  [12_00_000, 0.1],
  [16_00_000, 0.15],
  [20_00_000, 0.2],
  [24_00_000, 0.25],
  [Infinity, 0.3],
];

const oldSlabs = (exemption: number): readonly Slab[] => [
  [exemption, 0],
  ...(exemption < 5_00_000 ? ([[5_00_000, 0.05]] as Slab[]) : []),
  [10_00_000, 0.2],
  [Infinity, 0.3],
];

export const OLD_REGIME_SLABS = {
  below60: oldSlabs(2_50_000),
  /** Resident individuals aged 60–79 */
  senior: oldSlabs(3_00_000),
  /** Resident individuals aged 80+ */
  superSenior: oldSlabs(5_00_000),
} as const;

export const REBATE = {
  /** Sec 87A (Sec 156 of the 2025 Act) — resident individuals only, never HUF */
  new: { incomeLimit: 12_00_000, max: 60_000 },
  old: { incomeLimit: 5_00_000, max: 12_500 },
} as const;

export const SURCHARGE: readonly { above: number; rate: number }[] = [
  { above: 50_00_000, rate: 0.1 },
  { above: 1_00_00_000, rate: 0.15 },
  { above: 2_00_00_000, rate: 0.25 },
  { above: 5_00_00_000, rate: 0.37 },
];
export const NEW_REGIME_MAX_SURCHARGE = 0.25;
/** Surcharge on STCG 111A, LTCG 112/112A and dividends is capped at 15% */
export const SPECIAL_INCOME_SURCHARGE_CAP = 0.15;
export const CESS = 0.04;

export const SPECIAL_RATES = {
  stcg111A: 0.2,
  ltcg112A: 0.125,
  ltcg112: 0.125,
  /** Land/building acquired before 23-Jul-2024: resident individual/HUF may pay 20% with indexation */
  ltcg112Indexed: 0.2,
  winnings: 0.3,
  vda: 0.3,
} as const;
export const LTCG_112A_EXEMPTION = 1_25_000;

export const STANDARD_DEDUCTION = { new: 75_000, old: 50_000 } as const;
export const FAMILY_PENSION_DEDUCTION = { new: 25_000, old: 15_000 } as const;
export const PROFESSIONAL_TAX_MAX = 2_500;

export const DEDUCTION_LIMITS = {
  d80C: 1_50_000,
  d80CCD1B: 50_000,
  d80D: { normal: 25_000, senior: 50_000 },
  d80TTA: 10_000,
  d80TTB: 50_000,
  d80GG: { perMonth: 5_000, pctOfIncome: 0.25 },
  /** Employer NPS 80CCD(2), as % of basic + DA */
  d80CCD2Pct: { new: 0.14, old: 0.1 },
  houseLoanSelfOccupied: 2_00_000,
  houseLossSetOff: 2_00_000,
} as const;

export const PRESUMPTIVE = {
  ad44: { digitalRate: 0.06, cashRate: 0.08, limit: 2_00_00_000, limitLowCash: 3_00_00_000 },
  ada44: { rate: 0.5, limit: 50_00_000, limitLowCash: 75_00_000 },
} as const;

export const GIFT_EXEMPT_LIMIT = 50_000;
export const AGRI_INTEGRATION_THRESHOLD = 5_000;

export const ADVANCE_TAX = {
  threshold: 10_000,
  instalments: [
    { due: '2026-06-15', pct: 0.15, safePct: 0.12, months: 3 },
    { due: '2026-09-15', pct: 0.45, safePct: 0.36, months: 3 },
    { due: '2026-12-15', pct: 0.75, safePct: 0.75, months: 3 },
    { due: '2027-03-15', pct: 1.0, safePct: 1.0, months: 1 },
  ],
  presumptiveDue: '2027-03-15',
  interestPerMonth: 0.01,
  /** Sec 234B applies if advance tax paid is below 90% of assessed tax */
  shortfallTrigger: 0.9,
  fyEnd: '2027-03-31',
} as const;

export const RETURN_DUE = {
  noBusiness: '2027-07-31',
  businessNonAudit: '2027-08-31',
  audit: '2027-10-31',
  /** Belated / revised return outer limit */
  belated: '2027-12-31',
} as const;

export const LATE_FEE = { normal: 5_000, smallIncome: 1_000, smallIncomeLimit: 5_00_000 } as const;

export const TDS_BANK_INTEREST_THRESHOLD = { normal: 50_000, senior: 1_00_000 } as const;
export const SFT_CASH_DEPOSIT_LIMIT = 10_00_000;
export const CASH_RECEIPT_LIMIT_269ST = 2_00_000;

/** Commonly reported 1961 → 2025 Act section mapping, for reference in the UI. */
export const SECTION_MAP: Record<string, string> = {
  '80C': '123',
  '87A': '156',
};
