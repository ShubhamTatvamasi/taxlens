import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { defaultState, derive, hydrate, loadSaved, persist, type AppState } from '../lib/state';
import type { ParsedStatement } from '../lib/statement/hdfc';
import { demoStatement } from '../lib/demo';
import { todayIso } from '../lib/format';
import { Overview } from './Overview';
import { Transactions } from './Transactions';
import { Details } from './Details';
import { Deposits } from './Deposits';
import { TaxView } from './TaxView';
import { AdvanceView } from './AdvanceView';
import { Switch } from './ui';

type Tab = 'overview' | 'transactions' | 'details' | 'deposits' | 'tax' | 'advance';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◎' },
  { id: 'transactions', label: 'Transactions', icon: '☰' },
  { id: 'details', label: 'Details', icon: '✎' },
  { id: 'deposits', label: 'FDs', icon: '🏦' },
  { id: 'tax', label: 'Tax', icon: '⚖' },
  { id: 'advance', label: 'Advance tax', icon: '⏰' },
];

const txKey = (t: { date: string; narration: string; deposit: number; withdrawal: number; balance: number }) =>
  `${t.date}|${t.deposit}|${t.withdrawal}|${t.balance}|${t.narration.slice(0, 24)}`;

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const base = defaultState(todayIso());
    const saved = typeof window !== 'undefined' ? loadSaved() : null;
    return saved ? hydrate(saved, base) : base;
  });
  const [tab, setTab] = useState<Tab>('overview');
  const [txFilter, setTxFilter] = useState<string | undefined>();
  const [toast, setToast] = useState('');
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => persist(state), [state]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const d = useMemo(() => derive(state), [state]);

  const goto = (target: string) => {
    const [t, filter] = target.split(':');
    setTxFilter(filter);
    setTab(t as Tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  function addStatement(p: ParsedStatement) {
    setState((s) => {
      const seen = new Set(s.transactions.map(txKey));
      const fresh = p.transactions.filter((t) => !seen.has(txKey(t)));
      const transactions = [...s.transactions, ...fresh].sort((a, b) => a.date.localeCompare(b.date));
      const isFirst = s.statements.length === 0;
      const huf = /\bHUF\b/i.test(p.meta.holderName);
      const dupes = p.transactions.length - fresh.length;
      setToast(`Loaded ${fresh.length} transactions${dupes ? ` · skipped ${dupes} duplicates` : ''}${isFirst && huf ? ' · detected HUF' : ''}`);
      return {
        ...s,
        statements: [...s.statements, { meta: p.meta, warnings: p.warnings }],
        transactions,
        manual: isFirst ? { ...s.manual, profile: { ...s.manual.profile, type: huf ? 'huf' : 'individual' } } : s.manual,
      };
    });
  }

  function removeStatement(i: number) {
    setState((s) => {
      const st = s.statements[i];
      return {
        ...s,
        statements: s.statements.filter((_, j) => j !== i),
        transactions: s.transactions.filter((t) => t.source !== st.meta.fileName),
      };
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `taxlens-${todayIso()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMenu(false);
  }

  async function importJson(file: File) {
    try {
      const saved = JSON.parse(await file.text());
      if (saved?.version !== 1) throw new Error('Not a TaxLens file');
      setState(hydrate(saved, defaultState(todayIso())));
      setToast('Session restored');
    } catch (e) {
      setToast(`Import failed: ${(e as Error).message}`);
    }
    setMenu(false);
  }

  const reviewCount = d.byCategory.review?.count ?? 0;

  return (
    <>
      <div class="tabs-wrap no-print">
        <div class="container row between" style="flex-wrap:nowrap">
          <nav class="tabs" role="tablist">
            {TABS.map((t) => (
              <button class="tab" role="tab" aria-selected={tab === t.id} onClick={() => goto(t.id)}>
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
                {t.id === 'transactions' && reviewCount > 0 && <span class="count">{reviewCount}</span>}
              </button>
            ))}
          </nav>
          <div style="position:relative">
            <button class="btn sm" onClick={() => setMenu(!menu)} aria-expanded={menu}>Data ▾</button>
            {menu && (
              <div class="card fade-in" style="position:absolute;right:0;top:40px;width:300px;z-index:50;box-shadow:var(--shadow-lg)">
                <div class="stack" style="gap:12px">
                  <Switch
                    checked={state.remember}
                    onChange={(v) => setState((s) => ({ ...s, remember: v }))}
                    label="Remember on this device"
                    hint="Saved in this browser’s local storage only. Off by default."
                  />
                  <button class="btn sm" onClick={exportJson}>⬇ Export session (.json)</button>
                  <button class="btn sm" onClick={() => fileRef.current?.click()}>⬆ Import session</button>
                  <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) importJson(f);
                  }} />
                  <button
                    class="btn sm danger"
                    onClick={() => {
                      if (confirm('Clear all statements, edits and inputs from this page?')) {
                        const fresh = defaultState(todayIso());
                        setState(fresh);
                        persist(fresh);
                        setMenu(false);
                        setTab('overview');
                      }
                    }}
                  >
                    🗑 Clear everything
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <main class="container">
        {tab === 'overview' && (
          <Overview
            state={state}
            d={d}
            onParsed={addStatement}
            onDemo={(k) => addStatement(demoStatement(k))}
            onRemoveStatement={removeStatement}
            goto={goto}
          />
        )}
        {tab === 'transactions' && <Transactions key={txFilter} state={state} d={d} set={setState} initialFilter={txFilter} toast={setToast} />}
        {tab === 'details' && <Details state={state} d={d} set={setState} />}
        {tab === 'deposits' && <Deposits state={state} d={d} set={setState} />}
        {tab === 'tax' && <TaxView state={state} d={d} set={setState} />}
        {tab === 'advance' && <AdvanceView state={state} d={d} set={setState} goto={goto} />}
      </main>
      {toast && <div class="toast" role="status">{toast}</div>}
    </>
  );
}
