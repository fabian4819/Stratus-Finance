# Bonzo Finance fork — setup

This directory is where the forked `bonzo-finance-contracts` (Aave v2 fork)
lives, per `PLAN.md` §Phase 2. It is intentionally **not vendored into this
repo** — pull it in as a git submodule pinned to a specific commit, so the
exact upstream version is always reproducible.

```bash
# from repo root
git submodule add https://github.com/Bonzo-Labs/bonzo-finance-contracts.git contracts/lib/bonzo
cd contracts/lib/bonzo
git log -1 --oneline   # record this commit hash below
```

Record the pinned commit here once added:

- **Upstream repo:** https://github.com/Bonzo-Labs/bonzo-finance-contracts
- **Pinned commit:** _(fill in after `git submodule add`)_
- **Pinned date:** _(fill in)_

## Why pinned, not vendored-and-edited

Bonzo's contracts (`LendingPool`, `LendingPoolConfigurator`,
`LendingPoolCollateralManager`, `aToken`, `stableDebtToken`,
`variableDebtToken`, `DefaultReserveInterestRateStrategy`, and the
`ReserveLogic` / `GenericLogic` / `ValidationLogic` libraries) are deployed
**as-is**. Stratus-specific code lives entirely in `contracts/src/` and talks
to this pool through its public interfaces (`ILendingPool`,
`IPriceOracleGetter`) — see `PLAN.md` §1.1–1.4 for why.

If a Hedera-specific incompatibility forces a local patch (see `PLAN.md`
risk #4), fork upstream into `Bonzo-Labs/bonzo-finance-contracts` → your own
GitHub fork, apply the minimal patch there, and point the submodule URL at
your fork with the patch commit pinned — never hand-edit inside this
submodule directly, or the diff against upstream becomes untrackable.

## Environment note

Cloning this submodule requires reliable outbound git access to
`github.com` over HTTPS. In sandboxed / restricted-network environments,
prefer a shallow clone (`--depth 1`) and retry on failure — large clones
have been observed to fail silently (partial `.git` with a broken `HEAD`)
under network throttling rather than erroring cleanly.
