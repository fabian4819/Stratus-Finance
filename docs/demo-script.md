# Demo script (target ~90s, well under the 4 min cap)

Click-by-click path for the submission video, paired with the exact
line to say for each action. Everything below has actually been run,
for real, on the live testnet deployment — see
[`README.md` §9](../README.md#9-live-deployment--verified-results) for
every address and [`deployments/hederaTestnet.json`](../deployments/hederaTestnet.json)
for every transaction hash. The isolated-liquidation proof (Gate 4) is
not filmed in this cut — it's documented with real tx hashes in
`README.md` §9 and `PLAN.md` for anyone who wants to check it directly.

## Before recording

- [ ] Run `cd contracts && npx ts-node script/update-redstone-prices.ts`
      shortly before filming — RedStone is a pull oracle, prices go
      stale after 1 hour (`maxPriceAge`), and a stale price makes
      `quote()`/deposits revert silently in the UI.
- [ ] Wallet used for recording has a funded GOLD-x/STOCK-x/USDC
      balance — the operator account already does.
- [ ] Not personally click-tested end-to-end with a connected wallet
      as of this writing — do one dry run before the real take.

## Scene 1 — Problem (~15s)

**Action:** Title slide or blank browser tab.

**Say:**
> "RWA basket tokens can be held, but can't be used as collateral anywhere — a combined basket is hard to price and hard to liquidate safely. Stratus Finance solves this."

## Scene 2 — Mint the basket (~15s)

**Action:** Open `stratusfinance.vercel.app`, connect wallet, click **Mint Basket**. Enter an amount, click **Approve & Mint**.

**Say:**
> "Minting the Stratus ETF — one token backed by real tokenized gold and a real tokenized S&P 500 Index."

## Scene 3 — Deposit & decompose (~30s) — the pitch

**Action:** Click **Deposit**. Enter the sETF amount, click **Approve & Deposit**. Point at the two resulting reserve cards and the combined health factor.

**Say:**
> "Depositing triggers the Vault to decompose the basket — live — into two separate, isolated reserves. Gold gets its own LTV and liquidation threshold; the S&P 500 leg gets a different one. This is two independent positions, not one averaged basket."

## Scene 4 — Borrow (~15s)

**Action:** Click **Borrow**. Point at the itemized capacity (gold's contribution, stock's contribution, shown separately). Pick USDC, enter an amount, click **Borrow**.

**Say:**
> "Now I can borrow USDC against the combined capacity of both legs, itemized, not one opaque number."

## Scene 5 — Close (~10s)

**Action:** Hold on the Portfolio page or the logo.

**Say:**
> "Real ATS tokens, real RedStone prices, a real unmodified Aave v2 pool. This is Stratus Finance."
