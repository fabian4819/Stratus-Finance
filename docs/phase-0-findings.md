# Phase 0 spike findings

All four spikes from `PLAN.md` §Phase 0 are complete. **Gate 0: passed —
no fallback needed for any of them.** This is the full run log.

Deployer used throughout: `0x4B1f9ba6A6281ED5C889c4B67d40e4bf7503Ac72`
(funded with 100 testnet HBAR; 65.6 HBAR remaining after all spikes below).

---

## Spike: read a live Pyth price on Hedera testnet ✅ DONE

**Pyth contract:** `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` (confirmed
live — 708-byte proxy, `getValidTimePeriod()` returns `60`). Same address
on Hedera mainnet.

**XAU/USD** (`0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2`):
feed exists, but was ~6 months stale at check time. `getPriceNoOlderThan(id, 60)`
correctly reverts on that staleness.

**SPY/USD** (`0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5`):
reverts with `PriceFeedNotFound()` (selector `0x14aebe68`) — **never**
pushed to Hedera testnet at all. Confirms PLAN.md §6.1's equity-feed
contingency is required, not optional.

**BTC/USD and ETH/USD** exist and were fresher (~14 days stale) than XAU.
Chosen as the "volatile leg" substitute — `contracts/.env`'s
`PYTH_FEED_ID_STOCK_INDEX` points at ETH/USD
(`0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`).
State this substitution plainly wherever the UI/README implies a real
stock index.

**Architectural implication (new, not in the original plan):** Hedera
testnet's Pyth contract is a pull oracle nobody keeps warm — every feed
checked was stale by hours to months. `StratusPriceOracle` needs an
`updatePriceFeeds` pass-through (accept `bytes[] calldata priceUpdateData`,
forward to `pyth.updatePriceFeeds{value: fee}(...)`, fee via
`pyth.getUpdateFee`), fetched from Hermes
(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedId>`)
right before any borrow/liquidate call. **Not yet implemented in
`StratusPriceOracle.sol`** — tracked as a Phase 2 action item.

---

## Spike: deploy a trivial contract to Hedera testnet ✅ DONE

Deployed `MockUSDC`, minted to self, read the balance back — full
deploy → write → read cycle on real Hedera testnet.

- Deploy tx: `0x4e2e5827f18f0a71c51e114603cc7658b6048ed4ae5b9e52d35d8407149c56f1`
- Gas used: 616,816
- Deployed address: `0x7Cc34b81aD503A434705ca6F00BE52ABdb9d6C5F`

No surprises — confirms the Hardhat + HashIO + ethers pipeline (config,
signing, gas estimation) all behave as expected on Hedera's EVM.

---

## Spike: deploy an unmodified Aave v2 `LendingPool` to Hedera testnet ✅ DONE

**This was the highest-risk spike in the plan** ("large contract, Hedera
has its own gas ceiling") — result: **no issue found.**

Vendored the real Bonzo/Aave v2 source (see `contracts/lib/bonzo/SETUP.md`
for exactly how and what was trimmed) and deployed the library-linked core
for real:

| Contract | Address | Gas used |
|---|---|---|
| GenericLogic (library) | `0xB77316744363775bBb358Cb50B88A3014aB2d51D` | 852,148 |
| ReserveLogic (library) | `0x32e8136dc809D74aD770dbEa4DBDa43945aD79BC` | 176,655 |
| ValidationLogic (library, linked to GenericLogic) | `0x927D46C76511c8d9d504e5BF67E71b713efD1468` | 1,968,872 |
| LendingPool (linked to ReserveLogic + ValidationLogic) | `0xe2ABFfe63fF5018bEEC5031Ea547C5a55856ae92` | 4,600,154 |
| LendingPoolAddressesProvider | `0xcEf8a535aBc5036a417c4Ae3c0319230dF6Ee69A` | 1,733,492 |
| `LendingPool.initialize(provider)` (execution, not just deploy) | — | 135,339 |

Bytecode sizes (all well under the EIP-170 24,576-byte limit, so this was
never actually a size problem — the real question was gas, and that
cleared too):

LendingPool 20,935B · LendingPoolConfigurator 17,572B ·
LendingPoolCollateralManager 10,735B · AToken 10,969B ·
LendingPoolAddressesProvider 7,514B · StableDebtToken 7,456B ·
ValidationLogic 8,871B · VariableDebtToken 6,087B · GenericLogic 3,701B ·
DefaultReserveInterestRateStrategy 3,405B · ReserveLogic 571B.

**134 of the 144 vendored Solidity files compile cleanly** against solc
0.6.12 with `evmVersion: istanbul` (matching Bonzo's own config); the 10
excluded files are unrelated SaucerSwap/Chainlink peripherals, not part of
the core pool (see `contracts/lib/bonzo/SETUP.md`).

**Conclusion: PLAN.md risk #1 is closed.** No library-splitting workaround
beyond what Aave v2 already does (ReserveLogic/GenericLogic/ValidationLogic
as external libraries) was needed — that standard pattern just works.
Phase 2 can proceed with the real upgradeable-proxy deploy flow with
confidence.

---

## Spike: mint one ATS token and transfer it between two EOAs ✅ DONE

**This was flagged as the single biggest integration risk in the plan.**
Result: it works, but getting there surfaced three real, non-obvious
findings — recorded here and in `docs/ats-friction.md` for the upstream
bonus contribution.

### Finding 1: the SDK doesn't support headless/backend signing

`@hashgraph/asset-tokenization-sdk`'s `Network.connect` only accepts
`SupportedWallets.{METAMASK, HWALLETCONNECT, DFNS, FIREBLOCKS, AWSKMS}` —
a browser extension, an interactive WalletConnect pairing, or an
enterprise custodial KMS account. There is no "raw private key, no
browser" mode, despite the README reading as if `Network.connect` were
generically usable from a script.

**Pivoted to calling the ATS diamond contracts directly** via
`@hashgraph/asset-tokenization-contracts` (installed as a transitive dep
of the SDK) — its shipped `deployEquityFromFactory` helper and typechain
types, driven by a plain `ethers.Wallet` from a raw private key. This is
also more representative of how `StratusVault` will actually interact
with these tokens in production (contract ABI level, not through the
SDK), so the pivot cost nothing.

### Finding 2: the SDK README's testnet Factory/Resolver addresses are stale

The README's `Resolver: 0.0.6797832` / `Factory: 0.0.6797955` both revert
on *every* call (even simple view functions) — bytecode present, but
functionally dead. Confirmed via
`hashgraph/asset-tokenization-studio`'s own `packages/ats/contracts/deployments/hedera-testnet/`
directory that the BusinessLogicResolver has been redeployed multiple
times since (most recently 2026-06-12, well after whatever date the SDK
README was last written). **Live addresses as of this spike:**

- Resolver (BLR) proxy: `0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a`
- Factory proxy: `0xd1F118A40f3b02883D35909eF2517e7EDd78379d`

`tokenization/.env.example` and `spike-ats-mint-transfer.ts` now use
these. **Before Phase 1, re-check
`packages/ats/contracts/deployments/hedera-testnet/` for anything newer**
— this can drift again.

### Finding 3: two on-chain validation quirks (now handled)

- ISIN must pass a real ISO 6166 length+checksum check
  (`WrongISIN`/`WrongISINChecksum`) — a made-up value like
  `"STRATUSSPIKE01"` reverts. Used Apple's real ISIN (`US0378331005`) for
  the spike, matching the package's own documented example; Phase 1 should
  either use a real ISIN per asset or generate a valid checksum for a
  made-up one (algorithm is in
  `node_modules/@hashgraph/asset-tokenization-contracts/contracts/factory/isinValidator.sol`).
- `RegulationType.NONE` + `RegulationSubType.NONE` is an explicitly
  forbidden combination (`RegulationTypeAndSubTypeForbidden`) — must pick
  a real regulation (used `REG_S`/`NONE`, matching the package's own
  documented example).
- In `isWhiteList: true` mode, **even the admin/issuer must be added to
  the token's own control list before it can hold minted tokens** —
  minting to a non-whitelisted address (including the deployer itself)
  reverts with `AccountIsBlocked(address)`. Not mentioned in the README;
  found by decoding the revert selector against the contracts' own error
  declarations.

### Result

Full sequence executed for real on Hedera testnet:

1. Deployed a real ATS Equity diamond ("Stratus Spike Gold", SPIKE-GOLD) via the Factory.
2. Whitelisted the admin itself, then minted 1000 tokens to it.
3. Attempted a transfer to a fresh, never-whitelisted EOA — **reverted**, confirming the control-list gate actually blocks unlisted accounts.
4. Added that EOA to the control list (`isInControlList` → `true`).
5. Retried the transfer — **succeeded**, balances updated correctly (990 / 10 split).

Diamond address: `0x3cE557D17667aC0543D72303E7f3Af932c29ea56`. Key tx
hashes: mint `0xd5890cd02f5a867cb9cf520be5e74ef9bd0b1ceba5fc22eba73477a8c7a5cf16`,
blocked-transfer attempt (reverted, no hash), `addToControlList`
`0x3609a5520ea3e060c36b8e79d8ab83f43ab41e2f498475406bd9401c0b7bde5d`,
successful transfer `0xa63f10da9b16aeadc523efdb9aab2fae46513419d23163f7d0ac9707f3182836`.

**Conclusion: PLAN.md risk #2 is closed for the interface-compatibility
question** (confirmed real ERC20 surface, confirmed control-list gating
behaves exactly as designed) **and now precisely scoped for Phase 1**:
every protocol address that needs to hold or move these tokens (aToken
contracts, `StratusVault`, any liquidator) must be
`addToControlList`-ed — `tokenization/scripts/whitelist-protocol-addresses.ts`
already anticipates this, though it still goes through the (non-working,
per Finding 1) SDK path and should be ported to the direct-contract-call
pattern proven here.

---

## Summary

| Spike | Status | Fallback needed? |
|---|---|---|
| Pyth price read | ✅ Done | Yes — equity feed substituted with ETH/USD (per §6.1, as planned) |
| Trivial contract deploy | ✅ Done | No |
| Aave v2 `LendingPool` deploy | ✅ Done | No — highest-risk spike, fully cleared |
| ATS mint + transfer + control list | ✅ Done | No — pivoted SDK→direct-contract-calls, no fallback to a wrapper needed |

**Gate 0: PASSED.** All four spikes are green. Proceed to Phase 1/2.

## Carried-forward action items for later phases

1. `StratusPriceOracle` needs an `updatePriceFeeds` pass-through (pull-oracle finding above) — Phase 2. **Still open.**
2. ~~Port `tokenization/scripts/whitelist-protocol-addresses.ts` (and `issue-assets.ts`) from the SDK-based approach to the direct-contract-call pattern proven in `spike-ats-mint-transfer.ts`~~ **Done in Phase 1** — see `tokenization/scripts/lib/ats-client.ts`.
3. ~~Re-verify Resolver/Factory addresses against `packages/ats/contracts/deployments/hedera-testnet/` before Phase 1 issuance~~ **Done** — same addresses still live as of Phase 1 issuance.
4. ~~Real per-asset ISINs (or validly-checksummed made-up ones) needed for GOLD-x/STOCK-x~~ **Done** — `tokenization/scripts/lib/isin.ts` generates checksum-valid synthetic ISINs (`USSTRATUSGX4`, `USSTRATUSSX9`), verified against a known-real ISIN's checksum first.
5. Every protocol contract address (aTokens, vault, liquidator) must be added to each ATS token's control list before Phase 2/3/4 can move real tokens through the pool. **Mechanism ready** (`whitelist-protocol-addresses.ts`), **StratusBasketToken done**, aToken/Vault/liquidator entries pending those contracts' Phase 2/3 deploys.

## Phase 1 result

**Gate 1 passed for real on Hedera testnet** — see `PLAN.md` §Phase 1 and
`deployments/hederaTestnet.json` (`meta.gate1RoundTrip`) for the exact
mint/redeem tx hashes. Full asset list now live:

| Contract | Address |
|---|---|
| GoldToken (ATS Equity) | `0xcF19378058EC9DFD25975527BDf7F68faeC2C7fc` |
| StockIndexToken (ATS Equity) | `0x59E3908069993cDDbD3C83479c1aFc92242c0d3A` |
| StratusBasketToken | `0x2255Eb7Bc29A27E2b9113D6BA28807812Bd4DEaD` |
| MockUSDC | `0xDc2088fd97eda106943cABf443cA5c6702c37154` |
