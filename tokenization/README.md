# tokenization

Scripts around `@hashgraph/asset-tokenization-sdk` (the ATS SDK) — issuing
GOLD-x / STOCK-x and managing control-list access for protocol contracts.
See `PLAN.md` §Phase 1 and §6.2.

## Status

Written against the real, documented SDK API (`Network`, `Equity`,
`Security`, `Role` namespaces — confirmed from
`hashgraph/asset-tokenization-studio`'s `packages/ats/sdk/README.md`), but
**not yet run against an installed copy of the package**. The first run
will likely need small adjustments to match the exact exported TypeScript
types if they've drifted from the README. Treat this as "ready to
integration-test," not "known-working."

## Scripts

| Script | Does | Run after |
|---|---|---|
| `issue-assets.ts` | Issues GOLD-x and STOCK-x as ATS Equity securities, mints initial demo supply to the operator account, writes their EVM addresses to `deployments/hederaTestnet.json` | Phase 0 spikes pass |
| `whitelist-protocol-addresses.ts` | Adds the aToken contracts, `StratusVault`, and the demo liquidator to each asset's control list | `issue-assets.ts` + Phase 2/3 contract deploys |

## Setup

```bash
cp .env.example .env   # fill in a funded Hedera testnet operator account
npm install
npm run issue:assets
```
