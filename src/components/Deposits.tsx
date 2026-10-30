import type { AppState, Derived } from '../lib/state';
import { fdNumberFrom } from '../lib/statement/classify';
import { addMonths, fdInterestForYear, fdMaturityValue, type FixedDeposit } from '../lib/tax/fd';
import { date, money } from '../lib/format';
import { TAX_YEAR } from '../lib/tax/rules';
import { Alert, Card, DateField, Empty, MoneyField, NumberField, Select, Switch } from './ui';

const newId = () => Math.random().toString(36).slice(2, 10);

export function Deposits(props: { state: AppState; d: Derived; set: (fn: (s: AppState) => AppState) => void }) {
  const { state, d, set } = props;
  const fds = state.fds;
  const detected = d.categorized.filter((c) => c.category === 'fd_booked');
  const known = new Set(fds.map((f) => f.id));

  const upd = (id: string, patch: Partial<FixedDeposit>) => set((s) => ({ ...s, fds: s.fds.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const add = (fd: Partial<FixedDeposit>) =>
    set((s) => ({
      ...s,
      fds: [
        ...s.fds,
        {
          id: fd.id ?? newId(),
          label: fd.label ?? `FD ${s.fds.length + 1}`,
          principal: fd.principal ?? 0,
          ratePct: fd.ratePct ?? 0,
          start: fd.start ?? s.asOf,
          maturity: fd.maturity ?? addMonths(fd.start ?? s.asOf, 12),
          payout: fd.payout ?? 'cumulative',
          include: true,
        },
      ],
    }));

  const totalFy = fds.filter((f) => f.include).reduce((s, f) => s + fdInterestForYear(f), 0);
  const missingRate = fds.some((f) => f.include && !f.ratePct);

  return (
    <div class="stack fade-in">
      <div class="page-head">
        <div>
          <h1>Fixed deposits</h1>
          <p>Interest on cumulative FDs is taxable every year as it accrues — even though you receive it at maturity.</p>
        </div>
        <button class="btn primary" onClick={() => add({})}>+ Add FD</button>
      </div>

      <div class="grid grid-3">
        <div class="card stat"><div class="label">FDs tracked</div><div class="value num">{fds.length}</div><div class="sub">{detected.length} {detected.length === 1 ? 'booking' : 'bookings'} found in statements</div></div>
        <div class="card stat accent"><div class="label">Interest accruing in TY {TAX_YEAR.label}</div><div class="value num">{money(totalFy)}</div><div class="sub">Added to “FD / deposit interest”</div></div>
        <div class="card stat"><div class="label">Likely bank TDS</div><div class="value num">{money(d.estimatedFdTds)}</div><div class="sub">10% once a bank’s yearly interest crosses ₹50k (₹1L senior)</div></div>
      </div>

      {missingRate && <Alert level="action" title="Enter the interest rate for each FD">Rate is printed on the FD advice / net-banking. FDs without a rate add no interest.</Alert>}

      {detected.some((c) => !known.has(`stmt-${c.t.id}`)) && (
        <Card title="Found in your statements" subtitle="Add them to include accrued interest.">
          <div class="stack" style="gap:8px">
            {detected.map(({ t }) => {
              const id = `stmt-${t.id}`;
              const no = fdNumberFrom(t.narration);
              return (
                <div class="row between" style="padding:10px 12px;border:1px solid var(--border);border-radius:12px">
                  <div>
                    <b class="num">{money(t.withdrawal)}</b> <span class="muted small">booked {date(t.date)}</span>
                    {no && <span class="badge" style="margin-left:6px">FD ••••{no.slice(-4)}</span>}
                  </div>
                  {known.has(id) ? (
                    <span class="badge pos">Added</span>
                  ) : (
                    <button class="btn sm" onClick={() => add({ id, label: no ? `FD ••••${no.slice(-4)}` : `FD ${date(t.date)}`, principal: t.withdrawal, start: t.date })}>Add</button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!fds.length ? (
        <Card><Empty icon="🏦" title="No FDs yet">Add FDs held during the year, including ones booked before April that are still running.</Empty></Card>
      ) : (
        fds.map((f) => {
          const fy = fdInterestForYear(f);
          return (
            <Card
              title={<input class="input" style="font-weight:700;max-width:260px" value={f.label} onInput={(e) => upd(f.id, { label: (e.target as HTMLInputElement).value })} />}
              actions={
                <>
                  <Switch checked={f.include} onChange={(v) => upd(f.id, { include: v })} label="Include" />
                  <button class="btn sm ghost danger" onClick={() => set((s) => ({ ...s, fds: s.fds.filter((x) => x.id !== f.id) }))}>Remove</button>
                </>
              }
            >
              <div class="fields">
                <MoneyField label="Principal" value={f.principal} onChange={(v) => upd(f.id, { principal: v })} />
                <NumberField label="Rate (% p.a.)" step={0.05} value={f.ratePct} onChange={(v) => upd(f.id, { ratePct: v })} />
                <DateField label="Start date" value={f.start} onChange={(v) => upd(f.id, { start: v })} />
                <DateField label="Maturity date" value={f.maturity} min={f.start} onChange={(v) => upd(f.id, { maturity: v })} />
                <Select
                  label="Interest payout"
                  value={f.payout}
                  onChange={(v) => upd(f.id, { payout: v })}
                  options={[
                    { value: 'cumulative', label: 'Cumulative (reinvested)' },
                    { value: 'quarterly', label: 'Quarterly payout' },
                    { value: 'monthly', label: 'Monthly payout' },
                  ]}
                />
              </div>
              <div class="row mt" style="gap:20px">
                <span class="small">This tax year: <b class="num">{money(fy)}</b></span>
                {f.payout === 'cumulative' && <span class="small muted">Maturity value: <b class="num">{money(fdMaturityValue(f))}</b></span>}
                {f.payout !== 'cumulative' && <span class="small muted">If payouts credit to an uploaded account and are categorised as FD interest, untick Include to avoid counting twice.</span>}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
