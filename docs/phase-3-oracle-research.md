# Real RWA price feeds: research, dead ends, and the RedStone integration

**Status: live.** GOLD-x reads a real gold spot price (`XAU`) and STOCK-x
reads a real S&P 500 index level (`USA500.Y`), both from RedStone's
`redstone-primary-prod` data service. This replaces the disclosed
HBAR/USD and ETH/USD substitutes described in `docs/phase-2-findings.md`
— that gap is now closed, not just documented.

## The question that started this

A fair one, asked directly: why does GOLD-x's price panel say "HBAR/USD"?
Because at the time, no oracle checked (Pyth, Chainlink) had a real gold
or equity feed live on Hedera testnet. This doc is the record of checking
every oracle actually integrated with Hedera, then finding one whose
architecture doesn't require a Hedera-specific deployment at all.

## What was checked, and why each one failed except the last

### Pyth — real feeds exist, but the Hedera testnet receiver is blocked

Pyth's catalog genuinely has `Metal.XAU/USD` and equity/ETF feeds
(`SPY`, `SPYG`, etc.) — confirmed via Hermes API query. Already
integrated in this repo (`StratusPriceOracle.sol`, unit-tested), but
`updatePriceFeeds` reverts with `InvalidWormholeVaa()` on Hedera testnet's
deployed receiver — investigated at length in `docs/phase-2-findings.md`,
root cause outside this repo's control. Asset selection was never the
problem; the update mechanism is.

### Chainlink (previously live) — only 7 crypto pairs on Hedera testnet

Confirmed via `hedera-dev/tutorial-js-chainlink-price-feeds`: BTC/USD,
DAI/USD, ETH/USD, HBAR/USD, LINK/USD, USDC/USD, USDT/USD. No commodities,
no equities, no indices. This is why GOLD-x/STOCK-x were mapped to
HBAR/ETH in the first place — not a choice, the only options available.

### Supra — live and working on Hedera testnet, but crypto/HTS-only there

Supra's DORA push oracle genuinely works on Hedera testnet (confirmed via
a direct `getSvalue()` call against the live Storage contract
`0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917` — BTC/ETH/HBAR all returned
fresh, accurate prices). Supra's general catalog *does* list `XAU_USD`
(index 5500) and `SPY_USD` (index 6040), but querying those specific
indices against Hedera's Storage contract returned all-zero data — those
feeds simply aren't published to Hedera. Cross-checked against Bonzo
Finance's own Supra integration docs (the protocol this repo forks): all
8 of their configured pairs are HTS-native tokens (HBARX, SAUCE, XSAUCE,
DOVU, PACK, KARATE, STEAM, HST) — no RWA. Same gap as Chainlink, just a
different provider.

### RedStone — real feeds, and it doesn't need a Hedera deployment at all

The key architectural difference: Chainlink and Supra are **push**
oracles — a provider-run network continuously writes prices into a
contract *they* deployed to each chain, so a chain is only "supported" if
that provider chose to deploy there. RedStone's pull model is different —
price data is signed off-chain by RedStone's own keys, and the signature
is verified entirely inside **our own contract** (no RedStone-deployed
contract needed on the destination chain at all). That means the
Chainlink/Supra "not deployed to Hedera" problem structurally can't apply
to it — RedStone doesn't need to have deployed anything here.

Proven with a real deployment before committing to the full integration:
a throwaway probe contract on Hedera testnet, calling `getGoldPrice()`
wrapped with a live signed `XAU` price package, returned **$4,384.73** —
a real, correct, on-chain-verified gold price, first try after fixing
three real bugs in RedStone's own package (see below).

## Confirmed live feed ids (from `redstone-primary-prod`)

Queried the gateway's raw response directly rather than trusting
docs/blog examples, since two of those turned out to be wrong (below):

| Asset | Feed id | Value at integration time |
|---|---|---|
| Gold | `XAU` | $4,387.70 |
| S&P 500 index | `USA500.Y` | $7,682.74 |
| USDC | `USDC` | $0.9998 |

(Individual stocks are also live — `AAPL`, `TSLA`, `MSFT`, `NVDA`,
`GOOGL`, `META`, `AMZN` all confirmed present — kept as a note in case a
single-equity STOCK-x variant is ever wanted instead of the index.)

## Three real bugs hit getting the PoC working

1. **`@redstone-finance/evm-connector@1.0.0` (latest on npm) is broken** —
   `package.json` ships unresolved `workspace:*` internal-monorepo
   references (`@redstone-finance/protocol`, `-sdk`, `-signing`,
   `-utils`), so plain `npm install` fails immediately with
   `EUNSUPPORTEDPROTOCOL`. `0.9.0` has none of these and installs clean —
   used that instead.
2. **Docs/blog examples show the wrong field name.** `WrapperBuilder.wrap(contract).usingDataService({ dataFeeds: [...] })`
   is what's documented; the real, working field in `0.9.0` is
   `dataPackagesIds`. Passing `dataFeeds` silently produces
   `reqParams.dataPackagesIds === undefined`, surfaced as an opaque
   `Cannot read properties of undefined (reading 'length')` deep inside
   `@redstone-finance/sdk`.
3. **`authorizedSigners` must be passed explicitly.** Unlike
   `dataServiceId`/`uniqueSignersCount`, which `DataServiceWrapper`
   auto-fetches from the contract if omitted, the SDK's own
   `requestDataPackages` independently requires an `authorizedSigners`
   array to validate gateway responses client-side — omitting it produces
   the same unhelpful `undefined.length` error. Used the 5 addresses
   hardcoded in `PrimaryProdDataServiceConsumerBase.sol` itself.

## Architecture: why this needs a cache, not a plain view call

RedStone's `getOracleNumericValueFromTxMsg` only works inside the exact
external call whose calldata was wrapped client-side — that wrapped
calldata does **not** propagate through an internal Solidity call. Since
`StratusRiskView`/`LendingPool` call `oracle.getAssetPrice(asset)`
internally (not as their own top-level wrapped transaction), a plain
`getAssetPrice` implemented directly against
`getOracleNumericValueFromTxMsg` would never see the payload and would
always revert.

`StratusRedstoneOracle.sol` resolves this with a cache, same shape as
Pyth's push-once-then-read pattern:

- `updatePrice(asset)` — the only function that reads
  `getOracleNumericValueFromTxMsg`. Must be called directly via a
  RedStone-wrapped transaction (not through another contract). Stores
  `{price18, timestamp}`. Permissionless — the data is cryptographically
  signed, so there's nothing to gain from calling it with bad input.
- `getAssetPrice(asset)` — the `IPriceOracleGetter`-facing function
  everything else calls. Plain view read of the cache, checks staleness
  against `maxPriceAge`. Identical shape to `StratusChainlinkPriceOracle`,
  so `StratusRiskView`, `LendingPool`, and the frontend need **no
  RedStone-specific changes** — they just call `getAssetPrice` like
  always.

Operational consequence: unlike Chainlink/Supra's continuous push,
**prices only refresh when `script/update-redstone-prices.ts` runs.**
This is a real, ongoing requirement — not a one-time setup step. Run it
before recording the demo, and periodically during any live session
longer than `maxPriceAge` (1 hour).

## What actually shipped, with real transaction hashes

- `StratusRedstoneOracle` deployed at `0xeB188cF2F86E2236001Ca1BEB8E8b3f2184D662D`.
- Feed ids wired: GOLD-x → `XAU`, STOCK-x → `USA500.Y`, USDC → `USDC`.
- `script/update-redstone-prices.ts` run for real — 3 wrapped transactions,
  tx hashes in `deployments/hederaTestnet.json` under `meta.redstoneOracleIntegration`.
- `LendingPoolAddressesProvider.setPriceOracle` re-pointed to it (checked
  zero outstanding debt first, same precaution as the Chainlink pivot).
- `StratusRiskView` redeployed against it (its `oracle` reference is
  immutable, same reason it needed redeploying after the Chainlink
  pivot) — new address `0xBFe160409B8f0Ebb9DC7Bb67f5E3373e1457eE5d`.
- `getUserRisk()` re-verified 3/3 successful calls with real numbers.
- Frontend: `RiskPanel.tsx` labels updated from "(HBAR/USD)"/"(ETH/USD)"
  to "(XAU/USD — real gold)"/"(S&P 500 index — real)"; confirmed live in
  browser with no wallet connected (public price data).

`StratusChainlinkPriceOracle` and `StratusPriceOracle` (Pyth) both stay
in the codebase, same as before — real, working (Chainlink) or real,
documented-but-blocked (Pyth) implementations of the same interface,
switchable via a single `setPriceOracle` call.

## Follow-up: `maxPriceAge` raised 1h → 6h

The cache refresh (`script/update-redstone-prices.ts`) has to run often
enough that the pool's cached price never exceeds the oracle's immutable
`maxPriceAge`, or every deposit/borrow/liquidation reverts `StalePrice()`.
At 1 hour that meant an hourly cron, and the repeated ~33-transaction
refreshes drained the deployer wallet's HBAR. Raising `maxPriceAge` to 6
hours cuts the required refresh cadence by 6× for a bounded cost: the
pool's enforced math may use a price up to 6 hours old (acceptable for a
testnet demo — gold and the S&P 500 don't move enough intraday to push a
healthy position under water, and the demo stress path uses
`setDemoOffsetBps`, not real drift). Display prices are unaffected —
`StratusLivePriceReader` is always real-time, separate code path.

`maxPriceAge` is set once in the constructor and never mutated, so this
was a fresh deploy (`script/13-deploy-oracle-6h.ts`,
`0x7aa45f5Ff7e99f13C60F6f3913aaff68E51DfdD9`) + re-wiring all 33 feed
ids + `setPriceOracle` on the pool's `AddressesProvider` + redeploying
`StratusRiskView` (`0x499a48fA…0755D2`) and `StratusMarketplace`
(`0x74474628…47dF4`), both of which hold an immutable oracle reference.
Verified after: `getUserRisk()` and a marketplace `quote()` both succeed
on-chain against the new contracts.

## Follow-up: genuinely real-time price display (`StratusLivePriceReader`)

The cache above is unavoidable for anything the pool enforces
(deposit/borrow/liquidation, via `LendingPool`/`StratusRiskView`) —
RedStone's signed calldata doesn't propagate through the internal
Solidity calls those contracts make. But nothing stops the *frontend*
from reading a price with no cache in between, for display purposes: a
wrapped `eth_call` works the same way for a `view` function as it does
for a state-changing transaction — it's still just calldata carrying a
signed payload, and `getOracleNumericValueFromTxMsg` doesn't care which
kind of call it's in.

`StratusLivePriceReader.sol` — a standalone contract, never called by the
pool, RiskView, or any deposit/borrow/liquidation path — exposes
`getLivePrices(bytes32[] feedIds)`, batching all 13 feed ids into one
wrapped call. Deployed at `0x4bD75A26965a94f3b0E3845d31Ed5cc2dc50A5eE`;
verified for real (all 13 live prices returned correctly in one
gateway round-trip, zero gas since it's a plain read).

Frontend side: `@redstone-finance/evm-connector`/`ethers-v5` (aliased,
same pattern as `contracts/script/update-redstone-prices.ts`) added to
the frontend package directly — confirmed RedStone's gateway sends
`access-control-allow-origin: *`, so the browser can call it straight
from the page, no proxy needed. `RiskPanel.tsx` and
`IndividualStocks.tsx` now show a "Live market prices" badge and read
from this reader, falling back to the cached oracle if the live call
fails. The combined health factor, per-leg cards, and anything that
determines actual borrow capacity still read the cache — labeled
explicitly in the UI as using "the protocol's cached price" — since
that's the number deposit/borrow/liquidation actually enforce.
