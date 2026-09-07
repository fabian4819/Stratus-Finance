# Stratus Finance

**RWA Basket Collateral Lending Protocol on Hedera**

Target event: ETHGlobal ETHOnline 2026
Target sponsor track: Hedera — Tokenization of Anything ($6,000, up to 3 teams @ $2,000)

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

1. User deposits one basket token (e.g. an ETF-style token representing 50% tokenized gold, 50% tokenized stock index) into the Stratus Vault contract.
2. The Vault contract "looks through" the basket and allocates the underlying value proportionally into **separate, isolated lending reserves** — one per underlying asset type.
3. Each reserve has its own independently calibrated risk parameters (loan-to-value ratio, liquidation threshold, liquidation bonus) based on that specific asset's volatility.
4. The user can borrow stablecoins against the combined borrowing capacity of all their underlying positions.
5. If one underlying asset's price drops and crosses its liquidation threshold, only that specific reserve is liquidated. Other components of the basket remain untouched and continue backing the loan normally.
6. On withdrawal (assuming the position is healthy), the underlying components are proportionally recombined back into the basket token.

This mirrors the "isolation mode" pattern used in modern lending protocol design for correlated or hard-to-price collateral, applied specifically to a multi-asset RWA basket context — which, per research, has not yet been done for basket-style RWA tokens.

## 4. Architecture

```
User holds "Stratus ETF" basket token (e.g. 50% gold-token, 50% stock-index-token)
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
| RWA tokenization | Hedera Asset Tokenization Studio (ATS) SDK | Mint synthetic tokenized assets (gold-tracking, stock-index-tracking tokens); reused directly, not built from scratch |
| Price feeds | Pyth Network (live on Hedera testnet) | Real-time pricing for underlying assets; same oracle already proven by All Weather Finance |
| Lending core + liquidation engine | Forked `bonzo-finance-contracts` (Aave v2 fork, open source) | Provides audited, battle-tested per-asset reserve logic, health factor calculation, and liquidation mechanics — reused and extended rather than rebuilt |
| Basket wrapper (core original contribution) | Custom Solidity contract | Decomposes/recomposes the basket token into individual isolated reserve positions |
| Frontend | React, TypeScript, Tailwind | Dashboard for deposit, borrow, and per-component health factor visibility |
| Wallets | HashPack, MetaMask (via Hedera EVM compatibility) | Standard Hedera wallet integration |

## 6. Feasibility Notes

- **No mocked lending logic**: by forking Bonzo Finance (itself an open-source Aave v2 fork), the core lending, interest rate, and liquidation mechanics are real, deployed, and already audited upstream — not reimplemented or simulated.
- **No mocked pricing**: Pyth Network feeds are live and real on Hedera testnet.
- **No mocked tokenization**: ATS SDK produces real, compliant tokenized assets, not placeholder tokens.
- **Liquidation is fully demonstrable on testnet without deep DEX liquidity**: Aave v2-style `liquidationCall()` is a self-contained contract operation — the liquidator receives seized collateral directly from the protocol; reselling that collateral externally is a separate, subsequent action outside the core mechanism being demonstrated.
- **Realistic scope for a hackathon build**: limited to two underlying asset types (e.g. gold-tracking and stock-index-tracking tokens) in a simple fixed-ratio basket, rather than a fully customizable multi-asset allocation system. Custom allocation ratios and additional asset types are noted as future work.

## 7. Bounty Alignment

- **Primary target — Hedera: Tokenization of Anything.** Directly matches stated qualification requirements: use of Asset Tokenization Studio, testnet deployment, and a demonstrated lifecycle operation (in this case, borrowing against tokenized collateral).
- **Possible extra-points alignment**: the track explicitly lists *"Contributions back upstream to ATS"* as a bonus criterion — a small upstream PR or documented issue report during development could satisfy this if time allows.

## 8. Differentiation Summary

| Existing project | What it does | What Stratus Finance adds |
|---|---|---|
| All Weather Finance | Auto-rebalancing RWA basket token (static, holdable only) | Makes the basket productive as collateral via isolated per-asset lending |
| Bonzo Finance | General-purpose lending/borrowing for crypto-native and HTS assets | Extends the same audited infrastructure to support decomposed RWA basket collateral specifically |
| Industry RWA lending (Morpho etc.) | Accepts only single-asset RWA tokens as collateral | Solves the basket-collateral problem those protocols explicitly avoid, using an isolation-mode approach |

---

## Repository layout

```
stratus-finance/
├─ contracts/                 # Hardhat workspace — lending core (Bonzo/Aave v2 fork) + Stratus contracts
├─ tokenization/              # ATS SDK scripts: issue GOLD-x / STOCK-x, control-list management
├─ frontend/                  # React + TypeScript + Tailwind dashboard
├─ deployments/               # Testnet deployment address JSON, per run
├─ docs/                      # Risk param rationale, demo script, ATS upstream friction log
├─ PLAN.md                    # Development plan — phases, gates, risk register
└─ README.md                  # This file
```

See [`PLAN.md`](./PLAN.md) for the phased build plan, architecture decisions, and testing strategy.

## Getting started

```bash
npm install

# Contracts (Hardhat, Hedera testnet)
cd contracts && npm run compile && npm test

# Tokenization scripts (ATS SDK)
cd tokenization && npm run issue:assets

# Frontend
cd frontend && npm run dev
```

Requires a `.env` in `contracts/` and `tokenization/` with a funded Hedera testnet account (see `.env.example` in each).
