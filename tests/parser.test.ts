import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseHdfcItems, joinSegments, type TextItem } from '../src/lib/statement/hdfc';
import { classify, ownNamesFromHolder, counterpartyKey } from '../src/lib/statement/classify';
import { fakeHdfcStatement } from './helpers/fake-pdf';

async function itemsOf(data: Uint8Array): Promise<TextItem[]> {
  const doc = await getDocument({ data: data.slice(), useSystemFonts: false }).promise;
  const out: TextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items) if ('str' in it) out.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, page: p });
  }
  return out;
}

// Entirely fictional statement.
const pdf = fakeHdfcStatement(
  'M/S. RAVI KUMAR HUF',
  [
    [
      { date: '02/04/26', narration: ['UPI-ASHA SINGH-asha.s@okfake-SBIN0000001', '-PAYMENT FROM PHONE'], ref: '0000100000000001', d: '5,000.00', bal: '55,000.00' },
      { date: '15/06/26', narration: ['POS 400000XXXXXX0000 PAY*CBDT TIN 2 0'], ref: '0000100000000002', w: '20,000.00', bal: '35,000.00' },
      { date: '01/07/26', narration: ['INTEREST PAID TILL 30-JUN-2026'], ref: '000000000000000', d: '300.00', bal: '35,300.00' },
      { date: '05/07/26', narration: ['50100000001111-TPT-HDFC0000AAAA0000-RAVI K', 'UMAR'], ref: '0000000000000003', d: '100,000.00', bal: '135,300.00' },
    ],
    [
      { date: '06/07/26', narration: ['FD BOOKED - 50300000000001 : RAVI KUMAR', 'HUF'], ref: '6000000000000000000004', w: '100,000.00', bal: '35,300.00' },
      { date: '24/08/26', narration: ['NEFT CR-SBIN0000TBU-ITDTAX REFUND 2026-2', '7 AAAAA0000A-RAVI KUMAR HUF'], ref: 'SBIN000000000005', d: '1,200.00', bal: '36,500.00' },
      { date: '10/09/26', narration: ['UPI-REWARDCO PVT LTD-cashback@okfake-REWARDS PAYOUT'], ref: '0000100000000006', d: '101.50', bal: '36,601.50' },
    ],
  ],
  ['50,000.00', '2', '5', '120,000.00', '106,601.50', '36,601.50'],
);

describe('HDFC parser (synthetic PDF)', () => {
  it('reads metadata, rows and reconciles with the summary', async () => {
    const res = parseHdfcItems(await itemsOf(pdf), 'fake.pdf');
    expect(res.meta.holderName).toBe('RAVI KUMAR HUF');
    expect(res.meta.accountNo).toBe('50100000009999');
    expect(res.meta.from).toBe('2026-04-01');
    expect(res.meta.to).toBe('2026-10-15');
    expect(res.meta.summary?.opening).toBe(50_000);
    expect(res.transactions).toHaveLength(7);
    expect(res.warnings).toEqual([]);
    const [first, tax, , transfer, fd] = res.transactions;
    expect(first.deposit).toBe(5_000);
    expect(first.ref).toBe('0000100000000001');
    expect(first.valueDate).toBe('2026-04-02');
    expect(first.narration).toBe('UPI-ASHA SINGH-asha.s@okfake-SBIN0000001-PAYMENT FROM PHONE');
    expect(tax.withdrawal).toBe(20_000);
    expect(tax.date).toBe('2026-06-15');
    expect(transfer.narration.endsWith('RAVI KUMAR')).toBe(true);
    expect(fd.withdrawal).toBe(100_000);
    expect(res.transactions.every((t) => t.balanceOk)).toBe(true);
  });

  it('classifies typical rows', async () => {
    const res = parseHdfcItems(await itemsOf(pdf), 'fake.pdf');
    const ctx = { ownNames: ownNamesFromHolder(res.meta.holderName) };
    expect(ctx.ownNames).toEqual(['RAVI KUMAR HUF', 'RAVI KUMAR']);
    expect(res.transactions.map((t) => classify(t, ctx))).toEqual([
      'review',
      'tax_advance',
      'savings_interest',
      'own_transfer_in',
      'fd_booked',
      'tax_refund',
      'cashback',
    ]);
  });

  it('fixes debit/credit using the running balance', () => {
    const items: TextItem[] = [
      ...['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'].map((s, i) => ({ str: s, x: [40, 140, 290, 345, 390, 460, 520][i], y: 700, w: s.length * 3.5, page: 1 })),
      { str: '01/05/26', x: 40, y: 680, w: 30, page: 1 },
      { str: 'SOMETHING', x: 72, y: 680, w: 40, page: 1 },
      { str: '01/05/26', x: 345, y: 680, w: 30, page: 1 },
      // placed in deposit column but balance says it's a withdrawal
      { str: '1,000.00', x: 480, y: 680, w: 30, page: 1 },
      { str: '9,000.00', x: 550, y: 680, w: 30, page: 1 },
      { str: '02/05/26', x: 40, y: 660, w: 30, page: 1 },
      { str: 'OTHER', x: 72, y: 660, w: 30, page: 1 },
      { str: '02/05/26', x: 345, y: 660, w: 30, page: 1 },
      { str: '500.00', x: 485, y: 660, w: 25, page: 1 },
      { str: '9,500.00', x: 550, y: 660, w: 30, page: 1 },
    ];
    const res = parseHdfcItems(items);
    // Without a summary the first row anchors the chain; second row confirms deposit.
    expect(res.transactions[1].deposit).toBe(500);
  });
});

describe('helpers', () => {
  it('joins wrapped narration', () => {
    expect(joinSegments(['UPI-ABC', 'DEF'])).toBe('UPI-ABC DEF');
    expect(joinSegments(['X'.repeat(40), 'YZ'])).toBe('X'.repeat(40) + 'YZ');
    expect(joinSegments(['UPI-ABC', '-REF'])).toBe('UPI-ABC-REF');
  });
  it('counterparty keys', () => {
    expect(counterpartyKey('UPI-ASHA SINGH-asha.s@okfake-SBIN0000001-PAYMENT')).toBe('ASHA.S@OKFAKE');
    expect(counterpartyKey('50100000001111-TPT-HDFC0000-RAVI')).toBe('50100000001111');
  });
});

describe('merged PDF runs', () => {
  it('splits a reference glued to the value date and amounts', async () => {
    const { splitMerged } = await import('../src/lib/statement/hdfc');
    const parts = splitMerged({ str: '000010000000000102/04/26', x: 300, y: 0, w: 96, page: 1 });
    expect(parts.map((p) => p.str)).toEqual(['0000100000000001', '02/04/26']);
    expect(parts[1].x).toBeCloseTo(364, 0);
    const money = splitMerged({ str: '15,000.00 74,975.69', x: 0, y: 0, w: 76, page: 1 });
    expect(money.map((p) => p.str)).toEqual(['15,000.00', '74,975.69']);
    expect(splitMerged({ str: 'UPI-SOMEONE-PAYMENT', x: 0, y: 0, w: 10, page: 1 })).toHaveLength(1);
  });
});
