import { useMemo, useState } from 'preact/hooks';
import type { AppState, Derived } from '../lib/state';
import { inYear } from '../lib/state';
import { CATEGORIES, CREDIT_CATEGORIES, DEBIT_CATEGORIES, counterpartyKey, type Category } from '../lib/statement/classify';
import { date, money } from '../lib/format';
import { Card, Empty, MoneyField, Segmented, Switch } from './ui';

type Dir = 'all' | 'cr' | 'dr';

const KIND_BADGE: Record<string, string> = {
  taxable: 'pos',
  business: 'pos',
  gift: 'warn',
  review: 'warn',
  tax: 'info',
  deduction: 'accent',
  exempt: '',
  neutral: '',
};

function CategorySelect({ value, credit, onChange }: { value: Category; credit: boolean; onChange: (c: Category) => void }) {
  const list = credit ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
  return (
    <select class="input cat-select" value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value as Category)}>
      {list.map((c) => (
        <option value={c}>{CATEGORIES[c].label}</option>
      ))}
    </select>
  );
}

function toCsv(rows: Derived['categorized']): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ['Date', 'Narration', 'Reference', 'Withdrawal', 'Deposit', 'Balance', 'Category', 'Tax treatment'];
  return [head.join(','), ...rows.map(({ t, category }) =>
    [t.date, esc(t.narration), esc(t.ref), t.withdrawal || '', t.deposit || '', t.balance, esc(CATEGORIES[category].label), CATEGORIES[category].kind].join(','),
  )].join('\n');
}

export function Transactions(props: { state: AppState; d: Derived; set: (fn: (s: AppState) => AppState) => void; initialFilter?: string; toast: (m: string) => void }) {
  const { d, state, set } = props;
  const [q, setQ] = useState('');
  const [dir, setDir] = useState<Dir>(props.initialFilter === 'review' ? 'cr' : 'all');
  const [cat, setCat] = useState<string>(props.initialFilter === 'review' ? 'review' : '');
  const [onlyYear, setOnlyYear] = useState(true);
  const [similar, setSimilar] = useState<{ key: string; category: Category; ids: string[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return d.categorized.filter(({ t, category }) => {
      if (onlyYear && !inYear(t.date)) return false;
      if (dir === 'cr' && !t.deposit) return false;
      if (dir === 'dr' && !t.withdrawal) return false;
      if (cat && category !== cat) return false;
      if (needle && !`${t.narration} ${t.ref} ${t.deposit || t.withdrawal}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [d.categorized, q, dir, cat, onlyYear]);

  const totals = rows.reduce((s, { t }) => ({ cr: s.cr + t.deposit, dr: s.dr + t.withdrawal }), { cr: 0, dr: 0 });

  function setCategory(id: string, category: Category) {
    set((s) => ({ ...s, overrides: { ...s.overrides, [id]: category } }));
    const row = d.categorized.find((r) => r.t.id === id);
    if (!row) return;
    const key = counterpartyKey(row.t.narration);
    const credit = row.t.deposit > 0;
    const ids = d.categorized
      .filter((r) => r.t.id !== id && (r.t.deposit > 0) === credit && r.category !== category && counterpartyKey(r.t.narration) === key)
      .map((r) => r.t.id);
    setSimilar(ids.length && key ? { key, category, ids } : null);
  }

  function applyMany(ids: string[], category: Category) {
    set((s) => {
      const overrides = { ...s.overrides };
      for (const id of ids) {
        const t = s.transactions.find((x) => x.id === id);
        if (t && CATEGORIES[category].dir === (t.deposit > 0 ? 'cr' : 'dr')) overrides[id] = category;
      }
      return { ...s, overrides };
    });
    props.toast(`Updated ${ids.length} transactions`);
  }

  function download() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'taxlens-transactions.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  if (!state.transactions.length)
    return (
      <Card>
        <Empty icon="🧾" title="No transactions yet">Upload a statement on the Overview tab, or try the demo.</Empty>
      </Card>
    );

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.t.id));
  const overriddenCount = Object.keys(state.overrides).length;

  return (
    <div class="stack fade-in">
      <div class="page-head">
        <div>
          <h1>Transactions</h1>
          <p>Every row is auto-categorised. Change any category — totals and tax update instantly.</p>
        </div>
        <div class="row">
          {overriddenCount > 0 && (
            <button class="btn ghost sm" onClick={() => set((s) => ({ ...s, overrides: {} }))}>Reset {overriddenCount} edits</button>
          )}
          <button class="btn" onClick={download}>Export CSV</button>
        </div>
      </div>

      <Card title="Category summary" subtitle={`Tax year so far. Recurring categories are projected ×${d.coverage.factor.toFixed(2)} to a full year when projection is on.`}>
        <div class="row between" style="margin-bottom:12px">
          <Switch
            checked={state.project}
            onChange={(v) => set((s) => ({ ...s, project: v }))}
            label="Project recurring income to the full year"
            hint={`Statement covers ${d.coverage.days} of 365 days`}
          />
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Treatment</th>
                <th class="r">Count</th>
                <th class="r">So far</th>
                <th>Recurring</th>
                <th class="r">Full year</th>
              </tr>
            </thead>
            <tbody>
              {[...d.totals]
                .sort((a, b) => (CATEGORIES[a.category].dir === CATEGORIES[b.category].dir ? b.actual - a.actual : CATEGORIES[a.category].dir === 'cr' ? -1 : 1))
                .map((t) => {
                  const info = CATEGORIES[t.category];
                  return (
                    <tr>
                      <td>
                        <a href="#" onClick={(e) => { e.preventDefault(); setCat(t.category); setDir('all'); }}>{info.label}</a>
                        <div class="tiny faint">{info.help}</div>
                      </td>
                      <td><span class={`badge ${KIND_BADGE[info.kind]}`}>{info.kind}</span></td>
                      <td class="r num">{t.count}</td>
                      <td class={`r num ${info.dir === 'cr' ? 'cr' : ''}`}>{money(t.actual)}</td>
                      <td>
                        {(info.kind === 'taxable' || info.kind === 'business' || info.kind === 'deduction') && (
                          <input
                            type="checkbox"
                            class="check"
                            checked={!!state.recurring[t.category]}
                            onChange={(e) => set((s) => ({ ...s, recurring: { ...s.recurring, [t.category]: (e.target as HTMLInputElement).checked } }))}
                            aria-label={`Treat ${info.label} as recurring`}
                          />
                        )}
                      </td>
                      <td class="r num">{money(t.projected)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="flush">
        <div style="padding:16px 20px" class="row between">
          <div class="row">
            <input class="input" style="width:240px" placeholder="Search narration, ref, amount…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            <Segmented value={dir} onChange={setDir} options={[{ value: 'all', label: 'All' }, { value: 'cr', label: 'Credits' }, { value: 'dr', label: 'Debits' }]} />
            <select class="input" style="width:auto" value={cat} onChange={(e) => setCat((e.target as HTMLSelectElement).value)}>
              <option value="">All categories</option>
              {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                <option value={c}>{CATEGORIES[c].label}</option>
              ))}
            </select>
            <label class="check small">
              <input type="checkbox" checked={onlyYear} onChange={(e) => setOnlyYear((e.target as HTMLInputElement).checked)} /> Tax year only
            </label>
          </div>
          <span class="small muted num">
            {rows.length} rows · in {money(totals.cr)} · out {money(totals.dr)}
          </span>
        </div>

        {similar && (
          <div class="alert info" style="margin:0 20px 12px">
            <div class="ico">≈</div>
            <div class="row between" style="flex:1">
              <p>
                {similar.ids.length} more transactions from <b>{similar.key}</b>. Mark them all as <b>{CATEGORIES[similar.category].label}</b>?
              </p>
              <div class="row">
                <button class="btn sm primary" onClick={() => { applyMany(similar.ids, similar.category); setSimilar(null); }}>Apply to all</button>
                <button class="btn sm ghost" onClick={() => setSimilar(null)}>Dismiss</button>
              </div>
            </div>
          </div>
        )}

        {selected.size > 0 && (
          <div class="row" style="padding:0 20px 12px">
            <b class="small">{selected.size} selected →</b>
            <select class="input" style="width:auto" onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value as Category;
              if (v) { applyMany([...selected], v); setSelected(new Set()); }
            }}>
              <option value="">Set category…</option>
              {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                <option value={c}>{CATEGORIES[c].dir === 'cr' ? 'Credit · ' : 'Debit · '}{CATEGORIES[c].label}</option>
              ))}
            </select>
            <button class="btn sm ghost" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        <div class="table-wrap" style="max-height:70vh">
          <table>
            <thead>
              <tr>
                <th style="width:32px">
                  <input type="checkbox" checked={allSelected} aria-label="Select all" onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.t.id)))} />
                </th>
                <th>Date</th>
                <th>Narration</th>
                <th class="r">Amount</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ t, category }) => {
                const credit = t.deposit > 0;
                const edited = !!state.overrides[t.id];
                return (
                  <tr class={category === 'review' ? 'review' : ''}>
                    <td>
                      <input type="checkbox" checked={selected.has(t.id)} aria-label="Select row" onChange={() => {
                        const n = new Set(selected);
                        n.has(t.id) ? n.delete(t.id) : n.add(t.id);
                        setSelected(n);
                      }} />
                    </td>
                    <td class="num small">{date(t.date)}{!t.balanceOk && <div class="tiny" style="color:var(--warn)" title="Running balance does not reconcile">⚠ check</div>}</td>
                    <td class="narr">
                      {t.narration}
                      {t.ref && <div class="ref">{t.ref}</div>}
                      {category === 'tax_refund' && (
                        <div style="max-width:220px;margin-top:6px">
                          <MoneyField
                            label="of which interest (taxable)"
                            value={state.refundInterest[t.id] ?? 0}
                            onChange={(v) => set((s) => ({ ...s, refundInterest: { ...s.refundInterest, [t.id]: v } }))}
                          />
                        </div>
                      )}
                    </td>
                    <td class={`r num ${credit ? 'cr' : 'dr'}`}>{credit ? '+' : '−'}{money(t.deposit || t.withdrawal, true).replace('−', '')}</td>
                    <td>
                      <CategorySelect value={category} credit={credit} onChange={(c) => setCategory(t.id, c)} />
                      <div class="tiny" style="margin-top:4px">
                        <span class={`badge ${KIND_BADGE[CATEGORIES[category].kind]}`}>{CATEGORIES[category].kind}</span>
                        {edited && <span class="badge" style="margin-left:4px">edited</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <Empty icon="🔍" title="Nothing matches these filters" />}
        </div>
      </Card>
    </div>
  );
}
