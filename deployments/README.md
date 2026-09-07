# deployments

One JSON file per network, written and read by the deploy scripts in
`contracts/script/` and `tokenization/scripts/` (via their shared
`utils/deployments.ts` helpers). Committed to the repo so the submission is
always a reproducible pointer to what's actually live — see PLAN.md §9.

Shape:

```json
{
  "network": "hederaTestnet",
  "updatedAt": "2026-01-01T00:00:00.000Z",
  "contracts": {
    "GoldToken": "0x...",
    "StockIndexToken": "0x...",
    "StratusPriceOracle": "0x...",
    "StratusBasketToken": "0x...",
    "LendingPool": "0x...",
    "ProtocolDataProvider": "0x...",
    "StratusVault": "0x...",
    "StratusRiskView": "0x...",
    "MockUSDC": "0x..."
  },
  "meta": {
    "demoLiquidationRun": {
      "depositTx": "0x...",
      "borrowTx": "0x...",
      "stressTx": "0x...",
      "liquidationTx": "0x..."
    }
  }
}
```

No file exists here yet — Phase 0/1 hasn't deployed anything. The first
script to run (`contracts/script/00-deploy-oracle.ts` or
`tokenization/scripts/issue-assets.ts`) creates `hederaTestnet.json`.
