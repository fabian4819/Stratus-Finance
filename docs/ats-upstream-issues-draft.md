# ATS upstream issue drafts

Three drafts, ready to file against `hashgraph/asset-tokenization-studio`
once approved. Source material: `docs/ats-friction.md`. Each is written as
a standalone GitHub issue (title + body) — copy-paste into the "New
issue" form, or use `gh issue create -R hashgraph/asset-tokenization-studio
--title "..." --body-file <(cat <<'EOF' ... EOF)` from the repo root.

Repo: https://github.com/hashgraph/asset-tokenization-studio
Suggested labels (repo's actual label set not verified — adjust to
whatever exists): `documentation`, `sdk`.

---

## Draft 1

**Title:** `SDK's Network.connect has no headless/private-key signing option`

**Body:**

### Summary

`@hashgraph/asset-tokenization-sdk`'s `ConnectRequest.wallet` field only
accepts `SupportedWallets.{METAMASK, HWALLETCONNECT, DFNS, FIREBLOCKS, AWSKMS}`
(confirmed from the installed package's own `ConnectRequest.d.ts`, v8.0.0).
There doesn't appear to be a way to drive the SDK from a plain Node.js
script using a raw Hedera operator private key — every option needs
either a browser wallet extension, an interactive WalletConnect pairing,
or an enterprise custodial KMS account already set up.

### Why this is surprising

`packages/ats/sdk/__tests__/config.ts` in this repo constructs an
`Account` directly from a raw ECDSA `PrivateKey`:

```ts
export const CLIENT_PRIVATE_KEY_ECDSA = new PrivateKey({
  key: process.env.CLIENT_PRIVATE_KEY_ECDSA_1 ?? "",
  type: "ECDSA",
});
// ...
export const CLIENT_ACCOUNT_ECDSA: Account = new Account({
  id: CLIENT_ACCOUNT_ID_ECDSA,
  evmAddress: CLIENT_EVM_ADDRESS_ECDSA_1,
  privateKey: CLIENT_PRIVATE_KEY_ECDSA,
  publicKey: CLIENT_PUBLIC_KEY_ECDSA,
});
```

This pattern is clearly used internally by the SDK's own integration test
fixtures, but it isn't exposed as a supported `Network.connect` path for
consumers. For anyone building a deploy script, indexer, keeper bot, or
CI job that needs to issue/manage securities without a browser in the
loop, this is a dead end as far as the public SDK surface goes.

### Suggested fix (either would help)

1. **Document it explicitly** — a line in the SDK README's "Connect an
   account to the SDK" section stating that headless/backend usage isn't
   currently supported by the public API would have saved real
   integration time.
2. **Or expose the raw-key path** — since the underlying capability
   clearly exists (the test fixtures use it), surfacing it as a real
   `SupportedWallets` option (e.g. `SupportedWallets.PRIVATE_KEY` /
   `SupportedWallets.OPERATOR_KEY`) would let backend integrators use the
   SDK the way its own tests already do.

### What we did instead

Called the ATS diamond contracts directly via
`@hashgraph/asset-tokenization-contracts`'s shipped
`deployEquityFromFactory` helper and generated typechain types, driven by
a plain `ethers.Wallet`. Worked well, but required reading source to
discover — the SDK's advertised path didn't get us there. Full writeup:
https://github.com/fabian4819/Stratus-Finance/blob/main/docs/phase-0-findings.md

### Environment

- `@hashgraph/asset-tokenization-sdk` v8.0.0
- `@hashgraph/asset-tokenization-contracts` v8.0.0
- Node.js v22

---

## Draft 2

**Title:** `SDK README's Hedera testnet Resolver/Factory addresses are stale (point at a dead BLR deployment)`

**Body:**

### Summary

`packages/ats/sdk/README.md`'s "Initialise the SDK" section lists these
testnet coordinates:

- Resolver: `0.0.6797832`
- Factory: `0.0.6797955`

Both addresses have deployed bytecode, but **every call to them reverts**,
including simple view functions like `getLatestVersion` on the resolver.

### Root cause

`packages/ats/contracts/deployments/hedera-testnet/` in this same repo
shows the BusinessLogicResolver has been redeployed multiple times since:

```
newBlr-2026-01-29T16-49-02.json
newBlr-2026-02-05T12-21-16.json
newBlr-2026-04-16T14-20-25-080.json
newBlr-2026-05-19T16-49-31-449.json
newBlr-2026-06-12T11-19-42-198.json   <- current, as of this issue
```

The README's addresses point at an earlier, now-dead deployment — they
were never updated to track the redeployments recorded in the same repo's
`deployments/` directory.

### Suggested fix

The two sources of truth (README's example addresses, and
`deployments/hedera-testnet/*.json`) have drifted apart with no
mechanism keeping them in sync. Either:

1. Generate the README's testnet address snippet from the latest
   `deployments/hedera-testnet/` file at release/doc-build time, or
2. Replace the hardcoded addresses in the README with a short pointer —
   "see the latest file in `packages/ats/contracts/deployments/hedera-testnet/`
   for current testnet coordinates" — so it can't silently go stale again.

### Current live addresses (for reference, from the June 12 file)

- BLR proxy: `0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a`
- Factory proxy: `0xd1F118A40f3b02883D35909eF2517e7EDd78379d`

### What we did instead

Read `newBlr-2026-06-12T11-19-42-198.json` directly for the live
addresses. Full writeup: https://github.com/fabian4819/Stratus-Finance/blob/main/docs/phase-0-findings.md

### Environment

- Checked 2026-09-07/08, no newer `newBlr-*.json` exists as of this issue.

---

## Draft 3

**Title:** `Whitelist-mode security tokens block the issuer's own address from minting — undocumented`

**Body:**

### Summary

Deploying an Equity (or Bond) with `isWhiteList: true`, then immediately
calling `Security.issue` / the diamond's `mint()` to the admin/deployer
account that just created the token, reverts with
`AccountIsBlocked(address)`.

### Why this is surprising

In whitelist mode, *every* holder — including the issuer itself — must be
explicitly added via `addToControlList` before it can receive tokens.
This isn't mentioned in the SDK README's "Minting" or "Deploy a new
Equity" use-case sections, and it's an easy first-mint failure for anyone
following the docs literally: deploy an Equity, try to mint to yourself
to seed initial supply, get a cryptic custom-error revert with no
matching guidance in the docs.

We only found the cause by decoding the raw revert selector
(`AccountIsBlocked(address)`) against the contracts' own `error`
declarations in `packages/ats/contracts/contracts/infrastructure/errors/ICommonErrors.sol`.

### Suggested fix

Add a note to the "Minting" use-case section (and/or the "Deploy a new
Equity"/"Deploy a new Bond" sections) along the lines of: *"If the asset
was deployed with `isWhiteList: true`, the recipient — including the
issuer, if minting to itself — must first be added via
`Security.addToControlList` (requires the Control List Role)."*

### What we did instead

Called `addToControlList` for the admin address immediately after
deployment, before the first mint. Full writeup:
https://github.com/fabian4819/Stratus-Finance/blob/main/docs/phase-0-findings.md

### Environment

- `@hashgraph/asset-tokenization-contracts` v8.0.0
