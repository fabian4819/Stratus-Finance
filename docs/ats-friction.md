# ATS integration friction log

Running log of friction encountered integrating `@hashgraph/asset-tokenization-sdk`
/ `hashgraph/asset-tokenization-studio`, kept as it happens during Phase 0–3.
The best entry here becomes the upstream issue/PR referenced in PLAN.md §8
(bonus criterion: "Contributions back upstream to ATS"). File it by end of
Phase 3, not the night before the deadline.

Format per entry: what we tried, what happened, what upstream could do
better, and whether we filed anything.

---

## Research-stage findings (pre-Phase-0), not yet friction

These aren't problems, just things confirmed by reading source that weren't
obvious from the README alone — recorded here so Phase 0/1 doesn't
re-derive them:

- The SDK's own README (`packages/ats/sdk/README.md`) doesn't show a code
  sample for the "Deploy a new Equity" use case beyond "Use the
  `Equity.Create` method" — the actual parameter object shape had to be
  cross-referenced from the `Bond.create` / `Equity.create` **Input Ports**
  sections above it. A worked TypeScript example in the use-cases section
  would have saved real time; consider this the first upstream docs PR
  candidate.
- ATS assets are EIP-2535 diamonds, not single contracts — confirmed via
  `packages/ats/contracts/contracts/facets/`. The `core`, `allowance`, and
  `transfer` facets do implement a standard ERC-20 surface (`approve`,
  `transferFrom`, `balanceOf`, `Transfer`/`Approval` events), so plain
  `IERC20` calls from Aave v2 should work — this was not obvious from the
  SDK README, which documents the SDK-mediated flows (`Security.issue`,
  `Security.transfer`) far more prominently than the underlying ERC-20
  compatibility. See PLAN.md §6.2.

## Entries

### 2026-09-07 — `Network.connect` has no headless/private-key mode

**Tried:** Build `tokenization/scripts/issue-assets.ts` against the SDK's
documented `Network.init`/`Network.connect` flow, driven by a plain Hedera
operator account (id + ECDSA private key) for unattended script use — no
browser available.

**Result:** `ConnectRequest`'s `wallet` field only accepts
`SupportedWallets.{METAMASK, HWALLETCONNECT, DFNS, FIREBLOCKS, AWSKMS}` —
confirmed from the installed package's own type declarations
(`ConnectRequest.d.ts`). METAMASK needs `window.ethereum` (no browser in a
script); WalletConnect needs an interactive pairing; DFNS/Fireblocks/AWSKMS
are enterprise custodial services requiring their own account setup. There
is no "just sign with this private key" option, despite `packages/ats/sdk/__tests__/config.ts`
constructing an `Account` directly from a raw ECDSA `PrivateKey` — that
pattern is used internally by the SDK's own test fixtures but isn't
exposed as a supported `Network.connect` path.

**Upstream gap:** either document that headless/backend usage isn't
supported by the public SDK surface (so integrators don't lose time
discovering this the way we did), or expose the same
raw-key-signing path the SDK's own integration tests use as a real
`SupportedWallets` option (e.g. `SupportedWallets.PRIVATE_KEY` or similar).

**Filed:** not yet — candidate for the upstream contribution in PLAN.md §8.

**What we did instead:** called the ATS diamond contracts directly via
`@hashgraph/asset-tokenization-contracts`'s shipped `deployEquityFromFactory`
helper and typechain types, driven by a plain `ethers.Wallet`. Fully
documented in `docs/phase-0-findings.md`.

### 2026-09-07 — SDK README's testnet Factory/Resolver addresses are stale

**Tried:** Use the Resolver (`0.0.6797832`) / Factory (`0.0.6797955`)
Hedera ids from `packages/ats/sdk/README.md`'s "Initialise the SDK"
section.

**Result:** both addresses have bytecode but revert on every call,
including simple view functions like `getLatestVersion`. Cross-checked
against `packages/ats/contracts/deployments/hedera-testnet/` in the same
repo, which shows the BusinessLogicResolver has been redeployed multiple
times (most recently 2026-06-12) — the README addresses point at an
earlier, now-dead deployment.

**Upstream gap:** the SDK README's example addresses have no visible
"last verified" date and aren't generated from the same source as
`deployments/hedera-testnet/`, so they silently drift out of sync with
reality. Either link the README's example directly to the latest file in
`deployments/hedera-testnet/`, or add a short "how to find the current
testnet addresses" note pointing there.

**Filed:** not yet — candidate for the upstream contribution in PLAN.md §8.

**What we did instead:** read `packages/ats/contracts/deployments/hedera-testnet/newBlr-2026-06-12T11-19-42-198.json`
directly for the live addresses (now in `tokenization/.env.example`).

### 2026-09-07 — whitelist mode blocks the issuer's own address, undocumented

**Tried:** Deploy an Equity with `isWhiteList: true`, then immediately
`Security.issue`/`mint` to the admin/deployer account that just created
the token.

**Result:** reverts with `AccountIsBlocked(address)`. In whitelist mode,
*every* holder — including the issuer itself — must be explicitly added
via `addToControlList` before it can receive tokens. Not mentioned in the
README's "Minting" or "Deploy a new Equity" use-case sections; found only
by decoding the raw revert selector against the contracts' own `error`
declarations.

**Upstream gap:** the "Minting" use-case section
(`packages/ats/sdk/README.md`) should note the whitelist-mode
prerequisite, since it's an easy first-mint failure for anyone following
the docs literally.

**Filed:** not yet — candidate for the upstream contribution in PLAN.md §8.

Template:

```
### YYYY-MM-DD — <short title>

**Tried:** ...
**Result:** ...
**Upstream gap:** ...
**Filed:** <issue/PR link, or "not yet">
```
