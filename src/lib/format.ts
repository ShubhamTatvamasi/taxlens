const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (n: number, decimals = false) =>
  `${n < 0 ? '−' : ''}₹${(decimals ? inr2 : inr).format(Math.abs(decimals ? n : Math.round(n)))}`;

/** ₹12.3L / ₹1.2Cr */
export function short(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`;
  return money(n);
}

export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits).replace(/\.0+$/, '')}%`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function date(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function parseAmount(s: string): number {
  const cleaned = s.replace(/[₹,\s]/g, '');
  if (!cleaned) return 0;
  const lakh = /^([\d.]+)\s*l$/i.exec(cleaned);
  if (lakh) return Number(lakh[1]) * 1e5;
  const crore = /^([\d.]+)\s*cr$/i.exec(cleaned);
  if (crore) return Number(crore[1]) * 1e7;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export const maskAccount = (a: string) => (a.length > 4 ? `••••${a.slice(-4)}` : a);
