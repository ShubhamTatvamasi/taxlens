# TaxLens

Estimate income tax and advance tax for **individuals and HUFs** from an HDFC Bank statement PDF — entirely in the browser.

- Parses HDFC "Statement of account" PDFs with PDF.js (password-protected files supported), checks every row against the running balance and the bank's summary.
- Auto-categorises transactions (interest, salary, rent, dividends, refunds, cashback, own/member transfers, tax payments, FD bookings, 80C/80D/80G payments …). Every category is editable, with "apply to similar" and bulk edit.
- Projects recurring income to a full year, accrues interest on cumulative FDs, and takes manual inputs for salary, house property, business (regular / 44AD / 44ADA), capital gains, other income, deductions and TDS.
- Computes **both regimes** for tax year 2026-27 (Income-tax Act 2025): slabs, 87A rebate and marginal relief, special rates (111A/112/112A, pre-2024 property indexation, winnings, VDA), unused-exemption adjustment, agricultural income integration, set-off rules, surcharge with 15% cap and marginal relief, cess, rounding.
- **Advance tax planner**: instalments, what to pay now, 234C/234B/234A interest, 234F fee, presumptive and senior-citizen cases.
- Insights for HUF clubbing (Sec 64(2)), gifts, SFT cash limits, 15G/15H, LTCG harvesting, refunds, regime switching rules.
- System / light / dark theme. Export/import a session as JSON; "remember on this device" is opt-in.

## Privacy

There is no backend. A Content-Security-Policy (`connect-src 'self'`) blocks requests to any other origin, and PDF.js font data is served from this site. Nothing is stored unless you turn on "Remember on this device" (browser `localStorage`).

## Develop

```sh
npm install
npm run dev      # http://localhost:4321/taxlens/
npm test         # tax engine, advance tax, FD accrual, parser (synthetic PDF), classifier
npm run build    # astro check + static build into dist/
```

Tests use invented data only. Never commit real statements — `*.pdf` is git-ignored.

## Deploy (GitHub Pages)

1. Push to `main` of a repo under the account that serves `shubhamtatvamasi.com` from GitHub Pages.
2. In the repo: **Settings → Pages → Source: GitHub Actions**.
3. `.github/workflows/deploy.yml` runs tests, builds with `BASE_PATH=/<repo-name>` and publishes `dist/`.

When the custom domain is set on the user site (`<user>.github.io`), every project site is served at `https://shubhamtatvamasi.com/<repo-name>/`, so this repo needs no CNAME file. The base path follows the repo name automatically; locally it defaults to `/taxlens` (`astro.config.mjs`).

## Layout

| Path | What |
| --- | --- |
| `src/lib/tax/rules.ts` | All tax-year constants (slabs, limits, due dates) — update here each year |
| `src/lib/tax/engine.ts` | Regime computation and comparison |
| `src/lib/tax/advance.ts` | Advance tax schedule and 234A/B/C/F |
| `src/lib/tax/fd.ts` | FD interest accrual and TDS estimate |
| `src/lib/statement/hdfc.ts` | Positioned-text parser for HDFC statements |
| `src/lib/statement/classify.ts` | Categories and classification rules |
| `src/lib/state.ts` | App state → tax input, insights |
| `src/components/*` | Preact UI |
| `src/pages/guide.astro` | Tax rules reference (rendered from `rules.ts`) |

TaxLens gives estimates, not tax advice. Verify with Form 26AS / AIS before filing.
