import type { AppState, Derived } from '../lib/state';
import type { TaxInput } from '../lib/tax/engine';
import type { Category } from '../lib/statement/classify';
import { date, money } from '../lib/format';
import { TAX_YEAR } from '../lib/tax/rules';
import { Card, DateField, MoneyField, Segmented, Select, Switch } from './ui';

type Section = 'salary' | 'house' | 'business' | 'gains' | 'other' | 'deductions';

export function Details(props: { state: AppState; d: Derived; set: (fn: (s: AppState) => AppState) => void }) {
  const { state, d, set } = props;
  const m = state.manual;
  const isInd = m.profile.type === 'individual';
  const setM = (fn: (m: TaxInput) => TaxInput) => set((s) => ({ ...s, manual: fn(s.manual) }));
  const stmt = (c: Category) => d.byCategory[c]?.projected ?? 0;

  function f<S extends Section>(section: S, key: keyof TaxInput[S] & string) {
    return {
      value: m[section][key] as unknown as number,
      onChange: (v: number) => setM((x) => ({ ...x, [section]: { ...x[section], [key]: v } })),
    };
  }

  const payments = state.payments;

  return (
    <div class="stack fade-in">
      <div class="page-head">
        <div>
          <h1>Your details</h1>
          <p>Add what a bank statement can’t show — gross salary, capital gains, TDS, deductions. Amounts accept 1,50,000 · 1.5L · 2cr.</p>
        </div>
      </div>

      <Card title="Taxpayer" subtitle="Rules differ for individuals and HUFs, by age and residency.">
        <div class="row" style="gap:20px;align-items:flex-end">
          <div class="field">
            <span class="label">Status</span>
            <Segmented
              value={m.profile.type}
              onChange={(v) => setM((x) => ({ ...x, profile: { ...x.profile, type: v } }))}
              options={[{ value: 'individual', label: '👤 Individual' }, { value: 'huf', label: '👨‍👩‍👧 HUF' }]}
            />
          </div>
          {isInd && (
            <div class="field">
              <span class="label">Age during the year</span>
              <Segmented
                value={m.profile.age}
                onChange={(v) => setM((x) => ({ ...x, profile: { ...x.profile, age: v } }))}
                options={[{ value: 'below60', label: 'Below 60' }, { value: 'senior', label: '60 – 79' }, { value: 'superSenior', label: '80+' }]}
              />
            </div>
          )}
          <div class="field">
            <span class="label">Residency</span>
            <Segmented
              value={m.profile.resident ? 'r' : 'nr'}
              onChange={(v) => setM((x) => ({ ...x, profile: { ...x.profile, resident: v === 'r' } }))}
              options={[{ value: 'r', label: 'Resident' }, { value: 'nr', label: 'Non-resident' }]}
            />
          </div>
        </div>
      </Card>

      {isInd && (
        <Card title="Salary / pension" subtitle="From Form 16 or payslips. HRA and allowances matter only in the old regime.">
          <div class="fields">
            <MoneyField label="Gross salary" {...f('salary', 'gross')} hint={!m.salary.gross && stmt('salary') ? `Using ${money(stmt('salary'))} net credits from statement` : 'Before TDS & deductions'} />
            <MoneyField label="Basic + DA" {...f('salary', 'basicDA')} hint="For HRA and employer NPS limits" />
            <MoneyField label="HRA received" {...f('salary', 'hraReceived')} />
            <MoneyField label="Rent paid (year)" {...f('salary', 'rentPaid')} fromStatement={!m.salary.rentPaid && m.salary.hraReceived ? stmt('rent_paid') : 0} />
            <MoneyField label="Other exempt allowances" {...f('salary', 'otherExempt')} hint="LTA, children education etc." />
            <MoneyField label="Professional tax" {...f('salary', 'professionalTax')} hint="Max ₹2,500, old regime" />
            <MoneyField label="Employer NPS (80CCD(2))" {...f('salary', 'employerNps')} hint="Both regimes · 14% / 10% of basic+DA" />
            <MoneyField label="Family pension" {...f('other', 'familyPension')} hint="⅓ or ₹25k/₹15k deduction" />
          </div>
          <div class="mt">
            <label class="check small">
              <input type="checkbox" checked={m.salary.metro} onChange={(e) => setM((x) => ({ ...x, salary: { ...x.salary, metro: (e.target as HTMLInputElement).checked } }))} />
              Rented home in a metro city (50% of basic for HRA; else 40%)
            </label>
          </div>
        </Card>
      )}

      <Card title="House property" subtitle="Rent from the statement is added automatically.">
        <div class="fields">
          <MoneyField label="Additional rent received" {...f('house', 'letOutRent')} fromStatement={stmt('rent')} />
          <MoneyField label="Municipal tax paid" {...f('house', 'municipalTax')} />
          <MoneyField label="Home-loan interest — let-out" {...f('house', 'letOutInterest')} hint="Allowed in both regimes" />
          <MoneyField label="Home-loan interest — self-occupied" {...f('house', 'selfOccupiedInterest')} hint="Old regime only, max ₹2L" />
        </div>
      </Card>

      <Card title="Business / profession" subtitle="Presumptive schemes simplify books and need just one advance-tax instalment.">
        <div class="fields">
          <Select
            label="Method"
            value={m.business.mode}
            onChange={(v) => setM((x) => ({ ...x, business: { ...x.business, mode: v } }))}
            options={[
              { value: 'none', label: 'No business income' },
              { value: 'regular', label: 'Regular books (net profit)' },
              { value: '44AD', label: '44AD — business (6% / 8%)' },
              { value: '44ADA', label: '44ADA — profession (50%)' },
            ]}
          />
          {m.business.mode === 'regular' && <MoneyField label="Net profit (loss as negative)" {...f('business', 'netProfit')} />}
          {m.business.mode === '44AD' && (
            <>
              <MoneyField label="Turnover — digital/bank" {...f('business', 'turnoverDigital')} hint={!m.business.turnoverDigital && stmt('business_receipt') ? `Using ${money(stmt('business_receipt'))} from statement` : '6% deemed profit'} />
              <MoneyField label="Turnover — cash" {...f('business', 'turnoverCash')} hint="8% deemed profit" />
            </>
          )}
          {m.business.mode === '44ADA' && (
            <MoneyField label="Gross receipts" {...f('business', 'grossReceipts')} hint={!m.business.grossReceipts && stmt('business_receipt') ? `Using ${money(stmt('business_receipt'))} from statement` : '50% deemed profit'} />
          )}
          {(m.business.mode === '44AD' || m.business.mode === '44ADA') && <MoneyField label="Declare higher profit (optional)" {...f('business', 'declaredIncome')} />}
          {m.business.mode !== 'none' && <MoneyField label="Intraday / speculative profit" {...f('business', 'speculative')} hint="Losses can’t reduce other income" />}
        </div>
        {m.business.mode !== 'none' && (
          <div class="mt">
            <label class="check small">
              <input type="checkbox" checked={m.business.audit} onChange={(e) => setM((x) => ({ ...x, business: { ...x.business, audit: (e.target as HTMLInputElement).checked } }))} />
              Tax audit applies (return due 31 Oct instead of 31 Aug)
            </label>
          </div>
        )}
        {m.business.mode !== 'none' && <p class="small muted mt">F&O trading is non-speculative business income — include it in net profit under regular books.</p>}
      </Card>

      <Card title="Capital gains" subtitle="Use your broker P&L / mutual-fund capital-gains statement (CAS). Enter net gains after setting off losses.">
        <div class="fields">
          <MoneyField label="STCG — listed equity / equity MF" {...f('gains', 'stcg111A')} hint="20% · Sec 111A" />
          <MoneyField label="LTCG — listed equity / equity MF" {...f('gains', 'ltcg112A')} hint="12.5% above ₹1.25L · Sec 112A" />
          <MoneyField label="STCG — other (slab rate)" {...f('gains', 'stcgOther')} hint="Debt MF, short-term property etc." />
          <MoneyField label="LTCG — other assets" {...f('gains', 'ltcg112')} hint="12.5%, no indexation" />
          <MoneyField label="LTCG — land/building bought before 23-Jul-2024" {...f('gains', 'ltcgProperty')} hint="Gain without indexation" />
          <MoneyField label="…same gain with indexation" {...f('gains', 'ltcgPropertyIndexed')} hint="Lower of 12.5% / 20% indexed is used (residents)" />
          <MoneyField label="Crypto / VDA gains" {...f('other', 'vda')} hint="Flat 30%, no set-off" />
        </div>
      </Card>

      <Card title="Other income" subtitle="Statement amounts (projected) are added to what you enter here.">
        <div class="fields">
          <MoneyField label="Savings interest (other banks)" {...f('other', 'savingsInterest')} fromStatement={stmt('savings_interest')} />
          <MoneyField label="FD / RD / bond interest" {...f('other', 'depositInterest')} fromStatement={stmt('fd_interest') + d.fdInterest} hint="FD planner accrual included" />
          <MoneyField label="Dividends" {...f('other', 'dividend')} fromStatement={stmt('dividend')} />
          <MoneyField label="Interest on IT refund" {...f('other', 'refundInterest')} fromStatement={stmt('refund_interest')} />
          <MoneyField label="Gifts from non-relatives" {...f('other', 'giftsFromOthers')} fromStatement={stmt('gift_nonrelative')} hint="All taxable if total > ₹50,000" />
          <MoneyField label="Other taxable income" {...f('other', 'other')} fromStatement={stmt('other_taxable')} />
          <MoneyField label="Lottery / game winnings" {...f('other', 'winnings')} hint="Flat 30%" />
          <MoneyField label="Agricultural income" {...f('other', 'agricultural')} fromStatement={stmt('agri')} hint="Exempt, affects rate" />
        </div>
      </Card>

      <Card title="Deductions" subtitle="Old regime only, except employer NPS and Agniveer (both regimes). Statement payments are added automatically.">
        <div class="fields">
          <MoneyField label="80C (PPF, ELSS, LIC, EPF, principal…)" {...f('deductions', 'd80C')} fromStatement={stmt('ded_80c')} hint="Max ₹1.5L incl. 80CCC/80CCD(1)" />
          {isInd && <MoneyField label="80CCD(1B) — own NPS" {...f('deductions', 'd80CCD1B')} hint="Extra ₹50k" />}
          <MoneyField label={isInd ? '80D — self, spouse, children' : '80D — members'} {...f('deductions', 'd80DSelf')} fromStatement={stmt('ded_80d')} hint={isInd && m.profile.age !== 'below60' ? 'Max ₹50k (senior)' : 'Max ₹25k (₹50k if senior)'} />
          {isInd && <MoneyField label="80D — parents" {...f('deductions', 'd80DParents')} hint={m.deductions.parentsSenior ? 'Max ₹50k' : 'Max ₹25k'} />}
          {isInd && <MoneyField label="80E — education loan interest" {...f('deductions', 'd80E')} />}
          <MoneyField label="80G — donations (eligible amount)" {...f('deductions', 'd80G')} fromStatement={stmt('ded_80g')} />
          {isInd && !m.salary.hraReceived && <MoneyField label="Rent paid — 80GG (no HRA)" {...f('deductions', 'rentPaidNoHra')} fromStatement={!m.deductions.rentPaidNoHra ? stmt('rent_paid') : 0} hint="Up to ₹60k/yr" />}
          <MoneyField label="80U / 80DD / 80DDB" {...f('deductions', 'disability')} hint="Disability, medical treatment" />
          {isInd && <MoneyField label="80CCH — Agniveer" {...f('deductions', 'd80CCH')} />}
          <MoneyField label="Other Chapter VI-A" {...f('deductions', 'other')} hint="80EEA, 80EEB, 80GGC…" />
        </div>
        {isInd && (
          <div class="mt">
            <label class="check small">
              <input type="checkbox" checked={m.deductions.parentsSenior} onChange={(e) => setM((x) => ({ ...x, deductions: { ...x.deductions, parentsSenior: (e.target as HTMLInputElement).checked } }))} />
              Parents are senior citizens
            </label>
          </div>
        )}
      </Card>

      <Card title="Taxes already paid" subtitle="TDS/TCS from Form 26AS / AIS, and any advance tax not visible in the uploaded statements.">
        <div class="fields">
          <MoneyField
            label="TDS + TCS for the year"
            value={m.tdsTcs}
            onChange={(v) => setM((x) => ({ ...x, tdsTcs: v }))}
            hint={d.estimatedFdTds ? `Bank TDS on interest is likely ≈ ${money(d.estimatedFdTds)}` : 'Salary TDS, bank TDS, TCS on foreign remittance…'}
          />
        </div>
        <div class="divider" />
        <div class="row between">
          <b>Advance tax payments</b>
          <button class="btn sm" onClick={() => set((s) => ({ ...s, payments: [...s.payments, { date: s.asOf, amount: 0, label: 'Manual' }] }))}>+ Add payment</button>
        </div>
        <div class="stack mt" style="gap:8px">
          {d.statementPayments.map((p) => (
            <div class="row small">
              <span class="badge info">statement</span> {date(p.date)} <b class="num">{money(p.amount)}</b>
            </div>
          ))}
          {payments.map((p, i) => (
            <div class="row" style="align-items:flex-end">
              <div style="width:180px">
                <DateField label="Date" value={p.date} min={TAX_YEAR.start} max={TAX_YEAR.end} onChange={(v) => set((s) => ({ ...s, payments: s.payments.map((x, j) => (j === i ? { ...x, date: v } : x)) }))} />
              </div>
              <div style="width:200px">
                <MoneyField label="Amount" value={p.amount} onChange={(v) => set((s) => ({ ...s, payments: s.payments.map((x, j) => (j === i ? { ...x, amount: v } : x)) }))} />
              </div>
              <button class="btn sm ghost danger" onClick={() => set((s) => ({ ...s, payments: s.payments.filter((_, j) => j !== i) }))}>Remove</button>
            </div>
          ))}
          {!payments.length && !d.statementPayments.length && <p class="small muted">No advance tax payments recorded.</p>}
        </div>
      </Card>

      <Card title="Assumptions">
        <div class="row" style="gap:24px">
          <Switch checked={state.project} onChange={(v) => set((s) => ({ ...s, project: v }))} label="Project recurring statement income to a full year" hint="Recommended for advance tax" />
        </div>
      </Card>
    </div>
  );
}
