/**
 * Parser for HDFC Bank savings/current account statements (PDF "Statement of account").
 * Works on positioned text items so it can be tested without a PDF.
 */

export interface TextItem {
  str: string;
  x: number;
  /** PDF user space: larger y is higher on the page */
  y: number;
  w: number;
  page: number;
}

export interface Transaction {
  id: string;
  /** ISO yyyy-mm-dd */
  date: string;
  valueDate: string;
  narration: string;
  ref: string;
  withdrawal: number;
  deposit: number;
  balance: number;
  balanceOk: boolean;
  source: string;
}

export interface StatementMeta {
  bank: 'HDFC';
  fileName: string;
  holderName: string;
  accountNo: string;
  accountType: string;
  from: string;
  to: string;
  opening: number | null;
  closing: number | null;
  summary: { opening: number; drCount: number; crCount: number; debits: number; credits: number; closing: number } | null;
}

export interface ParsedStatement {
  meta: StatementMeta;
  transactions: Transaction[];
  warnings: string[];
}

interface Line {
  page: number;
  y: number;
  items: TextItem[];
  text: string;
}

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/;
const MONEY_RE = /^-?\d{1,3}(,\d{2,3})*\.\d{2}$|^-?\d+\.\d{2}$/;
const STOP_RE =
  /^(HDFC BANK LIMITED|\*Closing balance|Contents of this statement|State account branch|HDFC Bank GSTIN|Registered Office|Generated On|This is a computer generated)/i;

export const parseMoney = (s: string) => Number(s.replace(/,/g, ''));

export function toIsoDate(s: string): string {
  const m = DATE_RE.exec(s.trim());
  if (!m) return '';
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${m[2]}-${m[1]}`;
}

const TOKEN_RE = /\d{2}\/\d{2}\/\d{2}(?:\d{2})?(?!\d)|-?\d{1,3}(?:,\d{2,3})*\.\d{2}(?!\d)/g;

/**
 * PDF.js merges runs that sit close together, e.g. a right-aligned reference and the
 * value date ("000123402/04/26"). Split dates and amounts out, estimating each piece's x.
 */
export function splitMerged(item: TextItem): TextItem[] {
  const s = item.str;
  const pieces: { text: string; start: number }[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) pieces.push({ text: s.slice(last, idx), start: last });
    pieces.push({ text: m[0], start: idx });
    last = idx + m[0].length;
  }
  if (last < s.length) pieces.push({ text: s.slice(last), start: last });
  const parts = pieces.filter((p) => p.text.trim());
  if (parts.length <= 1) return [item];
  const per = item.w / Math.max(1, s.length);
  return parts.map((p) => {
    const lead = p.text.length - p.text.trimStart().length;
    const text = p.text.trim();
    return { ...item, str: text, x: item.x + (p.start + lead) * per, w: text.length * per };
  });
}

export function groupLines(items: TextItem[], tolerance = 2.5): Line[] {
  const sorted = items
    .flatMap(splitMerged)
    .filter((i) => i.str.trim() !== '')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= tolerance) last.items.push(it);
    else lines.push({ page: it.page, y: it.y, items: [it], text: '' });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.str.trim()).join(' ');
  }
  return lines;
}

interface Columns {
  narrLeft: number;
  refCenter: number;
  valueLeft: number;
  withdrawalCenter: number;
  depositCenter: number;
  balanceCenter: number;
}

const center = (i: TextItem) => i.x + i.w / 2;

function findColumns(line: Line): Columns | null {
  const find = (re: RegExp) => line.items.find((i) => re.test(i.str.trim()));
  const narr = find(/^Narration/i);
  const ref = find(/^Chq/i);
  const val = find(/^Value/i);
  const wd = find(/^Withdrawal/i);
  const dep = find(/^Deposit/i);
  const bal = find(/^Closing/i);
  if (!narr || !val || !wd || !dep || !bal) return null;
  return {
    narrLeft: narr.x,
    refCenter: ref ? center(ref) : (center(narr) + val.x) / 2,
    valueLeft: val.x,
    withdrawalCenter: center(wd),
    depositCenter: center(dep),
    balanceCenter: center(bal),
  };
}

function isHeader(line: Line) {
  return /Narration/i.test(line.text) && /Closing\s*Balance/i.test(line.text);
}

function extractMeta(lines: Line[], fileName: string): StatementMeta {
  const meta: StatementMeta = {
    bank: 'HDFC',
    fileName,
    holderName: '',
    accountNo: '',
    accountType: '',
    from: '',
    to: '',
    opening: null,
    closing: null,
    summary: null,
  };
  const firstPage = lines.filter((l) => l.page === lines[0]?.page);
  for (const l of firstPage) {
    const t = l.text;
    const acc = /Account\s*No\s*:?\s*(\d{6,})/i.exec(t);
    if (acc && !meta.accountNo) meta.accountNo = acc[1];
    const period = /Statement\s*From\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})\s*To\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i.exec(t);
    if (period) {
      meta.from = toIsoDate(period[1]);
      meta.to = toIsoDate(period[2]);
    }
    const type = /Account\s*Type\s*:?\s*(.+)$/i.exec(t);
    if (type && !meta.accountType) meta.accountType = type[1].trim();
    if (!meta.holderName) {
      const first = l.items[0]?.str.trim() ?? '';
      const name = /^(M\/S\.?|MR\.?|MRS\.?|MS\.?|MISS\.?|DR\.?|MASTER\.?)\s+(.+)$/i.exec(first);
      if (name) meta.holderName = name[2].replace(/\s+/g, ' ').trim();
    }
  }
  return meta;
}

function parseSummary(line: Line | undefined): StatementMeta['summary'] {
  if (!line) return null;
  const nums = line.items.map((i) => i.str.trim()).filter((s) => /^[\d,]+(\.\d{2})?$/.test(s));
  if (nums.length < 6) return null;
  const [opening, drCount, crCount, debits, credits, closing] = nums.slice(0, 6).map(parseMoney);
  return { opening, drCount, crCount, debits, credits, closing };
}

export function parseHdfcItems(items: TextItem[], fileName = 'statement.pdf'): ParsedStatement {
  const lines = groupLines(items);
  const meta = extractMeta(lines, fileName);
  const warnings: string[] = [];
  const txns: Transaction[] = [];
  type Draft = Omit<Transaction, 'balanceOk' | 'id' | 'source' | 'narration'> & {
    segs: string[];
    page: number;
    amounts: { v: number; side: 'w' | 'd' }[];
  };
  const drafts: Draft[] = [];

  let cols: Columns | null = null;
  let inTable = false;
  let done = false;
  let currentPage = -1;

  for (let idx = 0; idx < lines.length && !done; idx++) {
    const line = lines[idx];
    if (line.page !== currentPage) {
      currentPage = line.page;
      inTable = false;
    }
    if (isHeader(line)) {
      cols = findColumns(line) ?? cols;
      inTable = true;
      continue;
    }
    if (/STATEMENT\s+SUMMARY/i.test(line.text)) {
      // Skip the label row, read the figures row.
      const rest = lines.slice(idx + 1, idx + 4);
      meta.summary = rest.map(parseSummary).find(Boolean) ?? null;
      done = true;
      break;
    }
    if (!inTable || !cols) continue;
    if (STOP_RE.test(line.text) || /^Page\s*No/i.test(line.text)) {
      inTable = false;
      continue;
    }

    const first = line.items[0];
    const startsTxn = DATE_RE.test(first.str.trim()) && first.x < cols.narrLeft;
    const c = cols;

    if (startsTxn) {
      const rest = line.items.slice(1);
      const valueItem = rest.find((i) => DATE_RE.test(i.str.trim()) && i.x >= c.valueLeft - 15);
      const money = rest.filter((i) => MONEY_RE.test(i.str.trim()) && i.x > c.valueLeft);
      const middle = rest.filter((i) => i !== valueItem && !money.includes(i));
      const narr: string[] = [];
      const ref: string[] = [];
      middle.forEach((i, k) => {
        const looksRef = i.x > c.narrLeft + 30 && i.x + i.w > c.refCenter - 10;
        const lastAndId = k === middle.length - 1 && middle.length > 1 && /^[A-Z0-9]{8,}$/i.test(i.str.trim());
        (looksRef || lastAndId ? ref : narr).push(i.str.trim());
      });
      if (money.length === 0) {
        warnings.push(`Could not read amounts for a row dated ${first.str.trim()} on page ${line.page}.`);
        continue;
      }
      const balanceItem = money.reduce((a, b) => (center(a) > center(b) ? a : b));
      const amountItems = money.filter((m) => m !== balanceItem);
      const mid = (c.withdrawalCenter + c.depositCenter) / 2;
      drafts.push({
        date: toIsoDate(first.str),
        valueDate: valueItem ? toIsoDate(valueItem.str) : toIsoDate(first.str),
        segs: [narr.join(' ')],
        ref: ref.join(' '),
        withdrawal: 0,
        deposit: 0,
        balance: parseMoney(balanceItem.str),
        page: line.page,
        amounts: amountItems.map((m) => ({ v: parseMoney(m.str), side: center(m) < mid ? 'w' : 'd' })),
      });
      continue;
    }

    // Continuation of the previous narration (may spill onto the next page).
    const last = drafts[drafts.length - 1];
    if (!last) continue;
    for (const i of line.items) {
      if (i.x >= c.valueLeft - 5) continue;
      const s = i.str.trim();
      if (i.x > c.narrLeft + 30 && i.x + i.w > c.refCenter - 10) last.ref += s;
      else last.segs.push(s);
    }
  }

  // Resolve withdrawal/deposit using column position, then verify with running balance.
  const opening = meta.summary?.opening ?? null;
  let prev: number | null = opening;
  drafts.forEach((d, i) => {
    const amt = d.amounts[0];
    let w = 0;
    let dep = 0;
    if (amt) {
      if (amt.side === 'w') w = amt.v;
      else dep = amt.v;
    }
    if (prev === null && amt) prev = round2(d.balance - dep + w);
    let ok = prev !== null && Math.abs(round2(prev + dep - w) - d.balance) < 0.01;
    if (!ok && amt && prev !== null && Math.abs(round2(prev - dep + w) - d.balance) < 0.01) {
      [w, dep] = [dep, w];
      ok = true;
    }
    if (!ok && !amt && prev !== null) {
      const diff = round2(d.balance - prev);
      if (diff > 0) dep = diff;
      else w = -diff;
      ok = true;
    }
    if (!ok) warnings.push(`Balance does not reconcile on ${d.date} (${joinSegments(d.segs).slice(0, 40)}…).`);
    prev = d.balance;
    txns.push({
      id: `${meta.accountNo || fileName}-${i}-${d.date}-${d.ref || ''}`,
      date: d.date,
      valueDate: d.valueDate,
      narration: joinSegments(d.segs),
      ref: d.ref.trim(),
      withdrawal: w,
      deposit: dep,
      balance: d.balance,
      balanceOk: ok,
      source: fileName,
    });
  });

  meta.opening = opening ?? (txns.length ? round2(txns[0].balance - txns[0].deposit + txns[0].withdrawal) : null);
  meta.closing = txns.length ? txns[txns.length - 1].balance : meta.summary?.closing ?? null;

  if (meta.summary) {
    const dr = txns.filter((t) => t.withdrawal > 0);
    const cr = txns.filter((t) => t.deposit > 0);
    const debits = round2(dr.reduce((s, t) => s + t.withdrawal, 0));
    const credits = round2(cr.reduce((s, t) => s + t.deposit, 0));
    if (dr.length !== meta.summary.drCount || cr.length !== meta.summary.crCount)
      warnings.push(`Row count differs from the bank summary (debits ${dr.length}/${meta.summary.drCount}, credits ${cr.length}/${meta.summary.crCount}).`);
    if (Math.abs(debits - meta.summary.debits) > 0.01 || Math.abs(credits - meta.summary.credits) > 0.01)
      warnings.push('Totals differ from the bank summary — please review the transactions.');
  } else if (txns.length) {
    warnings.push('No statement summary found — totals could not be cross-checked.');
  }
  if (!txns.length) warnings.push('No transactions found. Is this an HDFC Bank account statement PDF?');

  return { meta, transactions: txns, warnings };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** HDFC wraps narration at a fixed width, often mid-word: a full line joins without a space. */
export function joinSegments(segs: string[], wrapAt = 40): string {
  let out = '';
  let prev = '';
  for (const raw of segs) {
    const seg = raw.trim();
    if (!seg) continue;
    const glue = !out || prev.length >= wrapAt || /[-@/]$/.test(prev) || /^[-@/]/.test(seg) ? '' : ' ';
    out += glue + seg;
    prev = seg;
  }
  return out.replace(/\s+/g, ' ').trim();
}
