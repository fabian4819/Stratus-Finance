# Individual real stocks: many names, not just an index

**Status: in progress.** GOLD-x/STOCK-x's basket mechanism (mint,
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

## Scope: all 11 major-name matches, not an arbitrary subset

Cross-checked a broad list of ~60 well-known US equity tickers against
RedStone's live `redstone-primary-prod` catalog (same source used for
`XAU`/`USA500.Y`). Every recognizable major name that matched is
included — not a cherry-picked handful:

| Ticker | Symbol | Company |
|---|---|---|
| AAPL | AAPL-x | Apple |
| TSLA | TSLA-x | Tesla |
| MSFT | MSFT-x | Microsoft |
| NVDA | NVDA-x | Nvidia |
| GOOGL | GOOGL-x | Alphabet |
| AMZN | AMZN-x | Amazon |
| META | META-x | Meta |
| BRKB | BRKB-x | Berkshire Hathaway |
| CVX | CVX-x | Chevron |
| AMD | AMD-x | AMD |
| PLTR | PLTR-x | Palantir |

Notably absent despite being checked: JPM, V, MA, UNH, XOM, JNJ, WMT,
KO, and ~40 more major names — RedStone's catalog simply doesn't carry
them (confirmed by direct lookup against the raw gateway response, not
assumed). Stated plainly rather than implying broader coverage than what
was actually verified live.

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
   extended) — now loops over every individual stock whose token is
   issued *and* whose feed id is wired, skipping (with a clear log line,
   not a silent no-op) anything still mid-rollout. Verified this still
   works correctly with all 11 pending — the original GOLD-x/STOCK-x/USDC
   refresh keeps working unaffected.

## Progress log

- 2026-09-09: 5/11 tokens issued (AAPL-x, TSLA-x, MSFT-x, NVDA-x,
  GOOGL-x) before the deployer wallet ran out of HBAR — ATS diamond
  deploys cost ~8.1 HBAR each. Remaining 6 (AMZN-x, META-x, BRKB-x,
  CVX-x, AMD-x, PLTR-x) blocked on a testnet faucet cooldown.
- Reserve-registration and oracle-wiring scripts written and ready, not
  yet run — both depend on all 11 tokens existing first.
- Frontend UI for the new reserves not yet built — pending the above.
