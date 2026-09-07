# Demo script (≤ 4 min video)

Click-by-click path for the submission video. PLAN.md Phase 6 gate: record
against a *freshly deployed* testnet state at least twice before filming —
a demo that only works on hand-massaged state doesn't count.

## 0. Problem (30s)

Show All Weather Finance's static basket token (or just state it):
holdable, not usable as collateral anywhere. State the Morpho-style
industry gap in one sentence (README §1).

## 1. Mint the basket (20s)

`frontend` → **Mint Basket** screen. Show GOLD-x + STOCK-x balances, mint
the Stratus ETF token, show the basket balance appear.

## 2. Deposit & decompose (45s) — the pitch

**Deposit** screen. Deposit the basket token in one action. Point at the
two resulting reserve cards — different LTV, different liquidation
threshold, different live price — and say explicitly: *"this is two
separate positions, not one averaged basket."*

## 3. Borrow (30s)

**Borrow / Repay** screen. Borrow USDC, point at the itemised capacity
(gold's contribution + stock's contribution = combined), not a single
opaque number.

## 4. The isolated liquidation (60s) — the money shot

**Risk Panel** screen, with the demo stress banner visible per PLAN.md
§6.3 (say out loud that this is a manual price stress for demo purposes,
not a real market move — this honesty is part of the credibility, not a
weakness to hide).

Trigger `demo-liquidation.ts`'s gold stress step (or a UI button wired to
the same owner-only call). Show:
- combined health factor drop below 1
- `liquidationCall` execute against gold only
- **the stock-index reserve card is untouched** — same balance, same
  health factor, before and after

## 5. Close (15s)

One sentence: real ATS tokens, real Pyth prices, real forked Aave v2
liquidation mechanics — the only thing simulated is the market move that
triggers it, and that's disclosed on-screen the whole time.

## Recording checklist

- [ ] Fresh deploy (Gate 0–4 all green) — see PLAN.md
- [ ] `deployments/hederaTestnet.json` has every address the video will show
- [ ] Wallet has a *reproducible* pre-funded balance of GOLD-x/STOCK-x/USDC
- [ ] Demo stress banner actually renders before triggering liquidation
- [ ] Tx hashes from this exact run copied into `deployments/hederaTestnet.json`
      under `meta.demoLiquidationRun` (PLAN.md §9)
