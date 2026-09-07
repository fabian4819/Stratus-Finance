# Deploy scripts — order & status

Run in this order. Each script reads its dependencies from
`deployments/<network>.json` (via `script/utils/deployments.ts`) and writes
its own output addresses back — see `PLAN.md` for the phases these map to.

| # | Script | Depends on | Status |
|---|---|---|---|
| — | Phase 0 spikes (manual, not scripted) | — | ⏳ do first, see `PLAN.md` §Phase 0 |
| — | `tokenization/scripts/issue-assets.ts` | ATS SDK config | ⏳ issues GOLD-x / STOCK-x, writes their addresses |
| 00 | `00-deploy-oracle.ts` | Pyth contract address (env) | ✅ runnable now — no pool dependency |
| 01 | `01-deploy-basket-token.ts` | GOLD-x / STOCK-x addresses | ✅ runnable once tokenization step has run |
| 02 | *(Phase 2)* deploy Bonzo/Aave v2 pool | `contracts/lib/bonzo` submodule | ⏳ blocked on `contracts/lib/bonzo/SETUP.md` |
| 03 | `03-configure-reserves.ts` | pool deployed, oracle deployed | ⏳ blocked on 02 |
| 04 | `04-deploy-vault.ts` | pool + basket token deployed | ⏳ blocked on 02 |
| — | `demo-liquidation.ts` | everything above | ⏳ blocked on 02 |

Scripts marked ⏳ blocked are written against the interfaces the pool will
expose (`ILendingPool`, `IProtocolDataProvider`) so they're ready to run as
soon as Phase 2 lands — they are not placeholders to be rewritten later,
just currently unable to execute end-to-end.

## Environment

Each script reads `HEDERA_TESTNET_RPC_URL`, `HEDERA_TESTNET_OPERATOR_PRIVATE_KEY`,
`PYTH_CONTRACT_ADDRESS`, and the `PYTH_FEED_ID_*` vars from `contracts/.env`
(copy `.env.example`). Run against `--network hederaTestnet` for testnet, or
omit `--network` to use the local Hardhat network for dry runs (note: the
local network has no Pyth or Bonzo pool deployed either — local dry runs
only exercise `StratusBasketToken` in isolation; see `test/` for that).
