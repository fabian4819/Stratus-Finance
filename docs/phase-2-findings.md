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

**Status:** user is registering for a key; not yet available at the time
of this Phase 2 pass. Everything that doesn't need a *fresh* oracle read
was completed and verified for real:

- ✅ Full lending core deployed and reserves initialized (above).
- ✅ Deposit GOLD-x directly into the pool → aGOLD-x minted 1:1 (confirmed: `ValidationLogic.validateDeposit` never touches the oracle at all).
- ✅ Withdraw it back out → balances exact (confirmed: `validateWithdraw` only needs the oracle when the withdrawer has active debt against the withdrawn collateral; with zero debt it's skipped).
- ⏳ **Blocked:** `pool.getUserAccountData` (reads the oracle unconditionally, even at zero debt, to report total collateral value) and `pool.borrow` (needs a live price to compute available borrow capacity and health factor) both revert on Pyth's stale cached prices — `getPriceNoOlderThan(id, 60)` correctly rejects data that's hours-to-months old, and there is currently no way to push a fresh update without a Hermes API key.

**Next step once the key arrives:** fetch update data via
`https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedId>` with
the `Authorization: Bearer` header, call
`StratusPriceOracle.updatePriceFeeds(updateData, {value: fee})` for
GOLD-x/STOCK-x/USDC, then complete Gate 2's remaining borrow → repay leg
(`contracts/script/verify-gate2-deposit-withdraw.ts` already covers
deposit/withdraw — extend it or add a companion script for borrow/repay).

## Budget note

Testnet HBAR balance dropped from 65.6 → 6.55 over Phase 2 (the full
proxy deploy + 3x `batchInitReserve`-adjacent transactions was the bulk of
it — `batchInitReserve` alone was 6.5M gas). **Low enough that it should
be topped up before Phase 3** (vault deploy) or the borrow/repay
verification once Hermes access is available. Deployer address:
`0x4B1f9ba6A6281ED5C889c4B67d40e4bf7503Ac72` (same one funded in Phase 0).
