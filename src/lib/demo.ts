import type { ParsedStatement, Transaction } from './statement/hdfc';

/** A fully invented statement for exploring the app without uploading anything. */
export function demoStatement(kind: 'individual' | 'huf'): ParsedStatement {
  const holder = kind === 'huf' ? 'DEMO PERSON HUF' : 'DEMO PERSON';
  const rows: [string, string, number, number][] = [];
  const add = (date: string, narration: string, w: number, d: number) => rows.push([date, narration, w, d]);

  for (const m of ['04', '05', '06', '07', '08', '09', '10']) {
    if (kind === 'individual') add(`2026-${m}-01`, 'NEFT CR-EXAMPLE TECHNOLOGIES PVT LTD-SALARY FOR THE MONTH', 0, 145000);
    add(`2026-${m}-05`, 'UPI-TENANT NAME-tenant@okdemo-RENT FOR FLAT', 0, 28000);
    add(`2026-${m}-10`, 'UPI-GROCERY MART-grocer@okdemo-PAYMENT', 6400 + Number(m) * 37, 0);
    add(`2026-${m}-12`, 'ACH D- EXAMPLE AMC-SIP 000123', 15000, 0);
  }
  add('2026-04-20', 'UPI-LIFE INSURANCE CORP-lic@okdemo-LIC PREMIUM', 42000, 0);
  add('2026-05-18', 'POS 400000XXXXXX0000 PAY*CBDT TIN 2 0', 25000, 0);
  add('2026-06-12', 'POS 400000XXXXXX0000 PAY*CBDT TIN 2 0', 60000, 0);
  add('2026-06-30', 'INTEREST PAID TILL 30-JUN-2026', 0, 2140);
  add('2026-07-08', 'FD BOOKED - 50300000000001 : DEMO PERSON', 500000, 0);
  add('2026-07-22', 'ACH C- EXAMPLE INDUSTRIES LTD-FINAL DIVIDEND', 0, 18500);
  add('2026-08-03', 'NEFT CR-SBIN0000TBU-ITDTAX REFUND 2026-27 DEMO', 0, 12450);
  add('2026-08-19', 'UPI-STAR HEALTH INSURANCE-star@okdemo-HEALTH INS', 32000, 0);
  add('2026-09-09', 'POS 400000XXXXXX0000 PAY*CBDT TIN 2 0', 80000, 0);
  add('2026-09-14', 'NEFT CR-EXAMPLE BROKING LTD-PAYOUT', 0, 210000);
  add('2026-09-30', 'INTEREST PAID TILL 30-SEP-2026', 0, 2310);
  add('2026-10-02', 'UPI-FRIEND NAME-friend@okdemo-PAYMENT FROM PHONE', 0, 15000);
  add('2026-10-06', 'BUSINESS CARD CASH BACK', 0, 650);
  add('2026-10-11', 'UPI-PM CARES FUND-pmcares@okdemo-DONATION', 10000, 0);

  rows.sort((a, b) => a[0].localeCompare(b[0]));
  let bal = 380000;
  const transactions: Transaction[] = rows.map(([date, narration, w, d], i) => {
    bal = Math.round((bal + d - w) * 100) / 100;
    return { id: `demo-${kind}-${i}`, date, valueDate: date, narration, ref: `DEMO${String(i).padStart(10, '0')}`, withdrawal: w, deposit: d, balance: bal, balanceOk: true, source: 'demo' };
  });
  return {
    meta: {
      bank: 'HDFC',
      fileName: `demo-${kind}.pdf`,
      holderName: holder,
      accountNo: '00000000001234',
      accountType: 'SAVINGS (demo data)',
      from: '2026-04-01',
      to: '2026-10-15',
      opening: 380000,
      closing: bal,
      summary: null,
    },
    transactions,
    warnings: [],
  };
}
