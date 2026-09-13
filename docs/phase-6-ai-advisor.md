# Removing sETF, adding staking, and an x402-gated AI advisor

**Status: live.** Three changes, driven directly by a walkthrough of the
existing app with the user: the sETF basket was pure friction with no
protocol-level reason to exist, and two new capabilities were requested
— crypto staking, and an AI advisor for yield allocation, gated behind
a real x402 payment for its premium tier.

## Part 1: sETF removed

The mint-sETF-then-decompose flow was the *only* in-app path to use
Gold or the S&P 500 Index as collateral, and it dead-ended anyone who
bought only one of the two from the marketplace (e.g. just GOLD-x) —
the 10 individual stocks already skipped this ceremony entirely.

The fix turned out to be trivial because `StratusRiskView.getUserRisk`
was never basket-aware — it takes two *arbitrary* reserve addresses and
reads whatever `dataProvider.getUserReserveData`/`getReserveConfigurationData`
say. Folding GOLD-x/STOCK-x into the same `individualStocks` list the 10
stocks use needed zero contract changes: same live-price/deposit/withdraw
page, same `LendingPool.deposit`/`withdraw`, no wrapper. `MintBasket.tsx`
and the old basket-based `Deposit.tsx` were deleted outright.
`StratusBasketToken`/`StratusVault` stay deployed on testnet, untouched
and simply unused — they're immutable, there was nothing else to do
with them.

## Part 2: StratusStaking

A dedicated staking pool, independent of the lending pool — staking a
token here isn't lending-pool collateral and vice versa. Standard
MasterChef-style multi-pool accumulator (`accRewardPerShare`, updated on
every stake/unstake/claim), rewards minted on payout by `StratusStaking`,
which is the sole owner of the new `StratusRewardToken` (STRAT) after a
one-time ownership handoff at deploy. No pre-funded reward pot to
manage — the simplest correct choice for a testnet demo, disclosed the
same way `MockCrypto.sol` discloses its own open `mint`.

One pool opened per borrowable crypto reserve (20 pools, flat
0.01 STRAT/sec each — an arbitrary demo rate, not tuned to any real
emissions budget).

**A real Hedera gotcha, hit and fixed:** ethers' automatic `estimateGas`
under-reports for `StratusStaking`'s calls on Hedera — confirmed via
`staticCall` succeeding (proving the contract logic itself was correct)
while the real transaction reverted under default gas estimation. Same
HashIO quirk already documented for `batchInitReserve` elsewhere in this
repo. Fixed with an explicit `gasLimit: 500_000` override on
stake/unstake/claim in the frontend.

Verified end-to-end directly against the deployed contract: staked
BTC, watched `pendingReward` accrue, `claim()` minted STRAT, `unstake()`
returned the full principal.

## Part 3: AI yield advisor, with real cross-protocol supply and an x402 premium tier

**Scope, stated plainly.** The advisor ranks across three yield
surfaces: two inside Stratus — lending-pool supply (12 spot RWA
reserves: Gold, S&P 500 Index, 10 stocks — the ones with an actual
deposit UI) and StratusStaking (20 crypto reserves) — plus **Bonzo
Finance's real Hedera testnet deployment**, read-only, as additional
"supply" candidates ranked in the same bucket as Stratus's own. Bonzo
is a genuinely different, independently-deployed lending protocol —
not a Stratus instance, even though Stratus's own lending core also
happens to be a Bonzo fork. Its real testnet addresses (LendingPool
`0xD2d18d…dE516`, `AaveProtocolDataProvider` `0xf7330B…62AFa`, and
USDC/HBARX/SAUCE/WHBAR reserve addresses) came straight from Bonzo's
own public repo
([`Bonzo-Labs/bonzo-finance-contracts`](https://github.com/Bonzo-Labs/bonzo-finance-contracts),
`scripts/outputReserveData.json`) — not guessed, not mocked. Verified
live: real `liquidityRate` reads back (USDC 0.008%, HBARX 2.40%, SAUCE
~0%, WHBAR 51.43% APY at time of writing — genuine testnet economics,
not synthetic numbers).

It's an **advisor, not an agent**: it ranks and explains, the user
always clicks through and executes the transaction themselves. A Bonzo
pick links out to Bonzo's own testnet app (`testnet.bonzo.finance`) —
Stratus never deposits into Bonzo, or any protocol, on the user's
behalf.

**Free tier** (`frontend/src/lib/ai/advisor.ts`) is a deterministic,
read-only scorer (no LLM call) — real on-chain reads (pool
`liquidityRate` for supply APY, from both Stratus's own pool and
Bonzo's; `StratusStaking.pools()` for a token-denominated staking
rate), two independently-sorted buckets, no fake blending across units.
Supply APY is directly comparable across Stratus and Bonzo (same
underlying Aave-v2 rate math, real USD-denominated percentage either
way); the staking rate is STRAT emitted per staked token per year —
STRAT has no price feed, so it is *not* comparable to APY, and the code
keeps the two visually and
numerically separate rather than inventing a blended number.

**Premium tier** pays 1 USDC for a DeepSeek-reasoned recommendation,
gated by a real x402 flow: the client gets a genuine HTTP 402 challenge
(`x402Version`, `accepts[]` with `scheme: "exact"`, `network:
"hedera:testnet"` — a real CAIP-2 network id, per
[x402's own network support table](https://docs.x402.org/core-concepts/network-and-token-support)),
pays with a plain USDC transfer through the already-connected wallet,
then retries with `X-PAYMENT: base64(JSON.stringify({txHash}))`.

**What's real vs. disclosed-as-simplified, stated plainly, same as
every other part of this project:** the HTTP challenge/retry shape and
the `hedera:testnet` network id are the real x402 protocol. Settlement
verification is **not** the spec's EIP-3009 `exact` facilitator flow —
it's a self-hosted check (`server/x402.js`) that looks up the payment
transaction directly on the Hedera mirror node and confirms a matching
`Transfer` event log to the treasury address. Two real constraints drove
that choice: no official Hedera facilitator exists yet (only early
community ones, e.g. Blocky402, with unverified API stability), and
`MockUSDC` doesn't implement `transferWithAuthorization`. Running your
own facilitator is explicitly a legitimate part of the x402 design — the
verify/settle logic is protocol-defined, not Coinbase-proprietary — so
this is a documented engineering trade-off, not a fake implementation.

If the DeepSeek call fails for any reason after payment is already
verified, the server falls back to the same deterministic ranker the
free tier uses (`server/scorer.js`) rather than returning an error — a
paying user always gets a real answer.

**Verified for real, on Hedera testnet:** sent a real 1 USDC payment,
confirmed the server's mirror-node lookup found and validated the
matching `Transfer` log, confirmed the replay guard rejects a reused
`txHash`, and confirmed the fallback path produces a correct ranked
response when the LLM call fails.

### Running the advisor server

```
cd server && cp .env.example .env   # fill in DEEPSEEK_API_KEY
npm run advisor-server              # from the repo root, or `npm start` inside server/
```

`frontend/.env`'s `VITE_ADVISOR_SERVER_URL` points at it (defaults to
`http://localhost:8787`).
