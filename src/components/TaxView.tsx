import { useMemo, useState } from 'preact/hooks';
import type { AppState, Derived } from '../lib/state';
import { compareRegimes, slabsFor, type Regime, type RegimeResult } from '../lib/tax/engine';
import { money, pct, short } from '../lib/format';
import { Alert, Card, MoneyField, Segmented } from './ui';

function Calc({ r }: { r: RegimeResult }) {
  return (
    <div class="calc">
      {r.lines
        .filter((l) => l.kind !== 'sub' || l.amount !== 0 || l.note)
        .filter((l) => !(l.kind === 'head' && l.amount === 0))
        .map((l) => (
          <div class={`line ${l.kind ?? ''}`}>
            <span>
              {l.label}
              {l.note && <span class="note">{l.note}</span>}
            </span>
            <span class="num">{money(l.amount)}</span>
          </div>
        ))}
      <div class="line total" style="font-size:16px">
        <span>{r.netPayable >= 0 ? 'Balance payable' : 'Refund due'}</span>
        <span class="num" style={{ color: r.netPayable >= 0 ? 'var(--text)' : 'var(--pos)' }}>{money(Math.abs(r.netPayable))}</span>
      </div>
    </div>
  );
}

function SlabChart({ d }: { d: Derived }) {
  const r = d.comparison[d.regime];
  const slabs = slabsFor(d.regime, d.input.profile);
  const income = r.normalIncome;
  const shown = slabs.filter(([, ], i) => i === 0 || slabs[i - 1][0] < Math.max(income, 1) * 1.2 || i < 4);
  let prev = 0;
  return (
    <div class="bars">
      {shown.map(([upTo, rate]) => {
        const lo = prev;
        prev = upTo;
        const span = (upTo === Infinity ? Math.max(income - lo, 0) : upTo - lo) || 1;
        const filled = Math.min(Math.max(income - lo, 0), span);
        return (
          <div class="bar-row">
            <span class="num">
              {short(lo).replace('₹0', '₹0')} – {upTo === Infinity ? 'above' : short(upTo)}
            </span>
            <div class="bar-track"><div class="bar-fill" style={{ width: `${(filled / span) * 100}%` }} /></div>
            <span class="num"><b>{pct(rate, 0)}</b> · {money(filled * rate)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TaxView(props: { state: AppState; d: Derived; set: (fn: (s: AppState) => AppState) => void }) {
  const { state, d, set } = props;
  const { comparison } = d;
  const [extra, setExtra] = useState(0);
  const whatIf = useMemo(
    () => (extra ? compareRegimes({ ...d.input, other: { ...d.input.other, other: d.input.other.other + extra } }) : null),
    [extra, d.input],
  );
  const regimes: Regime[] = ['new', 'old'];

  return (
    <div class="stack fade-in">
      <div class="page-head">
        <div>
          <h1>Tax computation</h1>
          <p>Both regimes, line by line. Total income is rounded to ₹10 (Sec 288A) and tax to ₹10 (Sec 288B).</p>
        </div>
        <div class="field">
          <span class="label">Regime used for advance tax</span>
          <Segmented
            value={state.regimeChoice}
            onChange={(v) => set((s) => ({ ...s, regimeChoice: v }))}
            options={[{ value: 'auto', label: '✨ Best' }, { value: 'new', label: 'New' }, { value: 'old', label: 'Old' }]}
          />
        </div>
      </div>

      <div class="grid grid-2">
        {regimes.map((k) => {
          const r = comparison[k];
          const best = comparison.better === k && comparison.saving > 0;
          return (
            <div class={`regime ${best ? 'best' : ''}`}>
              {best && <span class="ribbon">Saves {money(comparison.saving)}</span>}
              <div class="row between">
                <div>
                  <h3>{k === 'new' ? 'New regime' : 'Old regime'}</h3>
                  <span class="small muted">{k === 'new' ? 'Default for everyone' : 'Opt-out with deductions'}</span>
                </div>
                {d.regime === k && <span class="badge accent">Used for plan</span>}
              </div>
              <div class="tax num mt">{money(r.totalTax)}</div>
              <div class="small muted">
                on income {money(r.totalIncome)} · effective {r.totalIncome ? pct(r.totalTax / r.totalIncome) : '0%'} · marginal {pct(r.marginalRate)}
              </div>
              <div class="divider" />
              <Calc r={r} />
              {r.warnings.map((w) => (
                <div class="mt"><Alert level="info" title={w} /></div>
              ))}
            </div>
          );
        })}
      </div>

      <div class="grid grid-2">
        <Card title="What if I earn more?" subtitle="Add hypothetical income (bonus, interest, a sale) to see the tax effect in both regimes.">
          <MoneyField label="Extra income" value={extra} onChange={setExtra} />
          {whatIf && (
            <div class="stack mt" style="gap:8px">
              {regimes.map((k) => (
                <div class="row between">
                  <span>{k === 'new' ? 'New' : 'Old'} regime</span>
                  <span class="num">
                    {money(whatIf[k].totalTax)}{' '}
                    <span class="badge warn">+{money(whatIf[k].totalTax - comparison[k].totalTax)}</span>{' '}
                    <span class="tiny faint">({pct((whatIf[k].totalTax - comparison[k].totalTax) / extra)} of extra)</span>
                  </span>
                </div>
              ))}
              {whatIf.better !== comparison.better && <Alert level="action" title={`The ${whatIf.better} regime becomes better at this income.`} />}
            </div>
          )}
          <div class="divider" />
          {comparison.better === 'new' && comparison.oldBreakEven !== 0 && (
            <p class="small muted">
              {comparison.oldBreakEven === null
                ? 'The old regime cannot beat the new regime at this income, whatever the deductions.'
                : `The old regime needs about ${money(comparison.oldBreakEven)} more in deductions (80C, 80D, NPS, home-loan interest…) to match the new regime.`}
            </p>
          )}
          {comparison.better === 'old' && <p class="small muted">Your deductions make the old regime cheaper.</p>}
        </Card>

        <Card title={`Slab usage · ${d.regime} regime`} subtitle="How your slab-rate income fills each band (special-rate income is taxed separately).">
          <SlabChart d={d} />
        </Card>
      </div>

      {comparison[d.regime].carryForward.length > 0 && (
        <Card title="Losses carried forward">
          {comparison[d.regime].carryForward.map((c) => (
            <div class="row between small"><span>{c.label}</span><b class="num">{money(c.amount)}</b></div>
          ))}
          <p class="tiny faint mt">Only if the return is filed by the due date.</p>
        </Card>
      )}
    </div>
  );
}
