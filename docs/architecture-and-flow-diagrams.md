# Stratus Finance — Architecture & User Flow

Two diagrams: the infrastructure (what's deployed and how it talks to
itself) and the user flow (what a person actually does, click by click).
Every component named here is real and deployed on Hedera testnet — see
[`README.md`](../README.md) §9 and
[`deployments/hederaTestnet.json`](../deployments/hederaTestnet.json)
for addresses and transaction hashes.

## Infrastructure

```mermaid
flowchart TB
    subgraph OFFCHAIN["Off-chain"]
        REDSTONE["RedStone Gateway\n(signed price data:\nXAU, USA500.Y, USDC,\n+ 10 individual stocks)"]
        UPDATER["update-redstone-prices.ts\n(operational script —\nwraps a tx with fresh\nsigned data, must run\nperiodically)"]
        REDSTONE -->|"fetch signed\nprice package"| UPDATER
    end

    subgraph FRONTEND["Frontend (React + ethers v6)"]
        UI["Mint / Deposit / Borrow /\nRisk Panel / Individual Stocks"]
        WALLET["MetaMask\n(Hedera testnet, chain 296)"]
        UI <--> WALLET
    end

    subgraph HEDERA["Hedera Testnet — chain 296"]
        subgraph TOKENS["Asset Tokenization Studio (ATS)"]
            GOLD["GOLD-x\n(real gold, diamond)"]
            STOCKIDX["STOCK-x\n(real S&P 500 index, diamond)"]
            STOCKS["10 individual stock diamonds\nAAPL-x · TSLA-x · MSFT-x · NVDA-x\nGOOGL-x · AMZN-x · META-x\nBRKB-x · AMD-x · PLTR-x"]
            USDC["MockUSDC"]
        end

        subgraph BASKET["Basket wrapper"]
            BASKETTOKEN["StratusBasketToken\n(sETF, 50/50 Gold+S&P500)"]
            VAULT["StratusVault\n(decompose / recompose)"]
        end

        subgraph ORACLE["Price oracle"]
            REDSTONEORACLE["StratusRedstoneOracle\n(cache: updatePrice writes,\ngetAssetPrice reads)"]
        end

        subgraph POOL["Lending core — Bonzo / Aave v2 fork"]
            PROVIDER["LendingPoolAddressesProvider"]
            LENDINGPOOL["LendingPool\n(deposit / withdraw / borrow / repay /\nliquidationCall)"]
            CONFIGURATOR["LendingPoolConfigurator"]
            RESERVES["13 reserves, each with its own\naToken + debtToken + interest rate strategy\nGOLD-x · STOCK-x · USDC · 10 stocks"]
            RISKVIEW["StratusRiskView\n(per-component health factor,\nread-only)"]
        end
    end

    UI -->|"eth_call / eth_sendTransaction"| LENDINGPOOL
    UI --> BASKETTOKEN
    UI --> VAULT
    UI -->|"getAssetPrice (public,\nno wallet needed)"| REDSTONEORACLE
    UI -->|"getUserRisk"| RISKVIEW

    UPDATER -->|"updatePrice(asset)\nwrapped tx"| REDSTONEORACLE

    VAULT -->|"holds & moves"| GOLD
    VAULT -->|"holds & moves"| STOCKIDX
    BASKETTOKEN -->|"mint / redeem"| GOLD
    BASKETTOKEN -->|"mint / redeem"| STOCKIDX

    LENDINGPOOL --> RESERVES
    RESERVES -.->|"underlying"| GOLD
    RESERVES -.->|"underlying"| STOCKIDX
    RESERVES -.->|"underlying"| STOCKS
    RESERVES -.->|"underlying"| USDC

    LENDINGPOOL -->|"getAssetPrice per reserve"| REDSTONEORACLE
    RISKVIEW -->|"getUserAccountData"| LENDINGPOOL
    RISKVIEW -->|"getAssetPrice"| REDSTONEORACLE
    PROVIDER -.->|"setPriceOracle"| REDSTONEORACLE
    CONFIGURATOR -.->|"batchInitReserve /\nconfigureReserveAsCollateral"| RESERVES

    style OFFCHAIN fill:#f5f0e8,stroke:#9c8a6e
    style FRONTEND fill:#eef3fb,stroke:#5b7ba8
    style HEDERA fill:#fbfbfb,stroke:#333
    style TOKENS fill:#fdf0e8,stroke:#c17a3f
    style BASKET fill:#f0f7ee,stroke:#5f9959
    style ORACLE fill:#f7eef7,stroke:#9c5d9c
    style POOL fill:#eef7f7,stroke:#3f8c8c
```

**Two independent paths into the pool.** The basket (GOLD-x + STOCK-x,
wrapped as sETF) is one path; the 10 individual stocks are deposited
directly — same `LendingPool.deposit`/`withdraw`, no wrapper. Both read
prices from the same `StratusRedstoneOracle`, which is a *cache*, not a
live feed: `update-redstone-prices.ts` has to run periodically (RedStone
is a pull oracle — see
[`docs/phase-3-oracle-research.md`](./phase-3-oracle-research.md)) or
`getAssetPrice` starts reverting with `"stale price"`.

## User flow

```mermaid
flowchart TD
    START(["Open the app"]) --> CONNECT["Connect wallet\n(auto-adds/switches to\nHedera testnet)"]

    CONNECT --> CHOICE{"Basket or\nindividual stock?"}

    CHOICE -->|"Basket\n(Gold + S&P 500)"| MINT["Mint Basket\napprove GOLD-x + STOCK-x\n→ mint sETF"]
    MINT --> DEPOSIT["Deposit & Decompose\napprove sETF → deposit\n→ splits into 2 isolated\nreserve positions"]
    DEPOSIT --> BORROW1["Borrow / Repay\nborrow USDC against\ncombined capacity"]

    CHOICE -->|"Individual stock\n(e.g. Apple, Tesla, ...)"| PICK["Individual Stocks\nbrowse 10 live prices\n(no wallet needed)"]
    PICK --> DEPOSIT2["Approve + Deposit\nchosen stock directly\ninto the pool"]
    DEPOSIT2 --> BORROW2["Borrow / Repay\nagainst that reserve"]

    BORROW1 --> RISK["Risk Panel\nlive prices, combined\nhealth factor (real,\nenforced), per-leg\nheuristic bars"]
    BORROW2 --> RISK

    RISK --> HEALTHY{"Health factor OK?"}
    HEALTHY -->|"Yes"| REPAY["Repay debt,\nwithdraw collateral"]
    REPAY -->|"basket path only"| RECOMPOSE["Recompose\nback into sETF"]

    HEALTHY -->|"No — a price move\npushed HF below 1\n(demo: owner-triggered\nstress, disclosed via\nbanner)"| LIQUIDATED["Liquidator calls\nliquidationCall on the\nstressed leg only —\nthe other leg/reserve\nis untouched"]
    LIQUIDATED --> RISK

    style START fill:#1a1a1a,color:#fff
    style CHOICE fill:#fdf0e8,stroke:#c17a3f
    style HEALTHY fill:#fdf0e8,stroke:#c17a3f
    style LIQUIDATED fill:#fbe9e9,stroke:#b04a4a
    style RISK fill:#f7eef7,stroke:#9c5d9c
```

**The isolation guarantee, visually.** Whichever path a user takes —
basket or individual stock — a bad price move only threatens the reserve
it actually hit. Liquidation seizes that one leg; every other position
the user holds is provably unchanged (verified on-chain both directions
— see `PLAN.md` Gate 4).
