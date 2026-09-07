# Risk parameter rationale

Starting parameters for the two isolated reserves (PLAN.md §Phase 2). These
are hackathon-scope defaults reasoned from each asset's real-world
volatility profile, not calibrated from historical Hedera testnet price
data (there isn't enough of it). Judges will ask why gold and the stock
index get different numbers — this is that answer.

| Reserve | LTV | Liquidation threshold | Liquidation bonus |
|---|---|---|---|
| GOLD-x | 70% | 75% | 5% |
| STOCK-x | 55% | 65% | 10% |

## Why gold gets a higher LTV and a tighter LTV-to-threshold gap

Gold is the least volatile of the two underlyings on any reasonable
horizon, has centuries of price history, and (via Pyth) a deep, liquid
real-world reference market. A 5-point gap between LTV (70%) and
liquidation threshold (75%) is tight because gold rarely needs a big buffer
— sudden double-digit-percent moves are uncommon.

## Why the stock index gets a lower LTV and a wider gap, but a bigger bonus

An equity index can move 5-10% in a single session on macro news, so it
needs (a) a lower LTV to start further from the liquidation threshold, and
(b) a wider LTV-to-threshold gap to absorb that volatility without
triggering avoidable liquidations on noise. The bigger liquidation bonus
(10% vs 5%) compensates liquidators for the extra price risk they take on
between the trigger and their execution.

## Why these are not final

These are placeholder-but-defensible numbers for a hackathon demo, not a
risk model. Real calibration would use historical volatility (e.g.
30/90-day realized vol) and the actual liquidity depth of the Pyth feeds
selected in Phase 0. Noted as future work in PLAN.md §0.

## Demo stress parameters

`script/demo-liquidation.ts` (PLAN.md §Phase 4) stresses the gold price by
-40% via `StratusPriceOracle.setDemoOffsetBps`. That's deliberately larger
than a realistic single-session gold move — it's chosen to reliably cross
the 75% liquidation threshold in one scripted step for a repeatable demo,
not to represent a plausible market event. See PLAN.md §6.3 for why this
mechanism exists and how it's disclosed.
