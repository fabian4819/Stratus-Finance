# Phase 2 findings

## Lending core deploy: SUCCESS

The full Bonzo/Aave v2 core deployed for real on Hedera testnet through
the standard upgradeable-proxy flow (not the bare-implementation shortcut
the Phase 0 spike used) — libraries, `LendingPool` proxy,
`LendingPoolConfigurator` proxy, `LendingPoolCollateralManager`,
`AaveProtocolDataProvider`, `LendingRateOracle`, shared
AToken/StableDebtToken/VariableDebtToken implementations, and three
per-reserve `DefaultReserveInterestRateStrategy` instances. All addresses
in `deployments/hederaTestnet.json`. Biggest single transaction was
`batchInitReserve` at 6,502,369 gas — still comfortably within Hedera's
per-transaction ceiling, confirming the Phase 0 finding (no gas issue)
holds for the full reserve-initialization path too, not just bare
contract creation.

Reserves initialized with the risk parameters from `PLAN.md` §Phase 2 /
`docs/risk-params.md`:

| Reserve | LTV | Threshold | Bonus | Collateral? | Borrowable? |
|---|---|---|---|---|---|
| GOLD-x | 70% | 75% | 5% | Yes | No |
| STOCK-x | 55% | 65% | 10% | Yes | No |
| USDC | — | — | — | No | Yes (variable only) |

## New finding: ATS's `approve()` also gates the spender

Depositing GOLD-x directly into the pool requires `gold.approve(pool, amount)`
first (standard ERC20 pattern — `LendingPool.deposit` calls
`IERC20(asset).safeTransferFrom(msg.sender, aToken, amount)`, so the pool
contract is the ERC20 "spender"). That `approve()` call itself reverted
with `AccountIsBlocked(address)` naming the **pool proxy**, not the
aToken — confirming ATS's control-list check applies to the *spender*
being granted an allowance, not just to the parties of an eventual
transfer. Whitelisted the `LendingPool` proxy address alongside the
per-reserve aTokens; `tokenization/scripts/whitelist-protocol-addresses.ts`
updated to whitelist it on both assets (it can be the spender for either
leg). This generalizes cleanly to Phase 3: `StratusVault` calling
`pool.deposit` on the user's behalf means the *vault* is also a spender
Aave-side and must stay whitelisted — already covered since the vault
address is in the same whitelist list.

## Blocker: Pyth Hermes now requires an API key

**Confirmed dated, not sandbox-specific:** Pyth's docs state *"Pyth Core
upgrade completed successfully on August 26, 2026 ... Hermes now requires
an API Key."* `https://hermes.pyth.network` — the endpoint the on-chain
`StratusPriceOracle.updatePriceFeeds` design (Phase 0 finding) depends on
for fetching fresh update data — now returns `401 unauthorized` on every
request, with no working free-tier fallback found.

**How to get one** (from `docs.pyth.network/price-feeds/pro/acquire-api-key`):
1. Sign up for a free Pyth Terminal account at https://pythdata.app
2. Once logged in, click "🔑 View your API key"
3. Use it as `Authorization: Bearer {key}` on Hermes requests

**Cost model, confirmed from Pyth's own upgrade guide** (`docs.pyth.network/price-feeds/core/upgrade/preparing`,
"Step 1: Get a Pyth API Key"): *"Required for everyone who calls Hermes.
Sign up at Pyth Terminal: **a free trial is included, paid plans cover
ongoing use.**"* This is not a permanently-free tier — it's trial-then-paid,
for the exact same key regardless of whether you call it "Hermes" or
"Pyth Pro." No public pricing figures are visible before signup.

**Decision (2026-09-07):** the free trial is sufficient for this
project's actual need — a small number of on-demand price pushes to
verify Gate 2's borrow/repay leg and to record the Phase 4 liquidation
demo, not a running production service. Using the trial for that,
documented here as a known limitation rather than something to route
around: **a live, ongoing deployment of Stratus Finance would need a paid
Pyth plan** to keep `updatePriceFeeds` callable indefinitely. That's a
real operational cost of the design, not a flaw specific to this
implementation — any protocol pulling fresh Pyth prices on Hedera testnet
hits the same requirement now.

**Status:** user is registering for a trial key. Everything that doesn't
need a *fresh* oracle read was completed and verified for real in the
meantime:

- ✅ Full lending core deployed and reserves initialized (above).
- ✅ Deposit GOLD-x directly into the pool → aGOLD-x minted 1:1 (confirmed: `ValidationLogic.validateDeposit` never touches the oracle at all).
- ✅ Withdraw it back out → balances exact (confirmed: `validateWithdraw` only needs the oracle when the withdrawer has active debt against the withdrawn collateral; with zero debt it's skipped).
- ⏳ **Blocked:** `pool.getUserAccountData` (reads the oracle unconditionally, even at zero debt, to report total collateral value) and `pool.borrow` (needs a live price to compute available borrow capacity and health factor) both revert on Pyth's stale cached prices — `getPriceNoOlderThan(id, 60)` correctly rejects data that's hours-to-months old, and there is currently no way to push a fresh update without a Hermes API key.

**Update — key obtained, `updatePriceFeeds` fixed, but a new blocker
appeared underneath it.** The user registered a trial key
(`docs.pyth.network/price-feeds/pro/acquire-api-key`) and it authenticates
correctly against Hermes (`Authorization: Bearer {key}`, confirmed with a
real 200 response and price data for XAU/USD, ETH/USD, and USDC/USD in
one combined VAA blob — Hermes batches multiple feed updates into a
single `binary.data` entry when requested together, not one entry per
feed, which is expected behavior, not a bug).

**Fixed along the way:** `StratusPriceOracle.updatePriceFeeds` reverted
with its own `"insufficient fee"` even when sent the exact fee
`pyth.getUpdateFee` quoted (a few wei). Root cause: Hedera's native HBAR
ledger only tracks whole tinybars (1 tinybar = 1e10 wei at this contract's
18-decimal precision) — a value transfer below that granularity,
including this contract's own forwarded call to `pyth.updatePriceFeeds`,
rounds down, in this case to zero. Fixed by rounding the fee up to the
nearest tinybar before both the external caller sends it and before this
contract forwards it (`_roundUpToTinybar`, both in the contract and
mirrored in `contracts/script/update-oracle-prices.ts` and the test
suite). **Redeployed** `StratusPriceOracle` at
`0xB590789A6cC576ED8C14A3E846c16b9f9a4Cc681` with the fix, and
re-pointed `LendingPoolAddressesProvider.setPriceOracle` at it
(`contracts/lib/bonzo/script/update-price-oracle.ts` — needed because the
pool reads the oracle address from the provider, not from
`deployments.json` directly; any future oracle redeploy needs this same
step).

**New blocker found immediately after, isolated to rule out our own
code:** calling the real, on-chain Pyth contract's `updatePriceFeeds`
**directly** (bypassing `StratusPriceOracle` entirely) with real Hermes
update data and a generous 0.01 HBAR value still reverts — with
`InvalidWormholeVaa()` (selector `0x2acbe915`, decoded from raw revert
data against Pyth's known custom errors), not a fee-related error at all.
This is Pyth's own Wormhole-VAA signature verification rejecting the
update data itself. Likely cause: Pyth's August 26 "Core upgrade" changed
the Wormhole guardian set / VAA format that Hermes now signs with, and
Hedera testnet's specific on-chain Pyth receiver may not be fully synced
to the new format yet, despite the upgrade guide describing addresses as
"upgraded in place." Not something fixable from the Stratus Finance
codebase — confirmed by testing against the raw Pyth contract with no
Stratus code in the call path at all.

**Decision (2026-09-07, with user):** stop debugging this — it's
infrastructure outside this repo's control, and continued attempts cost
testnet HBAR without a clear path to resolution from our side. Move on to
Phase 3 (`StratusVault`, which doesn't need a live oracle read to deploy
or for its basket decomposition/recomposition logic).

**Retried 2026-09-08, one more round before giving up:**
- Same `InvalidWormholeVaa()` on a fresh attempt with newly-fetched update data.
- Checked whether it's a stale-guardian-set problem specifically: read the
  actual Wormhole core contract Hedera's Pyth receiver points at
  (`0xb27e5ca259702f209a29225d0eDdC131039C9933`) — its
  `getCurrentGuardianSetIndex()` returns `7`. Cross-checked against a live,
  real VAA pulled from Wormholescan's public API — also guardian set `7`.
  **They match** — ruling out the guardian-set-rotation theory.
- Checked whether Hermes' "deprecated legacy" `/api/latest_vaas` endpoint
  returns pre-Accumulator raw VAA bytes instead: it doesn't — both
  endpoints return data prefixed with the same `PNAU` Accumulator magic
  bytes. Hermes has fully migrated; there's no way to request the older
  wire format anymore.
- Checked whether Hedera's receiver is a standard EIP-1967 proxy (to find
  and inspect its implementation contract for a version marker): its
  `_IMPLEMENTATION_SLOT` is empty, so it's not that pattern.
- **Conclusion:** most likely a genuine contract-version gap — Hedera
  testnet's specific Pyth receiver deployment hasn't been upgraded to
  parse the current Accumulator update format, independent of guardian
  set validity. Not diagnosable further from outside (would need Pyth's
  or Hedera's own team, or the receiver's verified source). Stopped here.

## Resolution: pivoted the live oracle to Chainlink

Prompted by the user asking whether another sponsor's infrastructure
could substitute — checked, and it can, cleanly. **Chainlink has real,
live, push-based price feeds on Hedera testnet**, confirmed via
`reference-data-directory.vercel.app/feeds-hedera-testnet.json` and a
direct `latestRoundData()` call showing HBAR/USD updated within the prior
hour (ETH/USD within ~3h, BTC/USD within ~1h — all comfortably inside the
86400s heartbeat). Because Chainlink feeds are pushed on-chain by an
active oracle network rather than pulled on demand, there is no
Hermes-equivalent, no API key, and no per-update fee at all — reading is
just a view call.

Available Hedera-testnet feeds (2026-09-08): HBAR, ETH, BTC, LINK, USDC,
USDT, DAI, all vs USD, 8 decimals. No commodity/equity feed exists here
either (mirrors the Pyth finding), so the same honest-substitution pattern
applies: **GOLD-x → HBAR/USD**, **STOCK-x → ETH/USD** (same volatile-leg
choice as the original Pyth design, so the "which leg is riskier" framing
stays consistent), **USDC → USDC/USD** (real).

Built `StratusChainlinkPriceOracle.sol` — same `IPriceOracleGetter`
surface and the same demo-stress mechanism as `StratusPriceOracle`, so
swapping the pool's live oracle was a single
`LendingPoolAddressesProvider.setPriceOracle` call
(`contracts/lib/bonzo/script/update-price-oracle.ts`, now parameterized by
an `ORACLE_DEPLOYMENT_KEY` env var instead of hardcoded). Deployed at
`0x784B85521B77F43655960718539E85fBa012e659`; feeds wired; prices read
back successfully on the first try, no update step needed.

**`StratusPriceOracle` (Pyth) stays in the codebase** — `updatePriceFeeds`
works and is unit-tested, and it remains the originally-designed,
documented oracle. `StratusChainlinkPriceOracle` is what the pool actually
uses. If Pyth's Hedera testnet infrastructure gap closes, switching back
is the same single `setPriceOracle` call in the other direction.

**Immediately unblocked:** Gate 2's borrow/repay leg — run for real for
the first time, full pass:

- `getUserAccountData` — previously blocked entirely — now returns real
  numbers ($7.98 total collateral from 100 GOLD-x @ ~$0.0798/HBAR).
- Borrowed 2.793516 USDC (50% of available capacity), health factor
  computed correctly as `2.14`.
- Repaid in full — USDC balance and total debt returned to exactly the
  pre-borrow state, health factor back to `MAX` (no debt).

**Gate 2 is now fully passed** — deposit, borrow, repay, and withdraw all
confirmed on testnet. Gate 3's borrow leg is the same underlying pool
operation (the vault never touches borrowing), so it's unblocked
identically. Tx hashes for all of the above in
`deployments/hederaTestnet.json` under `meta.gate2BorrowRepay` and
`meta.oraclePivot`.

## Budget note

Testnet HBAR balance dropped from 65.6 → ~5.0 over Phase 2 (the full
proxy deploy, several `batchInitReserve`-adjacent transactions, an oracle
redeploy, and a few failed `updatePriceFeeds` attempts while debugging
the above). **Needs a top-up before Phase 3** (vault deploy) or before
retrying the borrow/repay verification. Deployer address:
`0x4B1f9ba6A6281ED5C889c4B67d40e4bf7503Ac72` (same one funded in Phase 0).
