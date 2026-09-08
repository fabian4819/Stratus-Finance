# Demo script (≤ 4 min video)

Click-by-click path for the submission video. Everything below has
actually been run, for real, on the live testnet deployment — this isn't
a speculative plan, it's what the recording session should reproduce. See
[`README.md` §9](../README.md#9-live-deployment--verified-results) for
every address and [`deployments/hederaTestnet.json`](../deployments/hederaTestnet.json)
for every transaction hash from the runs referenced here.

## 0. Problem (30s)

State the gap in one breath: RWA basket tokens (All Weather Finance's
auto-rebalancing gold+stocks+bonds basket, the closest prior art) are
holdable but not usable as collateral anywhere — Morpho and similar
protocols only accept single-asset RWA collateral, because a combined
basket is hard to price and hard to liquidate safely (README §1).

## 1. Mint the basket (20s)

Frontend `/mint` (Mint Basket screen). Connect MetaMask (auto-switches to
Hedera testnet). Show the GOLD-x/STOCK-x/sETF balances read live from
chain. Enter an amount, mint — two approvals then the mint tx, balance
updates on screen.

## 2. Deposit & decompose (45s) — the pitch

Frontend `/deposit`. Deposit the basket token in one action. Point at the
two resulting reserve cards, populated live from `StratusRiskView` — say
explicitly: *"this is two separate positions with their own LTV and
liquidation threshold, not one averaged basket."* The combined health
factor is shown separately from the per-component figures on purpose —
call out that the per-component numbers are a UX heuristic, the combined
one is what the pool actually enforces.

## 3. Borrow (30s)

Frontend `/borrow`. Borrow USDC, point at the itemised capacity — gold's
collateral contribution and stock's collateral contribution shown
separately before the combined total, not a single opaque number.

## 4. The isolated liquidation (60s) — the money shot

Two ways to shoot this, pick one depending on what plays better:

**Option A — script + live frontend side by side.** In a terminal, run
`npx hardhat run contracts/script/demo-liquidation.ts --network hederaTestnet`
(deposits value-balanced collateral, borrows near max, stresses GOLD-x
−90%, liquidates). Have `/risk` open in the browser at the same time —
the **DemoStressBanner appears automatically** the moment the stress tx
lands, with zero frontend-side polling logic beyond what's already there
(confirmed working in a real browser session — see PLAN.md §Phase 5).
Say out loud that the price stress is a disclosed, owner-gated demo
mechanism (`setDemoOffsetBps`), not a hidden manipulation — the banner
existing at all is the honesty check.

**Option B — narrate over the already-recorded run.** Use the real tx
hashes from `deployments/hederaTestnet.json` → `meta.gate4LiquidationPrimary`
on HashScan as the visual, narrating what each step did.

Either way, state the result plainly:
- Health factor dropped to **0.65** after the stress.
- `liquidationCall` executed against **GOLD-x only**.
- **STOCK-x aToken balance: `0.3` before, `0.3` after — byte-for-byte
  unchanged.** This is the isolation invariant, proven, not asserted.

If time allows, mention the mirror case was also run
(`demo-liquidation-mirror.ts` — STOCK-x crashed instead, GOLD-x's
`800.0` balance unchanged) "so the isolation claim isn't a one-asset
fluke."

## 5. Close (15s)

One sentence: real ATS tokens, a real forked Aave v2 pool deployed
through the actual upgradeable-proxy flow, real liquidation mechanics —
the only thing simulated is the market move that triggers it, and that's
disclosed on-screen the whole time via the demo-stress banner. Mention in
passing that the originally-designed oracle was Pyth, and the pivot to
Chainlink's live feeds after hitting real Hedera/Pyth infrastructure
issues is documented start to finish in `docs/phase-2-findings.md` — worth
a beat if the pitch has room, since it's a real engineering story, not
just a happy-path build.

## Recording checklist

- [x] Gates 1–5 all passed for real — see `PLAN.md` and `README.md` §9.
- [x] `deployments/hederaTestnet.json` has every address and every
      verification tx hash, including both liquidation runs
      (`meta.gate4LiquidationPrimary`, `meta.gate4LiquidationMirror`).
- [ ] Before recording: check current on-chain state isn't mid-liquidation
      from a prior test run (`demo-liquidation.ts` deliberately leaves the
      position under-collateralized — it doesn't clean up after itself).
      If it's dirty, either run `demo-liquidation-mirror.ts` first (it
      repays leftover debt and clears GOLD-x's demo stress as its own
      step 0) or repay manually via `/borrow` before filming.
- [ ] Wallet used for recording has a funded GOLD-x/STOCK-x/USDC balance —
      the operator account already does; use a fresh MetaMask account
      funded the same way if recording as "a new user" for narrative
      clarity.
- [ ] Confirm the demo-stress banner actually renders in the browser
      before triggering liquidation on camera (it reads
      `oracle.isDemoStressed` live — no manual step needed once the
      on-chain state is right).
