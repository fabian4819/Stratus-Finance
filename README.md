# Stratus Finance

**RWA Basket Collateral Lending Protocol on Hedera**

Target event: ETHGlobal ETHOnline 2026
Target sponsor track: Hedera — Tokenization of Anything ($6,000, up to 3 teams @ $2,000)

**Status: built and verified on Hedera testnet.** Every mechanism described
below — decomposition, isolated deposit/borrow/repay, and isolated
liquidation (both directions) — has been run for real on-chain, not just
unit-tested. See [§9 Live Deployment](#9-live-deployment--verified-results)
for every contract address and transaction hash.

---

## 1. Problem Statement

RWA (Real World Asset) basket-style tokens — portfolios that combine multiple asset classes such as tokenized stocks, gold, and bonds into a single ETF-like token — cannot currently be used as collateral in any lending market.

This is not simply a missing feature. Industry research confirms it is a deliberate limitation: established lending protocols (e.g. Morpho) only accept single-asset RWA tokens as collateral, never diversified baskets. The reason is technical: a combined basket is difficult to price reliably in real time and difficult to liquidate safely, since a price move in one component (e.g. gold) shouldn't force liquidation of the entire basket, including components that haven't moved (e.g. stocks).

The industry-standard mitigation for this class of problem is **isolation mode** — treating each underlying asset as a separate collateral reserve with its own risk parameters, rather than pricing and liquidating a basket as one unit.

**Stratus Finance implements this isolation-mode approach for RWA baskets on Hedera**, allowing basket holders to borrow against their portfolio without needing to sell it, while keeping each underlying asset's risk fully isolated from the others.

## 2. Why This Direction (Research Validation)

This idea was arrived at through a structured "observe → imitate → modify" process applied to previous Hedera hackathon winners, cross-checked against the broader ETHGlobal ecosystem and DeFi industry research to avoid duplicating existing solutions:

- **All Weather Finance** (ETHGlobal New Delhi, Hedera 2nd place) built an auto-rebalancing RWA basket (S&P stocks + gold + bonds) on Hedera using Pyth price feeds and HTS. Its token is static — it can be held, but not used productively elsewhere in DeFi.
- Reframing this gap as "add lending support" was checked against real-world lending protocol design (Morpho, Aave-based systems) and confirmed to be a genuine, unsolved technical problem — not a trivial feature omission.
- Adjacent ideas explored and ruled out during research: agent-to-agent data marketplaces, sentiment-signal trading with liquidity checks, and idle-capital-to-yield advisors were all found to already exist as built projects elsewhere in the ETHGlobal ecosystem (e.g. CapyMate, an ETHGlobal OpenAgent Hackathon project combining sentiment signals with slippage/safety validation; an ETHGlobal showcase project described as "AI advisor that puts idle stablecoins to work at rates two sources agree on"). This basket-collateral direction does not overlap with any of those.
- The direction also aligns with Hedera's own stated priority for this track: *"Institutional adoption is the dominant narrative in the market right now, and tokenised collateral is the sharpest edge of it,"* and its explicit example idea: *"Tokenised collateral for repo — post tokenised treasuries as collateral with programmatic proof and release."*

## 3. Core Mechanism: Look-Through Isolation

Instead of listing the basket token itself as a single collateral asset (which reintroduces the basket-pricing/liquidation problem), Stratus Finance decomposes the basket at the point of deposit:

1. User deposits one basket token (an ETF-style token representing 50% tokenized gold-tracking asset, 50% tokenized stock-index-tracking asset) into the Stratus Vault contract.
2. The Vault contract "looks through" the basket and allocates the underlying value proportionally into **separate, isolated lending reserves** — one per underlying asset type.
3. Each reserve has its own independently calibrated risk parameters (loan-to-value ratio, liquidation threshold, liquidation bonus) based on that specific asset's volatility.
4. The user can borrow stablecoins against the combined borrowing capacity of all their underlying positions.
5. If one underlying asset's price drops and crosses its liquidation threshold, only that specific reserve is liquidated. Other components of the basket remain untouched and continue backing the loan normally.
6. On withdrawal (assuming the position is healthy), the underlying components are proportionally recombined back into the basket token.

This mirrors the "isolation mode" pattern used in modern lending protocol design for correlated or hard-to-price collateral, applied specifically to a multi-asset RWA basket context — which, per research, has not yet been done for basket-style RWA tokens.

**This isn't just the design — it's been proven.** In the Phase 4 liquidation demo (see §9), a position holding both legs had its GOLD-x leg crashed −90% and liquidated; the STOCK-x aToken balance was confirmed byte-for-byte unchanged before and after (`0.3` → `0.3`). The mirror case (STOCK-x crashed instead) confirmed the same in the other direction (`800.0` → `800.0` on the GOLD-x leg). Both runs are on real Hedera testnet, with recorded transaction hashes.

## 4. Architecture

```
User holds "Stratus ETF" basket token (50% gold-tracking token, 50% stock-index-tracking token)
                        │
              Deposit into Stratus Vault contract
                        │
        Vault decomposes basket proportionally
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
  Reserve: Gold-token                Reserve: Stock-index-token
  (forked Bonzo/Aave v2 pool)        (forked Bonzo/Aave v2 pool)
  Own LTV / liquidation params       Own LTV / liquidation params
        │                               │
        └───────────────┬───────────────┘
                        ▼
        User borrows stablecoin (USDC) against
        combined borrowing capacity
                        │
        If gold price drops sharply:
        liquidationCall() executes ONLY on the
        gold reserve — stock-index reserve is
        unaffected and continues backing the loan
```

## 5. Technology Stack

| Layer | Technology | Role |
|---|---|---|
| RWA tokenization | Hedera Asset Tokenization Studio (ATS) | Real, compliant ERC-1400-style diamond tokens for GOLD-x and STOCK-x, issued directly via `@hashgraph/asset-tokenization-contracts` — see §6 |
| Price feeds (live) | **RedStone** (real, signed pull-oracle feeds, verified on-chain via `PrimaryProdDataServiceConsumerBase`) | GOLD-x tracks real gold spot (`XAU`), STOCK-x tracks the real S&P 500 index (`USA500.Y`) — not substitutes — see §6 and [`docs/phase-3-oracle-research.md`](./docs/phase-3-oracle-research.md) |
| Price feeds (also live, alternate) | Chainlink (real, push-based feeds on Hedera testnet) | HBAR/USD and ETH/USD — kept in the codebase as a working alternate oracle, one `setPriceOracle` call away |
| Price feeds (as designed) | Pyth Network | Originally designed oracle — fully implemented and unit-tested (`updatePriceFeeds`, staleness checks) but blocked by Pyth/Hedera infrastructure outside this repo's control; kept in the codebase — see [`docs/phase-2-findings.md`](./docs/phase-2-findings.md) |
| Lending core + liquidation engine | Forked `bonzo-finance-contracts` (Aave v2 fork, open source) | Real, unmodified, deployed through the standard upgradeable-proxy flow — health factor, interest accrual, and `liquidationCall` are Aave v2's own audited logic, not reimplemented |
| Basket wrapper (core original contribution) | `StratusBasketToken` + `StratusVault` (Solidity) | Decomposes/recomposes the basket token into individual isolated reserve positions |
| Risk view (original contribution) | `StratusRiskView` (Solidity) | Per-component health-factor heuristic alongside the pool's real, enforced health factor |
| Frontend | React, TypeScript, Tailwind, ethers v6 | Four screens wired to the live deployment — mint, deposit/decompose, borrow/repay, risk panel |
| Wallets | MetaMask (Hedera EVM) | Auto-switches/adds the Hedera testnet chain |

## 6. Feasibility Notes

- **No mocked lending logic**: by forking Bonzo Finance (itself an open-source Aave v2 fork), the core lending, interest rate, and liquidation mechanics are real, deployed, and already audited upstream — not reimplemented or simulated. Deployed for real through the full upgradeable-proxy flow, not a shortcut.
- **No mocked pricing, and no substitute assets either**: the pool is wired to RedStone's real, signed price feeds — GOLD-x tracks the actual gold spot price, STOCK-x tracks the actual S&P 500 index level, verified on-chain, not a stub. Getting here meant checking every oracle actually integrated with Hedera (Pyth, Chainlink, Supra) and finding all three lacked real-world-asset feeds on Hedera testnet specifically, before RedStone's differently-architected pull model (verification happens inside our own contract, no oracle-side Hedera deployment needed) closed the gap — full research trail, three real bugs found and fixed along the way, in [`docs/phase-3-oracle-research.md`](./docs/phase-3-oracle-research.md). Chainlink (real, live) and Pyth (real, blocked) both stay in the codebase as working/documented alternates — see [`docs/phase-2-findings.md`](./docs/phase-2-findings.md).
- **No mocked tokenization**: GOLD-x and STOCK-x are real ATS-issued diamond contracts (not placeholder ERC20s), with real control-list compliance gating enforced and navigated (every protocol contract — the pool, the vault, both aTokens, the demo liquidator — is explicitly whitelisted; see [`docs/phase-0-findings.md`](./docs/phase-0-findings.md) and [`docs/phase-2-findings.md`](./docs/phase-2-findings.md) for the friction this surfaced).
- **Liquidation is fully demonstrable on testnet without deep DEX liquidity**: Aave v2-style `liquidationCall()` is a self-contained contract operation — the liquidator receives seized collateral directly from the protocol; reselling that collateral externally is a separate, subsequent action outside the core mechanism being demonstrated. Run for real, both directions — see §9.
- **Realistic scope for a hackathon build**: two underlying asset types in a simple fixed-ratio (50/50) basket, rather than a fully customizable multi-asset allocation system. Custom allocation ratios and additional asset types are noted as future work in [`PLAN.md`](./PLAN.md).

## 7. Bounty Alignment

- **Primary target — Hedera: Tokenization of Anything.** Directly matches stated qualification requirements: use of Asset Tokenization Studio, testnet deployment, and a demonstrated lifecycle operation (borrowing against tokenized collateral, run for real — see §9).
- **Upstream ATS contribution (bonus criterion):** three substantive, real friction points found integrating the ATS SDK, filed as issues against `hashgraph/asset-tokenization-studio` — [#1397](https://github.com/hashgraph/asset-tokenization-studio/issues/1397), [#1398](https://github.com/hashgraph/asset-tokenization-studio/issues/1398), [#1399](https://github.com/hashgraph/asset-tokenization-studio/issues/1399). Full writeup in [`docs/ats-friction.md`](./docs/ats-friction.md).
- **Secondary target — Open Source: Improve the Hedera Harness.** A real rough edge hit building this project — a Pyth refund (`msg.value - fee`) silently rounding to zero because Hedera's 8-decimal tinybar ledger drops native-value amounts below 1e10 wei, including internal contract-to-contract forwards (see [`docs/phase-2-findings.md`](./docs/phase-2-findings.md) and `StratusPriceOracle._roundUpToTinybar`) — contributed back to `hedera-dev/hedera-harness` as a new Tier 0-1 deterministic check that flags the same pattern in agent-generated contracts, plus the gotcha documented directly in its generator/repair prompts: [PR #45](https://github.com/hedera-dev/hedera-harness/pull/45).
- **Not chasing it, but worth noting honestly:** Chainlink is also a sponsor at this event, and this project ended up using their real, live Hedera testnet price feeds — not for bounty alignment (their specific prize tracks here are a Continuity-Track-only upgrade prize and a separate Sepolia mini-challenge, neither of which fits this submission), but because their infrastructure genuinely solved a real blocker (see [`docs/phase-2-findings.md`](./docs/phase-2-findings.md)). Mentioned for transparency, not claimed as a qualification.

## 8. Differentiation Summary

| Existing project | What it does | What Stratus Finance adds |
|---|---|---|
| All Weather Finance | Auto-rebalancing RWA basket token (static, holdable only) | Makes the basket productive as collateral via isolated per-asset lending |
| Bonzo Finance | General-purpose lending/borrowing for crypto-native and HTS assets | Extends the same audited infrastructure to support decomposed RWA basket collateral specifically |
| Industry RWA lending (Morpho etc.) | Accepts only single-asset RWA tokens as collateral | Solves the basket-collateral problem those protocols explicitly avoid, using an isolation-mode approach |

## 9. Live Deployment & Verified Results

All addresses on **Hedera testnet** (chain id 296) — full record with every transaction hash in [`deployments/hederaTestnet.json`](./deployments/hederaTestnet.json).

| Contract | Address |
|---|---|
| GOLD-x (ATS Equity) | [`0xcF19378058EC9DFD25975527BDf7F68faeC2C7fc`](https://hashscan.io/testnet/contract/0xcF19378058EC9DFD25975527BDf7F68faeC2C7fc) |
| STOCK-x (ATS Equity) | [`0x59E3908069993cDDbD3C83479c1aFc92242c0d3A`](https://hashscan.io/testnet/contract/0x59E3908069993cDDbD3C83479c1aFc92242c0d3A) |
| MockUSDC (debt asset) | [`0xDc2088fd97eda106943cABf443cA5c6702c37154`](https://hashscan.io/testnet/contract/0xDc2088fd97eda106943cABf443cA5c6702c37154) |
| StratusBasketToken | [`0x2255Eb7Bc29A27E2b9113D6BA28807812Bd4DEaD`](https://hashscan.io/testnet/contract/0x2255Eb7Bc29A27E2b9113D6BA28807812Bd4DEaD) |
| StratusVault | [`0x7F16Cd599BF2aDBBacD856263ef36eABFfeC06B2`](https://hashscan.io/testnet/contract/0x7F16Cd599BF2aDBBacD856263ef36eABFfeC06B2) |
| StratusRiskView | [`0xBFe160409B8f0Ebb9DC7Bb67f5E3373e1457eE5d`](https://hashscan.io/testnet/contract/0xBFe160409B8f0Ebb9DC7Bb67f5E3373e1457eE5d) |
| StratusRedstoneOracle (live — real gold + S&P 500) | [`0xeB188cF2F86E2236001Ca1BEB8E8b3f2184D662D`](https://hashscan.io/testnet/contract/0xeB188cF2F86E2236001Ca1BEB8E8b3f2184D662D) |
| StratusChainlinkPriceOracle (alternate, live) | [`0x784B85521B77F43655960718539E85fBa012e659`](https://hashscan.io/testnet/contract/0x784B85521B77F43655960718539E85fBa012e659) |
| StratusPriceOracle (Pyth, as designed) | [`0xB590789A6cC576ED8C14A3E846c16b9f9a4Cc681`](https://hashscan.io/testnet/contract/0xB590789A6cC576ED8C14A3E846c16b9f9a4Cc681) |
| LendingPool (Bonzo/Aave v2 fork) | [`0x36f251a19372c550cc3784E108391eeC004B903E`](https://hashscan.io/testnet/contract/0x36f251a19372c550cc3784E108391eeC004B903E) |

### What's been proven, on-chain, for real

| Gate | Result |
|---|---|
| **Gate 1** — basket mint/redeem round trip | ✅ Passed — real ATS underlying, exact balances, zero dust |
| **Gate 2** — deposit → borrow → repay → withdraw, raw pool | ✅ Passed, fully — including borrow/repay, unblocked by the oracle pivot |
| **Gate 3** — basket deposit/decompose + withdraw/recompose | ✅ Passed, fully |
| **Gate 4** — isolated liquidation, both directions | ✅ Passed — gold-crashes and stock-crashes scenarios both run for real, untouched-leg invariant held exactly both times |
| **Gate 5** — frontend wired and reading live data | ✅ Verified in a real browser session against this deployment |

Full phase-by-phase build log, every architectural decision, and every blocker encountered (including the ones that didn't work) are in [`PLAN.md`](./PLAN.md) and the `docs/phase-*-findings.md` files — written as they happened, not cleaned up after the fact.

---

## Repository layout

```
stratus-finance/
├─ contracts/                 # Hardhat workspace — lending core (Bonzo/Aave v2 fork) + Stratus contracts
├─ tokenization/              # ATS scripts: issue GOLD-x / STOCK-x, control-list management
├─ frontend/                  # React + TypeScript + Tailwind dashboard, wired to the live deployment
├─ deployments/               # Testnet deployment addresses + every verification tx hash
├─ docs/                      # Risk param rationale, demo script, phase-by-phase findings, ATS upstream friction log
├─ PLAN.md                    # Development plan — phases, gates, risk register, all marked with actual status
└─ README.md                  # This file
```

See [`PLAN.md`](./PLAN.md) for the phased build plan, architecture decisions, and testing strategy — kept up to date with what actually happened at each step, including the Pyth→Chainlink oracle pivot and why.

## Getting started

```bash
npm install

# Contracts (Hardhat) — local unit tests, no network needed
cd contracts && npm run compile && npm test

# Deploy scripts that touch the live testnet deployment are numbered/named
# under contracts/script/ and contracts/lib/bonzo/script/ — see
# contracts/script/README.md for the exact order they were run in.

# Tokenization scripts (ATS)
cd tokenization && npm run issue:assets

# Frontend — reads the addresses in frontend/.env (copy .env.example,
# already pointed at the live deployment above)
cd frontend && npm run dev
```

Requires a `.env` in `contracts/` and `tokenization/` with a funded Hedera testnet account (see `.env.example` in each) to run anything against the live network — the unit test suites (`contracts/test/`) need no network access at all.
