# Phase 0 spike findings

Run log for PLAN.md's Phase 0 de-risking spikes. Read-only checks were run
directly against Hedera testnet via HashIO; anything requiring a
transaction is blocked on a funded operator account (see status below).

## Spike #2 — Read a live Pyth price on Hedera testnet ✅ DONE (with a real finding)

**Pyth contract on Hedera testnet:** `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729`
(confirmed live — 708-byte proxy, `getValidTimePeriod()` returns `60`).
Same address on Hedera mainnet.

**XAU/USD** (`0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2`):
feed exists and returns a price via `getPriceUnsafe` — **but it is ~6
months stale** (last publish 2026-03-11). `getPriceNoOlderThan(id, 60)`
reverts, as it should given that staleness.

**SPY/USD** (`0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5`):
reverts with `PriceFeedNotFound()` (selector `0x14aebe68`) — this feed has
**never** been pushed to Hedera testnet at all, not merely stale. Confirms
PLAN.md §6.1's contingency is necessary, not optional: **no equity/stock
index feed is usable on Hedera testnet.**

**BTC/USD** and **ETH/USD** do exist and are fresher (~14 days stale at
check time) than XAU, but still fail a 60s staleness check. Chosen as the
"volatile leg" substitute per §6.1 — `contracts/.env` now points
`PYTH_FEED_ID_STOCK_INDEX` at ETH/USD (`0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`).
Recorded here as a substitution, per §6.1's honesty requirement — the
frontend/README should say "ETH-tracking" or similar wherever it currently
implies a real stock index.

### Architectural implication (new, not in the original PLAN.md)

**Hedera testnet's Pyth contract is a pull oracle nobody keeps warm.**
Every feed checked was stale by hours-to-months, meaning `StratusPriceOracle`
cannot assume a fresh price is already cached — something has to actively
call `pyth.updatePriceFeeds{value: fee}(priceUpdateData)` with a current
Hermes VAA before any read that must pass a staleness check (borrow,
liquidate). Two ways to handle this, and Option A is the standard pattern
for pull-oracle Aave-style integrations:

- **Option A (recommended):** `StratusPriceOracle` (or the vault/pool entry
  points) accept `bytes[] calldata priceUpdateData` and forward it to
  `pyth.updatePriceFeeds` in the same transaction as the action that reads
  price, paying `pyth.getUpdateFee(data)` in HBAR. The frontend fetches the
  update data from Hermes (`https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedId>`)
  right before submitting.
- **Option B:** a keeper/cron script periodically calls `updatePriceFeeds`
  independent of user actions. Simpler for a demo, but adds an off-chain
  moving part that can silently go stale between demo runs.

**Action item added to PLAN.md Phase 2:** `StratusPriceOracle` needs an
update path (Option A), not just a getter. Not yet implemented in
`StratusPriceOracle.sol` — tracked here until it is.

## Spike #1 — Deploy a trivial contract to Hedera testnet ⏳ BLOCKED on funding

Confirmed the full signing/RPC pipeline works end-to-end: Hardhat config
resolves the HashIO RPC, ethers derives the correct EVM address from the
configured key, and `provider.getBalance` reads `0`. Deployment of
`MockUSDC` fails with `Sender account not found` — expected, since a fresh
EVM key has no Hedera account until it receives its first HBAR transfer
(auto-account-creation).

**Throwaway deployer address generated for this repo:**
`0x4B1f9ba6A6281ED5C889c4B67d40e4bf7503Ac72`
(private key stored in `contracts/.env`, gitignored, testnet-only — worth
nothing outside this network).

**Needs:** testnet HBAR sent to that address (Hedera Portal faucet,
https://portal.hedera.com, or any funded testnet account) before this spike
— and #1's Aave v2 pool deploy, and #4's ATS mint — can actually run.

## Spike #2 (original numbering, Aave v2 pool deploy) — ⏳ BLOCKED

Blocked on both funding (above) and the `contracts/lib/bonzo` submodule,
which could not be cloned in this sandbox (see `contracts/lib/bonzo/SETUP.md`
— clone attempts produced a corrupted `.git` with a broken `HEAD` under
network throttling). Needs a working-network environment to `git submodule
add` it, then a funded account to deploy.

## Spike #4 — Mint one ATS token and transfer it between two EOAs ⏳ BLOCKED on funding

Not yet attempted — `Equity.create` costs HBAR (see `tokenization/scripts/issue-assets.ts`).
Confirmed testnet ATS coordinates are in `tokenization/.env.example`
(Resolver `0.0.6797832`, Factory `0.0.6797955`) from Phase 0 research
already folded into PLAN.md §6.2, but not yet exercised against a live
account.

## Summary

| Spike | Status |
|---|---|
| #2 Pyth read | ✅ Done — feed availability confirmed, staleness/pull-oracle issue found and documented, XAU stays, equity leg substituted with ETH/USD |
| #1 Trivial deploy | ⏳ Infra confirmed working; blocked on funding |
| #2 (orig) Aave v2 pool deploy | ⏳ Blocked on funding + Bonzo submodule clone |
| #4 ATS mint/transfer | ⏳ Blocked on funding |

**Next step:** fund `0x4B1f9ba6A6281ED5C889c4B67d40e4bf7503Ac72` with testnet
HBAR, then re-run the blocked spikes.
