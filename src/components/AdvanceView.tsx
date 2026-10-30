import type { AppState, Derived } from '../lib/state';
import { date, money, pct } from '../lib/format';
import { RETURN_DUE, TAX_YEAR } from '../lib/tax/rules';
import { Alert, Card, DateField, Stat } from './ui';

const STATUS: Record<string, { label: string; cls: string }> = {
  met: { label: 'Met', cls: 'pos' },
  short: { label: 'Short', cls: 'neg' },
  'due-next': { label: 'Due next', cls: 'accent' },
  upcoming: { label: 'Upcoming', cls: '' },
};

export function AdvanceView(props: { state: AppState; d: Derived; set: (fn: (s: AppState) => AppState) => void; goto: (t: string) => void }) {
  const { state, d, set } = props;
  const a = d.advance;
  const r = d.comparison[d.regime];

  return (
    <div class="stack fade-in">
      <div class="page-head">
        <div>
          <h1>Advance tax</h1>
          <p>Pay tax during the year if it will exceed ₹10,000 after TDS/TCS. Based on the {d.regime} regime and estimated full-year income.</p>
        </div>
        <div class="row" style="align-items:flex-end">
          <div style="width:170px">
            <DateField label="Plan as of" value={state.asOf} onChange={(v) => set((s) => ({ ...s, asOf: v || s.asOf }))} />
          </div>
          <div style="width:170px">
            <DateField label="Expected filing date" value={state.filingDate} min={TAX_YEAR.end} onChange={(v) => set((s) => ({ ...s, filingDate: v || s.filingDate }))} />
          </div>
        </div>
      </div>

      <div class="grid grid-4">
        <Stat label="Total tax (estimated)" value={money(r.totalTax)} sub={`${d.regime === 'new' ? 'New' : 'Old'} regime`} />
        <Stat label="Less TDS / TCS" value={money(r.tdsTcs)} sub={<a href="#" onClick={(e) => { e.preventDefault(); props.goto('details'); }}>Update in Details</a>} />
        <Stat label="Advance tax base" value={money(Math.max(0, r.netPayable))} sub={a.liable ? 'Liable for advance tax' : 'Below threshold / exempt'} />
        <Stat label="Paid as advance tax" value={money(a.paidAdvance)} sub={`${d.allPayments.length} payments · ${r.netPayable > 0 ? pct(a.paidAdvance / r.netPayable, 0) : '—'} of base`} />
      </div>

      <Alert level={a.liable ? 'action' : 'good'} title={a.liable ? 'Advance tax applies' : 'No advance tax needed'}>{a.reason}</Alert>

      {a.liable && a.next && (
        <div class="card next-card">
          <div class="row between">
            <div>
              <div class="muted small" style="font-weight:600">Pay by {date(a.next.due)} · {a.next.daysLeft} days left</div>
              <div class="big num">{money(a.next.payNow)}</div>
              <div class="faint small">
                Cumulative due {money(a.next.cumulativeRequired)} − paid {money(a.next.paidSoFar)}
              </div>
            </div>
            <div class="small" style="max-width:380px">
              <b>How to pay:</b> incometax.gov.in → e-Pay Tax → New payment → Income Tax → Assessment year {TAX_YEAR.legacyAY} / tax year {TAX_YEAR.label} → type <b>Advance Tax (100)</b>. Use {d.input.profile.type === 'huf' ? 'the HUF’s' : 'your'} PAN. Keep the challan (CIN) for the return.
            </div>
          </div>
        </div>
      )}

      {a.liable && (
        <Card title="Instalment schedule" subtitle={a.rows.length === 1 ? 'Presumptive taxation: one instalment' : 'Cumulative percentage of the year’s tax due by each date'}>
          <div class="timeline">
            {a.rows.map((row) => {
              const s = STATUS[row.status];
              const progress = row.required ? Math.min(1, row.paidByDue / row.required) : 1;
              return (
                <div class={`inst ${row.status}`}>
                  <div class="row between">
                    <span class="when">{date(row.due)}</span>
                    <span class={`badge ${s.cls}`}>{s.label}</span>
                  </div>
                  <div class="amt num">{money(row.required)}</div>
                  <div class="tiny faint">{pct(row.pct, 0)} cumulative</div>
                  <div class="meter"><div style={{ width: `${progress * 100}%` }} /></div>
                  <div class="tiny">
                    Paid by date <b class="num">{money(row.paidByDue)}</b>
                    {row.interest > 0 && <div style="color:var(--neg)">234C interest {money(row.interest)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div class="grid grid-2">
        <Card title="Interest & fees" subtitle="If you pay each remaining instalment on time and file by the expected date.">
          <div class="calc">
            <div class="line"><span>234C — deferment (already incurred)</span><span class="num">{money(a.locked234C)}</span></div>
            <div class="line"><span>234C — total for the year</span><span class="num">{money(a.interest234C)}</span></div>
            <div class="line"><span>234B — paid &lt; 90% by 31 March</span><span class="num">{money(a.interest234B)}</span></div>
            <div class="line"><span>234A — filing after due date</span><span class="num">{money(a.interest234A)}</span></div>
            <div class="line"><span>234F — late filing fee</span><span class="num">{money(a.fee234F)}</span></div>
            <div class="line total"><span>Still to pay (tax + interest + fee)</span><span class="num">{money(a.totalDueAtFiling)}</span></div>
          </div>
        </Card>
        <Card title="If you pay nothing more" subtitle="Interest builds at 1% a month until the tax is paid.">
          <div class="calc">
            <div class="line"><span>234C</span><span class="num">{money(a.ifNothingMore.interest234C)}</span></div>
            <div class="line"><span>234B</span><span class="num">{money(a.ifNothingMore.interest234B)}</span></div>
            <div class="line"><span>234A</span><span class="num">{money(a.ifNothingMore.interest234A)}</span></div>
            <div class="line total"><span>Extra interest</span><span class="num" style="color:var(--neg)">{money(a.ifNothingMore.total)}</span></div>
          </div>
          {a.ifNothingMore.total - (a.interest234C + a.interest234B + a.interest234A) > 0 && (
            <p class="small muted mt">Paying on schedule saves {money(a.ifNothingMore.total - (a.interest234C + a.interest234B + a.interest234A))} in interest.</p>
          )}
        </Card>
      </div>

      <Card title="Payments counted" subtitle="Payments in the statement categorised as advance tax, plus any you added in Details.">
        {d.allPayments.length ? (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Source</th><th class="r">Amount</th><th class="r">Running total</th></tr></thead>
              <tbody>
                {d.allPayments.reduce<{ rows: preact.JSX.Element[]; run: number }>((acc, p) => {
                  acc.run += p.amount;
                  acc.rows.push(
                    <tr>
                      <td>{date(p.date)}</td>
                      <td><span class="badge">{p.label ?? 'Manual'}</span></td>
                      <td class="r num">{money(p.amount)}</td>
                      <td class="r num">{money(acc.run)}</td>
                    </tr>,
                  );
                  return acc;
                }, { rows: [], run: 0 }).rows}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="small muted">No payments yet.</p>
        )}
      </Card>

      <Card title="Rules that apply">
        <ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:6px">
          <li>Due dates: 15 Jun (15%), 15 Sep (45%), 15 Dec (75%), 15 Mar (100%). 44AD/44ADA: 100% by 15 Mar.</li>
          <li>No 234C interest for June if ≥ 12% is paid, or for September if ≥ 36% is paid.</li>
          <li>234C is 1% a month for 3 months on each shortfall (1 month for March), on the shortfall rounded down to ₹100.</li>
          <li>234B: if advance tax paid is below 90% of assessed tax, 1% a month (or part) from 1 April to the date of payment/filing.</li>
          <li>Capital gains, dividends or winnings that arise after a due date need no 234C interest if tax on them is paid in the remaining instalments.</li>
          <li>Resident senior citizens (60+) with no business/professional income don’t need to pay advance tax.</li>
          <li>Return due: {date(RETURN_DUE.noBusiness)} (no business), {date(RETURN_DUE.businessNonAudit)} (business, no audit), {date(RETURN_DUE.audit)} (audit).</li>
        </ul>
      </Card>
    </div>
  );
}
