# Hedera "Tokenization of Anything" — qualification checklist

Cross-checked against the requirements stated in this repo's own research
(`README.md` §2, §7) and `PLAN.md` §7. Verify against the live ETHGlobal
bounty page before submission in case wording changed after this was
written.

## Stated requirements

- [x] **Uses Asset Tokenization Studio.** GOLD-x and STOCK-x are real ATS
      Equity diamonds, issued via `@hashgraph/asset-tokenization-contracts`
      directly against the live Hedera testnet Factory/Resolver — not a
      placeholder ERC20. Addresses:
      [`0xcF19...C7fc`](https://hashscan.io/testnet/contract/0xcF19378058EC9DFD25975527BDf7F68faeC2C7fc),
      [`0x59E3...0d3A`](https://hashscan.io/testnet/contract/0x59E3908069993cDDbD3C83479c1aFc92242c0d3A).
- [x] **Deployed on Hedera testnet.** Every contract in this project —
      Stratus originals and the forked Bonzo/Aave v2 core — is live on
      chain id 296. Full address table in `README.md` §9.
- [x] **Demonstrates a lifecycle operation.** Borrowing stablecoins
      against tokenized collateral, run for real: deposit → borrow →
      repay → withdraw (Gate 2), and the basket-specific
      decompose/recompose path (Gate 3) — both fully passed on-chain, tx
      hashes in `deployments/hederaTestnet.json`.
- [x] **Contributions back upstream to ATS (bonus).** Three real friction
      points filed as issues against `hashgraph/asset-tokenization-studio`:
      [#1397](https://github.com/hashgraph/asset-tokenization-studio/issues/1397),
      [#1398](https://github.com/hashgraph/asset-tokenization-studio/issues/1398),
      [#1399](https://github.com/hashgraph/asset-tokenization-studio/issues/1399).

## Secondary track — Open Source: Improve the Hedera Harness ($2,000)

- [x] **Genuine rough edge, fixed for real, contributed upstream.** The
      tinybar/wei native-currency precision bug hit and fixed in
      `StratusPriceOracle` (see `docs/phase-2-findings.md`) is now a Tier 0-1
      deterministic check in `hedera-dev/hedera-harness`, plus documented
      directly in its generator/repair prompts' Hard Constraints, so
      agent-generated Hedera contracts get the same guardrail:
      [PR #45](https://github.com/hedera-dev/hedera-harness/pull/45).
      Includes 4 new unit tests (fixtures modeled on the real before/after
      code) and a full local pass of the harness's own test suite
      (175/175) and typecheck before opening the PR.

## What's real vs. disclosed-as-substituted, stated plainly

- Lending core: real, unmodified Bonzo/Aave v2 fork, deployed through the
  actual upgradeable-proxy flow — not reimplemented, not a mock.
- ATS tokenization: real, compliance-gated diamond contracts — not a
  placeholder.
- Price oracle: **live** on Chainlink (real, push-based, verified fresh);
  **as-designed** on Pyth (real integration, blocked by infrastructure
  outside this repo — documented, not hidden). See
  `docs/phase-2-findings.md`.
- Underlying assets: GOLD-x tracks HBAR/USD, STOCK-x tracks ETH/USD — both
  disclosed substitutes, since no commodity/equity feed exists on Hedera
  testnet from either oracle checked. Not real gold or equity prices.
- Liquidation stress mechanism: an owner-gated, event-logged demo offset
  (`setDemoOffsetBps`) — disclosed via a persistent UI banner whenever
  active, not a silent price manipulation.

## Evidence trail

Every claim above is backed by a real transaction hash, not just an
assertion — see:
- `README.md` §9 for the address table and gate-by-gate summary.
- `deployments/hederaTestnet.json` for every tx hash, organized by gate.
- `PLAN.md` for the full phase-by-phase build log with real status
  markers (not aspirational checkboxes).
- `docs/phase-0-findings.md` through `docs/phase-2-findings.md` for the
  detailed research/debugging trail, including the parts that didn't work
  on the first try.
