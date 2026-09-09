# Buy with USDC, borrow any of 21 assets

**Status: live.** Two connected features, both real, both verified
end-to-end with actual transactions: a self-serve marketplace to buy
tokenized assets with USDC, and a choice of 21 assets (USDC + 20
top-market-cap crypto) to borrow against whatever collateral a user
holds.

## Why this exists

The protocol could already accept GOLD-x/STOCK-x/individual stocks as
collateral and lend USDC against it — but there was no way for a new
wallet to *acquire* those tokens in the first place (they were all
pre-minted entirely to the admin/deployer, no public sale), and there
was only ever one thing to borrow (USDC). The requested flow: buy
tokenized assets with your own balance, then choose which crypto to
borrow against them.

## Part 1: StratusMarketplace — buy tokenized assets with USDC

ATS enforces control-list whitelisting on every transfer. A brand-new
wallet has never been whitelisted on any GOLD-x/STOCK-x/individual-stock
token, so a plain `transfer()` to them would revert with
`AccountIsBlocked` — the same friction already filed as
[hashgraph/asset-tokenization-studio#1399](https://github.com/hashgraph/asset-tokenization-studio/issues/1399).
Solving this for a genuinely self-serve buy flow (no admin step per
buyer) meant granting `StratusMarketplace` itself `ROLE_CONTROL_LIST` on
each of the 12 sellable tokens, so `buy()` can whitelist a first-time
buyer atomically in the same transaction — confirmed the admin wallet
actually holds the implicit admin role needed to grant this before
relying on it (a real `grantRole` transaction against GOLD-x, verified
`hasRole` flipped `false → true`).

Architecture:
- `quote(token, amount)` — reads the live oracle price, returns the USDC cost.
- `buy(token, amount)` — pulls USDC, whitelists the caller if needed
  (`isInControlList` checked first — ATS's `addToControlList` reverts
  rather than no-ops on an already-whitelisted account), transfers
  `amount` of `token` from the marketplace's own pre-funded inventory.
- Inventory-based, not minting — `script/setup-marketplace.ts` transfers
  1000 units of each token from the admin's existing supply into the
  marketplace. GOLD-x needed a top-up mint first (only 65 left after all
  the Gate 1-4 testing this session had already done against it).

**Verified for real**, not just by contract review: the Phase 4 demo
liquidator wallet — confirmed via `isInControlList` to have never been
whitelisted on PLTR-x — bought 2 PLTR-x for 341.32 USDC with zero prior
admin action, and was whitelisted as part of the same transaction. Real
prices, real oracle read, real ATS control-list mutation, all in one
call.

## Part 2: 21 borrowable assets

### Scope: top 20 crypto by market cap, cross-checked against RedStone

Same discipline as the individual-stocks work: checked ~40 major crypto
tickers against RedStone's live catalog for existence (32 matched), then
sanity-checked each one's actual returned *value* against a plausible
range for that asset (learned from the CVX mistake — existence in the
catalog isn't proof of correctness). All 32 checked out as sane. Final
20, ordered by real-world market-cap rank:

BTC, ETH, USDT, XRP, BNB, SOL, DOGE, ADA, TRX, AVAX, SHIB, LINK, DOT,
BCH, TON, SUI, NEAR, LTC, ICP, UNI

### Architecture

1. **`MockCrypto.sol`** — generalizes `MockUSDC`'s pattern (plain
   mintable 18-decimal ERC20, open mint for testnet use, not RWA, not
   ATS-issued) into one constructor-parametrized contract instead of 20
   hardcoded ones.
2. **Reserve registration** (`add-crypto-reserves.ts`) — same
   `batchInitReserve`-against-the-live-configurator pattern as the
   individual stocks, collateral-enabled *and* borrow-enabled this time
   (LTV 50%/threshold 60%/bonus 10%).
3. **Liquidity seeding** (`12-seed-crypto-liquidity.ts`) — deposited
   500,000 of the 1,000,000 units minted per token as pool liquidity.
   `enableBorrowingOnReserve` alone doesn't give anyone anything to
   borrow — Aave v2 checks the pool's actual aToken-held balance.
4. **Oracle wiring** — `StratusRedstoneOracle.setFeedId` per token (no
   redeploy needed, generic mapping), and `update-redstone-prices.ts`
   generalized to loop over both the stock config and this crypto
   config, skipping anything not yet issued/wired.
5. **Frontend** (`BorrowRepay.tsx`) — separate asset selectors for
   borrow and repay (a user might want to repay an existing debt in a
   different asset than the one they're about to borrow next), each
   using its own decimals.

### A real bug found and fixed along the way: gas estimation, not a gas ceiling

`batchInitReserve` failed twice with empty revert data, even after
shrinking the chunk size from 3 to 2 (the fix that worked for the
individual-stock reserves earlier). HashIO returned no decodable reason
either time. Queried the Hedera **mirror node**'s
`contracts/results/{hash}` endpoint directly instead of trusting the
JSON-RPC relay's error — it showed `gas_used: 5,131,707` against an
auto-estimated `gas_limit: 5,213,990`: the transaction was running out
of gas right near the end of execution, not hitting a hard per-tx
ceiling. ethers' automatic `estimateGas` was under-estimating
`batchInitReserve`'s true cost once enough reserves already existed (14
registered before this run). Fixed with an explicit `gasLimit: 9_000_000`
override on the call itself — chunk size 3 then worked fine, matching
the stock reserves' known-good size.

### What actually shipped, with real transaction hashes

- 20 `MockCrypto` tokens deployed, 1,000,000 units minted to the
  deployer each.
- 20 reserves registered via `batchInitReserve` (7 chunks of 3, one of
  2), collateral + borrowing enabled on all.
- 20 `setFeedId` + liquidity-seeding deposit transactions.
- **Verified for real**: borrowed 0.1 ETH against existing collateral
  (availableBorrowsETH already non-zero from prior testing), ETH balance
  confirmed +0.1, repaid in full.
- Tx hashes in `deployments/hederaTestnet.json` under
  `meta.marketplace` and `meta.cryptoBorrowReserves`.

## Cost note

Cheaper per-token than the ATS individual stocks (`MockCrypto` deploys
are plain ERC20s, not diamonds — a few HBAR each vs. ~8 for an ATS
Equity), but the `batchInitReserve` chunks and liquidity seeding still
added up: roughly 130 HBAR across token deployment, reserve
registration, oracle wiring, and liquidity seeding for the 20 crypto
reserves, plus a smaller amount for the marketplace setup.
