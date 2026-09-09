# Individual real stocks: many names, not just an index

**Status: live.** 10 individual real-stock reserves (11 issued, 1
dropped after a real ticker collision was caught — see below), all
wired to real RedStone prices, all whitelisted, real deposit/withdraw
verified end-to-end, frontend built and verified in a real browser
session. GOLD-x/STOCK-x's basket mechanism (mint,
deposit/decompose, borrow/repay, liquidation) is untouched by this work —
already fully verified (Gates 1-4, see `PLAN.md`/`README.md` §9), no
regression risk. Individual stocks are added as **additional, separate
pool reserves** — deposited/borrowed directly, the same pattern already
used by `demo-liquidation.ts` to bypass the basket wrapper — not folded
into the fixed 2-asset basket/vault design.

## Why this exists

`docs/phase-3-oracle-research.md` closed the "disclosed substitute" gap
by wiring STOCK-x to RedStone's real `USA500.Y` (S&P 500 index) feed. A
fair follow-up: an index is already many stocks bundled together, but it
isn't the same as being able to point at individual, named companies. So
this adds real, separately-priced individual stock reserves alongside
the index.

## Scope: 10 confirmed, 1 caught and dropped

Cross-checked a broad list of ~60 well-known US equity tickers against
RedStone's live `redstone-primary-prod` catalog (same source used for
`XAU`/`USA500.Y`) for *existence*, then — after that first pass shipped
11 tokens on-chain — went back and sanity-checked each one's actual
*returned price value* against what its named company should plausibly
trade at. That second check caught a real mistake:

| Ticker | Symbol | Company | Status |
|---|---|---|---|
| AAPL | AAPL-x | Apple | ✅ live |
| TSLA | TSLA-x | Tesla | ✅ live |
| MSFT | MSFT-x | Microsoft | ✅ live |
| NVDA | NVDA-x | Nvidia | ✅ live |
| GOOGL | GOOGL-x | Alphabet | ✅ live |
| AMZN | AMZN-x | Amazon | ✅ live |
| META | META-x | Meta | ✅ live |
| BRKB | BRKB-x | Berkshire Hathaway | ✅ live |
| AMD | AMD-x | AMD | ✅ live |
| PLTR | PLTR-x | Palantir | ✅ live |
| CVX | ~~CVX-x~~ | ~~Chevron~~ | ❌ dropped — see below |

Notably absent despite being checked: JPM, V, MA, UNH, XOM, JNJ, WMT,
KO, and ~40 more major names — RedStone's catalog simply doesn't carry
them (confirmed by direct lookup against the raw gateway response, not
assumed). Stated plainly rather than implying broader coverage than what
was actually verified live.

## The CVX mistake, caught and corrected

`CVX` existing in the catalog isn't the same as `CVX` meaning Chevron.
After all 11 tokens were issued, reserves registered, and feeds wired,
a routine price sanity-check (`oracle.getAssetPrice()` for each asset)
returned **$2.21** for CVX-x — nowhere near Chevron's real trading range
(Chevron has essentially never traded below $50). Pulling the raw feed
response confirmed why: RedStone's `CVX` feed is **Convex Finance's
crypto governance token**, not Chevron Corporation — a genuine ticker
collision between a stock symbol and an unrelated DeFi token.

This is exactly the kind of mistake "does the ticker exist in the
catalog" alone can't catch, and it's why the other 10 were re-verified
by value, not just by symbol match, before being called correct.
CVX-x's on-chain infrastructure (ATS token, pool reserve, whitelist
entries) was already deployed and paid for in real HBAR before this was
caught — left in place, unused, and not referenced by
`tokenization/config/individual-stocks.json`, the price-refresh script,
or the frontend going forward. Nothing downstream ever labeled it as
Chevron to a user.

## Naming: on-chain symbol keeps the `-x` suffix, UI shows the real name

Discussed directly: `-x` denotes "tracker" — these are synthetic ERC20s
tracking a real price, not the literal security itself, and that
distinction matters (nobody should mistake AAPL-x for actually holding
Apple stock). Kept on the on-chain symbol for that honesty. The frontend
displays clean names ("Apple", "Tesla") rather than raw tickers — same
principle already applied to GOLD-x/STOCK-x, which now display as "Gold"
and "S&P 500 Index" (see the rename commit).

## Architecture

1. **Issuance** (`tokenization/scripts/issue-individual-stocks.ts`,
   config in `tokenization/config/individual-stocks.json`) — same
   `deployEquity`/`whitelist`/`mint` pattern as the original
   GOLD-x/STOCK-x issuance, one real ATS Equity diamond per stock.
2. **Pool reserves** (`contracts/lib/bonzo/script/add-individual-stock-reserves.ts`)
   — `batchInitReserve` against the *already-live* configurator, reusing
   the existing shared aToken/debtToken implementations rather than
   redeploying core infra. Collateral-enabled, no borrowing (LTV 50%,
   threshold 60%, bonus 10% — more conservative than GOLD-x's 70%/75%,
   since single-name equities are more volatile than gold or a
   diversified index).
3. **Oracle wiring** (`contracts/script/07-wire-individual-stock-feeds.ts`)
   — `StratusRedstoneOracle.setFeedId` per stock. The oracle contract
   itself needed no changes (its `feedIds` mapping was already generic).
4. **Price refresh** (`contracts/script/update-redstone-prices.ts`,
   extended) — loops over every individual stock whose token is issued
   *and* whose feed id is wired, reading from
   `tokenization/config/individual-stocks.json` (10 entries — CVX removed
   after the collision above), skipping (with a clear log line, not a
   silent no-op) anything still mid-rollout. The original
   GOLD-x/STOCK-x/USDC refresh is unaffected either way.
5. **Frontend** (`frontend/src/pages/IndividualStocks.tsx`, `/stocks`
   route) — a table of all 10 with live prices (public, no wallet
   needed) plus a deposit/withdraw form once connected, calling
   `LendingPool.deposit`/`withdraw` directly — the same mechanism the
   basket's own two reserves use under the hood, just without a
   decompose/recompose step since each reserve here is a single asset.

## What actually shipped, with real transaction hashes

- 11 ATS tokens issued, 10 kept live (`tokenization/scripts/issue-individual-stocks.ts`).
- 11 pool reserves registered via `batchInitReserve`, chunked into
  groups of 3 — an 11-at-once single call exceeded Hedera's
  per-transaction gas limit (`CONTRACT_REVERT_EXECUTED`/`INSUFFICIENT_GAS`
  during `estimateGas`); each 3-item chunk used ~6.49M gas.
- 22 whitelist transactions (LendingPool + each stock's own aToken, on
  each stock's ATS control list) — same friction as the original
  GOLD-x/STOCK-x setup: ATS's `approve()` checks the *spender*, not just
  transfer parties, so `LendingPool` itself must be whitelisted.
- 11 `setFeedId` + 14 `updatePrice` (all live assets: GOLD-x, STOCK-x,
  USDC, and the 10 confirmed-correct stocks) transactions.
- Real deposit/withdraw verified end-to-end for AAPL-x: `deposit(10)` →
  aToken balance +10, wallet −10; `withdraw(10)` → both restored exactly.
- Tx hashes in `deployments/hederaTestnet.json` under
  `meta.individualStockReserves`.

## Cost note

Turned out considerably more expensive in testnet HBAR than the first
estimate — ATS diamond deploys (~8.1 HBAR each × 11), `batchInitReserve`
chunks (~9.36 HBAR per 3-item chunk × 4), plus whitelisting/wiring/
verification, totaled roughly 300+ HBAR across the whole rollout. Two
funding rounds were needed mid-build.
