# Bonzo Finance fork — setup

This directory holds the forked `bonzo-finance-contracts` (Aave v2 fork)
source, per `PLAN.md` §Phase 2 / Phase 0 spike (deploy an unmodified Aave
v2 `LendingPool` to Hedera testnet).

## Vendored, not a git submodule — and why

The original plan called for a pinned git submodule. In this sandbox,
`git clone` / `git submodule add` against GitHub repeatedly produced a
corrupted `.git` with a broken `HEAD` under network throttling (small
repos cloned fine; this ~15MB repo did not, across multiple retries).
Plain HTTPS worked reliably, so the source was instead fetched as a GitHub
tarball and vendored directly into `contracts/lib/bonzo/contracts/`.

- **Upstream repo:** https://github.com/Bonzo-Labs/bonzo-finance-contracts
- **Vendored commit:** `38441b697a51c22bef6a9fb660bea46aa429c11c` (`main`, 2026-01-22, "fix: audit findings")
- **Fetched via:** `codeload.github.com/.../tar.gz/refs/heads/main` (not git protocol)

**Action item:** on a machine with reliable git access, convert this to a
proper pinned submodule (`git submodule add https://github.com/Bonzo-Labs/bonzo-finance-contracts.git contracts/lib/bonzo/upstream` at the commit
above, or newer) so upstream diffs are trackable normally. Until then, this
vendored copy is the source of truth for what's deployed.

### Files removed from the vendored copy

A handful of peripheral, non-core files were removed because they pull in
dependencies unrelated to the core lending pool (SaucerSwap DEX wrapper
contracts, a Chainlink-based mock oracle) and aren't needed for anything
Stratus does:

- `contracts/mocks/oracle/Supra/` (needs `@chainlink/contracts`, not installed)
- `contracts/mocks/swap/` (SaucerSwap router mock, solc 0.8.x import conflict)
- `contracts/tokenWrapper/` (SaucerSwap ERC20 wrapper, solc 0.8.x)
- `contracts/dependencies/openzeppelin/contracts/UpdatedOwnable.sol`, `Ownable2Step.sol` (solc 0.8.x, used only by the removed files)
- `contracts/interfaces/ISaucerswapRouter.sol` (used only by the removed files)

None of the above are imported by `LendingPool.sol` or its core
dependency tree — removing them does not affect the lending pool itself.
If a later phase needs SaucerSwap integration, re-vendor those files (and
their `@chainlink/contracts` dependency) separately rather than restoring
them here.

## Phase 0 spike result: SUCCESS

Deployed for real to Hedera testnet (chain id 296) via a one-off
`hardhat.bonzo.config.ts` (sources pointed at this directory,
solc 0.6.12, `evmVersion: istanbul` — matching Bonzo's own config exactly)
and `lib/bonzo/spike-test/deploy-spike.ts`. See `docs/phase-0-findings.md`
for full gas numbers and addresses. Headline result: **no gas or
bytecode-size issue at all** — every core contract is comfortably under
the EIP-170 24,576-byte limit, and `LendingPool` (the largest, at library
linked deploy time) used 4,600,154 gas, well within Hedera testnet's
per-transaction ceiling. `LendingPool.initialize()` was also called
directly and executed correctly, confirming the linked bytecode runs, not
just deploys.

**Deploy order** (library linking, confirmed working):
1. `GenericLogic` (library, no dependencies)
2. `ReserveLogic` (library, no dependencies)
3. `ValidationLogic` (library, linked to `GenericLogic`)
4. `LendingPool` (linked to `ReserveLogic` + `ValidationLogic`)
5. `LendingPoolAddressesProvider(marketId)` (self-contained)
6. `lendingPool.initialize(addressesProvider)`

This deploy order/pattern is what Phase 2's real deploy scripts
(`contracts/script/03-configure-reserves.ts` et al.) should follow, using
the full upgradeable-proxy flow
(`LendingPoolAddressesProvider.setLendingPoolImpl`) rather than calling
`initialize` directly on the implementation as the spike did.

## Why unmodified

`LendingPool`, `LendingPoolConfigurator`, `LendingPoolCollateralManager`,
`AToken`, `StableDebtToken`, `VariableDebtToken`,
`DefaultReserveInterestRateStrategy`, and the `ReserveLogic` /
`GenericLogic` / `ValidationLogic` libraries are deployed **as-is**.
Stratus-specific code lives entirely in `contracts/src/` and talks to this
pool through its public interfaces (`ILendingPool`, `IPriceOracleGetter`,
`IProtocolDataProvider`) — see `PLAN.md` §1.1–1.4 for why.

If a Hedera-specific incompatibility is later found forcing a local patch
(PLAN.md risk #4 — none found in the Phase 0 spike), patch it in
`contracts/lib/bonzo/contracts/` directly and record the diff against the
pinned commit above in this file, rather than silently drifting from
upstream.
