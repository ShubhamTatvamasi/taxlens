import { describe, expect, it } from 'vitest';
import { defaultState, derive, type AppState } from '../src/lib/state';
import { demoStatement } from '../src/lib/demo';

const withDemo = (kind: 'individual' | 'huf', patch: (s: AppState) => void = () => {}) => {
  const p = demoStatement(kind);
  const s = defaultState('2026-10-30');
  s.statements = [{ meta: p.meta, warnings: [] }];
  s.transactions = p.transactions;
  s.manual.profile.type = kind;
  patch(s);
  return derive(s);
};

describe('derive (demo data)', () => {
  it('classifies, projects and plans advance tax for an individual', () => {
    const d = withDemo('individual');
    expect(d.byCategory.salary?.count).toBe(7);
    expect(d.byCategory.tax_advance?.actual).toBe(1_65_000);
    expect(d.byCategory.ded_80c?.actual).toBe(42_000);
    expect(d.byCategory.review?.count).toBe(1);
    // Recurring salary is projected beyond the 7 months seen.
    expect(d.byCategory.salary!.projected).toBeGreaterThan(d.byCategory.salary!.actual);
    expect(d.input.salary.gross).toBeCloseTo(d.byCategory.salary!.projected);
    expect(d.advance.liable).toBe(true);
    expect(d.advance.next?.due).toBe('2026-12-15');
    expect(d.insights.some((i) => i.title.includes('need'))).toBe(true);
  });

  it('turning projection off uses only what was seen', () => {
    const d = withDemo('individual', (s) => (s.project = false));
    expect(d.byCategory.salary!.projected).toBe(d.byCategory.salary!.actual);
  });

  it('re-categorised tax payments stop counting as advance tax', () => {
    const p = demoStatement('individual');
    const taxIds = p.transactions.filter((t) => /CBDT/.test(t.narration)).map((t) => t.id);
    const d = withDemo('individual', (s) => (s.overrides = Object.fromEntries(taxIds.map((id) => [id, 'tax_other']))));
    expect(d.advance.paidAdvance).toBe(0);
  });

  it('HUF gets HUF-specific insights and no rebate', () => {
    const d = withDemo('huf');
    expect(d.insights.some((i) => i.title === 'HUF essentials')).toBe(true);
    expect(d.comparison.new.rebate).toBe(0);
  });
});
