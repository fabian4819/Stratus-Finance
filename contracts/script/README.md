# Deploy scripts — order & status

Run in this order. Each script reads its dependencies from
`deployments/<network>.json` (via `script/utils/deployments.ts`) and writes
its own output addresses back — see `PLAN.md` for the phases these map to.
All have been run for real against `hederaTestnet` — this isn't a
speculative order, it's what actually happened, in order.

| # | Script | Config | Status |
|---|---|---|---|
| — | Phase 0 spikes (see `docs/phase-0-findings.md`) | mixed | ✅ done |
| — | `tokenization/scripts/issue-assets.ts` | — | ✅ done — real GOLD-x/STOCK-x issued |
| 00 | `00-deploy-oracle.ts` | main | ✅ done — `StratusPriceOracle` deployed, feeds wired |
| 01 | `01-deploy-basket-token.ts` | main | ✅ done |
| 02 | `02-deploy-mock-usdc.ts` | main | ✅ done |
| — | `tokenization/scripts/whitelist-protocol-addresses.ts` | — | ✅ done (re-run whenever a new protocol address needs whitelisting — safe, no-ops on already-listed addresses) |
| — | `verify-basket-roundtrip.ts` | main | ✅ done — Phase 1 Gate 1 passed |
| — | `lib/bonzo/script/deploy-lending-core.ts` | **bonzo** | ✅ done — full Aave v2 core, real proxy flow, reserves initialized |
| — | `seed-usdc-liquidity.ts` | main | ✅ done — 100,000 USDC deposited |
| — | `verify-gate2-deposit-withdraw.ts` | main | ✅ done — Phase 2 Gate 2 deposit/withdraw leg passed. Borrow/repay leg blocked on Pyth Hermes API access, see `docs/phase-2-findings.md` |
| 04 | `04-deploy-vault.ts` | main | ⏳ next — Phase 3 |
| — | `demo-liquidation.ts` | main | ⏳ Phase 4, also needs Hermes access (price stress requires a live price to stress) |

**Two Hardhat configs, on purpose:** scripts under `contracts/script/`
(this directory) run against the **main** config (`../hardhat.config.ts`,
sources = `./src`) — they only need addresses/small interfaces for the
Bonzo pool, not its full ABI. `lib/bonzo/script/*.ts` scripts that call
the vendored Bonzo contracts directly (deploying them, calling
`batchInitReserve`, etc.) run against the **bonzo** config
(`../hardhat.bonzo.config.ts`, sources = `./lib/bonzo/contracts`) — kept
separate so the two large, differently-versioned (0.6.12 vs 0.8.19)
contract trees never collide on artifact names. Pass `--config` explicitly:

```bash
npx hardhat run script/00-deploy-oracle.ts --network hederaTestnet
npx hardhat run lib/bonzo/script/deploy-lending-core.ts --config hardhat.bonzo.config.ts --network hederaTestnet
```

## Environment

Each script reads `HEDERA_TESTNET_RPC_URL`, `HEDERA_TESTNET_OPERATOR_PRIVATE_KEY`,
`PYTH_CONTRACT_ADDRESS`, and the `PYTH_FEED_ID_*` vars from `contracts/.env`
(copy `.env.example`). Run against `--network hederaTestnet` for testnet, or
omit `--network` to use the local Hardhat network for dry runs (note: the
local network has no Pyth or Bonzo pool deployed either — local dry runs
only exercise `StratusBasketToken`/`StratusPriceOracle` in isolation with
mocks; see `test/` for that).
