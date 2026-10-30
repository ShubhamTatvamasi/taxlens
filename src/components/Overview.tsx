import type { AppState, Derived } from '../lib/state';
import { CATEGORIES } from '../lib/statement/classify';
import { date, maskAccount, money, short } from '../lib/format';
import { TAX_YEAR } from '../lib/tax/rules';
import { Alert, Card, Stat } from './ui';
import { Upload } from './Upload';
import type { ParsedStatement } from '../lib/statement/hdfc';

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const monthIndex = (iso: string) => {
  const m = Number(iso.slice(5, 7));
  return (m + 8) % 12;
};

function MonthlyChart({ d }: { d: Derived }) {
  const credit = Array(12).fill(0);
  const debit = Array(12).fill(0);
  const taxable = Array(12).fill(0);
  for (const { t, category } of d.categorized) {
    if (t.date < TAX_YEAR.start || t.date > TAX_YEAR.end) continue;
    const i = monthIndex(t.date);
    credit[i] += t.deposit;
    debit[i] += t.withdrawal;
    if (CATEGORIES[category].kind === 'taxable' || CATEGORIES[category].kind === 'business') taxable[i] += t.deposit;
  }
  const max = Math.max(1, ...credit, ...debit);
  const W = 720, H = 220, pad = 28, bw = (W - pad) / 12;
  const y = (v: number) => H - 24 - (v / max) * (H - 44);
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly credits and debits">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g>
            <line class="grid-line" x1={pad} x2={W} y1={y(max * f)} y2={y(max * f)} />
            <text x={0} y={y(max * f) + 4}>{short(max * f).replace('₹', '')}</text>
          </g>
        ))}
        {MONTHS.map((m, i) => {
          const x = pad + i * bw + 6;
          const w = (bw - 16) / 2;
          return (
            <g>
              <rect x={x} y={y(credit[i])} width={w} height={H - 24 - y(credit[i])} rx="3" fill="var(--accent)" opacity="0.28">
                <title>{`${m}: credits ${money(credit[i])}`}</title>
              </rect>
              <rect x={x} y={y(taxable[i])} width={w} height={H - 24 - y(taxable[i])} rx="3" fill="var(--accent)">
                <title>{`${m}: taxable income ${money(taxable[i])}`}</title>
              </rect>
              <rect x={x + w + 2} y={y(debit[i])} width={w} height={H - 24 - y(debit[i])} rx="3" fill="var(--accent-2)" opacity="0.55">
                <title>{`${m}: debits ${money(debit[i])}`}</title>
              </rect>
              <text x={x + w} y={H - 6} text-anchor="middle">{m}</text>
            </g>
          );
        })}
      </svg>
      <div class="legend">
        <span><i style="background:var(--accent)" />Taxable income</span>
        <span><i style="background:var(--accent);opacity:.28" />All credits</span>
        <span><i style="background:var(--accent-2);opacity:.55" />Debits</span>
      </div>
    </div>
  );
}

const HEAD_COLORS = ['var(--accent)', 'var(--accent-2)', '#f59e0b', '#ec4899', '#0ea5e9'];

function IncomeMix({ d }: { d: Derived }) {
  const r = d.comparison[d.regime];
  const heads = [
    ['Salary', r.heads.salary],
    ['House property', r.heads.house],
    ['Business', r.heads.business],
    ['Capital gains', r.heads.capitalGains],
    ['Other sources', r.heads.otherSources],
  ] as const;
  const total = heads.reduce((s, [, v]) => s + Math.max(0, v), 0) || 1;
  return (
    <div>
      <div class="stacked">
        {heads.map(([label, v], i) => v > 0 && <div style={{ width: `${(v / total) * 100}%`, background: HEAD_COLORS[i] }} title={`${label}: ${money(v)}`} />)}
      </div>
      <div class="legend">
        {heads.map(([label, v], i) => (
          <span>
            <i style={{ background: HEAD_COLORS[i] }} />
            {label} <b class="num">{money(v)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Overview(props: {
  state: AppState;
  d: Derived;
  onParsed: (p: ParsedStatement) => void;
  onDemo: (kind: 'individual' | 'huf') => void;
  onRemoveStatement: (i: number) => void;
  goto: (tab: string) => void;
}) {
  const { state, d } = props;
  const r = d.comparison[d.regime];

  if (!state.statements.length) {
    return (
      <div class="fade-in">
        <div class="hero">
          <span class="badge accent">Tax year 2026-27 · Income-tax Act 2025</span>
          <h1 class="mt">
            Your bank statement → <span class="grad">tax & advance tax</span>
          </h1>
          <p>
            Drop an HDFC Bank statement. TaxLens finds your income, compares the old and new regimes for an individual or HUF, and tells you exactly how much advance tax to pay and when.
          </p>
        </div>
        <div style="max-width:760px;margin:0 auto">
          <Upload onParsed={props.onParsed} />
          <div class="row mt" style="justify-content:center">
            <span class="small muted">No statement handy?</span>
            <button class="btn sm" onClick={() => props.onDemo('individual')}>Try individual demo</button>
            <button class="btn sm" onClick={() => props.onDemo('huf')}>Try HUF demo</button>
            <button class="btn sm ghost" onClick={() => props.goto('details')}>Enter income manually →</button>
          </div>
        </div>
        <div class="features container" style="max-width:1000px">
          {[
            ['🔒', 'Private by design', 'PDF is parsed in your browser. Network is blocked by CSP — nothing is uploaded.'],
            ['🧠', 'Smart categories', 'Interest, rent, salary, refunds, cashback, own transfers, tax payments — editable.'],
            ['⚖️', 'Old vs new regime', 'Full computation with rebate, marginal relief, surcharge relief and cess.'],
            ['👨‍👩‍👧', 'Individual & HUF', 'HUF rules: no 87A rebate, 80TTA, clubbing alerts for member transfers.'],
            ['📅', 'Advance tax planner', 'Instalments, what to pay now, 234A/B/C interest and late fee estimates.'],
            ['🏦', 'FD accrual', 'Interest on cumulative FDs accrued for the year, TDS estimate, 15G/15H hints.'],
            ['📈', 'Capital gains', 'STCG 20%, LTCG 12.5% with ₹1.25L exemption, pre-2024 property indexation choice.'],
            ['💾', 'Your data, your call', 'Export/import a JSON file, or opt in to remember on this device.'],
          ].map(([i, t, s]) => (
            <div class="feature">
              <div class="fi">{i}</div>
              <div>
                <b>{t}</b>
                <span>{s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const paid = d.advance.paidAdvance + r.tdsTcs;
  const reviewCount = d.byCategory.review?.count ?? 0;

  return (
    <div class="stack fade-in">
      <div class="page-head">
        <div>
          <h1>Overview</h1>
          <p>
            {d.input.profile.type === 'huf' ? 'HUF' : 'Individual'} · {d.regime === 'new' ? 'New' : 'Old'} regime
            {state.regimeChoice === 'auto' ? ' (best for you)' : ''} · statement {date(d.coverage.from)} – {date(d.coverage.to)}
          </p>
        </div>
        <div class="row no-print">
          <button class="btn" onClick={() => window.print()}>Print summary</button>
          <button class="btn primary" onClick={() => props.goto('advance')}>Advance tax plan →</button>
        </div>
      </div>

      <div class="grid grid-4">
        <Stat glyph="₹" label="Estimated total income" value={short(r.totalIncome)} sub={`Gross ${money(r.grossTotalIncome)} · deductions ${money(r.deductions)}`} />
        <Stat accent glyph="⚖" label={`Tax liability · ${d.regime} regime`} value={money(r.totalTax)} sub={d.comparison.saving ? `Saves ${money(d.comparison.saving)} vs ${d.regime === 'new' ? 'old' : 'new'}` : 'Same in both regimes'} />
        <Stat glyph="✓" label="Paid so far" value={money(paid)} sub={`Advance ${money(d.advance.paidAdvance)} · TDS/TCS ${money(r.tdsTcs)}`} />
        <Stat
          glyph="⏰"
          label="Next advance tax"
          value={d.advance.liable && d.advance.next ? money(d.advance.next.payNow) : '—'}
          sub={d.advance.liable && d.advance.next ? `by ${date(d.advance.next.due)} · ${d.advance.next.daysLeft} days left` : d.advance.liable ? 'All instalments passed' : 'Not required'}
        />
      </div>

      {reviewCount > 0 && (
        <div class="alert action">
          <div class="ico">!</div>
          <div class="row between" style="flex:1">
            <div>
              <h4>{reviewCount} {reviewCount === 1 ? 'credit needs' : 'credits need'} your review</h4>
              <p>They are excluded from income until classified.</p>
            </div>
            <button class="btn sm" onClick={() => props.goto('transactions:review')}>Review now</button>
          </div>
        </div>
      )}

      <div class="grid grid-2">
        <Card title="Money in & out" subtitle="By month in the tax year">
          <MonthlyChart d={d} />
        </Card>
        <Card title="Income by head" subtitle={`Projected for the full year${state.project ? '' : ' (projection off)'}`}>
          <IncomeMix d={d} />
          <div class="divider" />
          <div class="bars">
            {d.totals
              .filter((t) => ['taxable', 'business', 'gift'].includes(CATEGORIES[t.category].kind))
              .sort((a, b) => b.projected - a.projected)
              .map((t) => {
                const max = Math.max(...d.totals.map((x) => x.projected), 1);
                return (
                  <div class="bar-row">
                    <span>{CATEGORIES[t.category].label}</span>
                    <div class="bar-track"><div class="bar-fill" style={{ width: `${(t.projected / max) * 100}%` }} /></div>
                    <span class="num">{money(t.projected)}</span>
                  </div>
                );
              })}
          </div>
        </Card>
      </div>

      <Card title="Insights & actions" subtitle="What TaxLens noticed in your data">
        <div class="grid grid-2">
          {d.insights.map((i) => (
            <Alert level={i.level} title={i.title}>{i.body}</Alert>
          ))}
        </div>
      </Card>

      <Card title="Statements" subtitle="Everything stays in this tab. Remove a file to drop its transactions." className="no-print">
        <div class="stack" style="gap:10px">
          {state.statements.map((s, i) => (
            <div class="row between" style="padding:10px 12px;border:1px solid var(--border);border-radius:12px">
              <div>
                <b>{s.meta.holderName || 'Account'}</b> <span class="badge">{maskAccount(s.meta.accountNo)}</span>{' '}
                <span class="small muted">{s.meta.accountType}</span>
                <div class="tiny faint">
                  {s.meta.fileName} · {date(s.meta.from)} – {date(s.meta.to)}
                  {s.meta.closing !== null && <> · closing {money(s.meta.closing, true)}</>}
                </div>
                {s.warnings.map((w) => (
                  <div class="tiny" style="color:var(--warn)">⚠ {w}</div>
                ))}
              </div>
              <button class="btn sm ghost danger" onClick={() => props.onRemoveStatement(i)}>Remove</button>
            </div>
          ))}
          {d.outOfYear > 0 && <p class="small muted">{d.outOfYear} transactions fall outside tax year 2026-27 and are ignored.</p>}
          <Upload onParsed={props.onParsed} compact />
        </div>
      </Card>
    </div>
  );
}
