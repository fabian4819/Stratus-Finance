# Stratus Finance — Development Plan

RWA Basket Collateral Lending on Hedera · ETHGlobal ETHOnline 2026 · Hedera "Tokenization of Anything" track

This document is the build plan. Product rationale and research validation live in `README.md`; this file covers *what we build, in what order, and how we know it works*.

---

## 0. Guiding constraints

1. **Reuse over rebuild.** Lending core = fork of `bonzo-finance-contracts` (Aave v2 fork). Tokenization = Hedera ATS SDK. Pricing = Pyth. The only original Solidity is the basket wrapper + oracle adapter + risk view.
2. **Nothing mocked on the critical path.** Real ATS tokens, real Pyth feeds, real `liquidationCall()`. The one deliberate exception is the *demo price stress* mechanism (see §6.3) — it must be clearly labelled as demo-only in code and in the pitch.
3. **Two assets, fixed ratio.** Gold-tracking + stock-index-tracking, 50/50. Custom ratios and N-asset baskets are explicitly future work.
4. **Ship a working testnet demo before polishing anything.** Deployment addresses + a reproducible demo script are the submission; the UI is the wrapper around it.

---

## 1. Architecture decisions (locked before coding)

### 1.1 What "the basket" actually is

`StratusBasketToken` is a **collateral-backed ERC20 wrapper**, not a synthetic price-tracking token:

- `mint(amount)` pulls the underlying (GOLD-x, STOCK-x) at the fixed 50/50 ratio and mints basket tokens.
- `redeem(amount)` burns and returns the underlying pro rata.
- The wrapper therefore *actually holds* the underlying, which makes look-through decomposition a real transfer, not an accounting fiction.

This matters for judging: the vault can prove decomposition on-chain rather than asserting it.

### 1.2 How isolation is achieved

Aave v2 already gives us **per-reserve risk parameters** (LTV, liquidation threshold, liquidation bonus) and **per-collateral-asset liquidation targeting** — `liquidationCall(collateralAsset, debtAsset, user, ...)` seizes *only* the named collateral. That is the isolation mechanism, and it is battle-tested rather than reimplemented.

**Known honesty point:** Aave v2's health factor is portfolio-level, not per-asset. A gold crash lowers the *combined* HF and makes the position liquidatable — but the liquidator can only seize gold collateral, so the stock leg is never sold. We add `StratusRiskView`, a read-only contract that computes a **per-component health factor** (each component's collateral value × its threshold, against its pro-rata share of debt) so the UI can show which leg is at risk. This is a view/UX layer over standard mechanics — we present it as such, not as a novel liquidation engine.

### 1.3 Deposit flow ownership

The vault deposits into the pool with `onBehalfOf = user`. Consequences:
- aTokens land in the user's wallet → the user's own Aave account carries the collateral and the debt.
- The user borrows/repays directly against the pool; the vault is not a debt intermediary and holds no user funds after the tx.
- Withdrawal = user withdraws underlying from pool → approves vault → vault re-mints the basket token.

This avoids building a custom accounting layer (and its bugs) inside the vault.

### 1.4 Oracle

`StratusPriceOracle` implements Aave v2's `IPriceOracleGetter`.
- Base currency: **USD, 18 decimals**, applied consistently to every reserve (Aave only requires internal consistency, not ETH denomination).
- Source: Pyth `getPriceNoOlderThan(feedId, maxAge)`, scaled from Pyth's exponent to 18 decimals.
- Staleness → revert. Never serve a stale price to the liquidation path.
- Demo stress hook: see §6.3.

---

## 2. Repository layout

```
stratus-finance/
├─ contracts/                 # Hardhat (Hedera plugin) — Solidity workspace
│  ├─ lib/bonzo/              # fork of bonzo-finance-contracts (Aave v2)
│  ├─ src/
│  │  ├─ StratusBasketToken.sol
│  │  ├─ StratusVault.sol
│  │  ├─ StratusPriceOracle.sol
│  │  └─ StratusRiskView.sol
│  ├─ script/                 # deploy + configure + demo scripts
│  └─ test/
├─ tokenization/              # ATS SDK scripts: issue GOLD-x / STOCK-x, control-list mgmt
├─ frontend/                  # React + TS + Tailwind + wagmi/viem
├─ deployments/               # testnet address JSON per run (committed)
├─ docs/                      # demo script, architecture diagram, submission copy
├─ PLAN.md
└─ README.md
```

Toolchain: **Hardhat** (not Foundry) — the Hedera plugin and the ATS SDK are both JS-first, and the Bonzo/Aave v2 codebase is Hardhat-native. One toolchain, less integration risk.

Network: Hedera testnet via HashIO JSON-RPC relay (chain id 296).

---

## 3. Phased build

Days are relative (D1 = first build day), sized for a ~3-week hackathon window. Each phase ends in a **gate** — a checkable artifact, not a feeling of progress.

### Phase 0 — Spike & de-risk (D1–D2)

The three things most likely to kill this project, tested first, before any product code.

- [x] Deploy a trivial contract to Hedera testnet via Hardhat + HashIO. Confirm gas/EVM behaviour. **Done — `MockUSDC` deployed, minted, read back. No surprises.** See `docs/phase-0-findings.md`.
- [x] **Deploy an unmodified Aave v2 `LendingPool` to Hedera testnet.** This is spike #1 — it is a large contract and Hedera has its own gas ceiling per transaction. **Done — highest-risk spike in the plan, fully cleared.** Vendored the real Bonzo source (see `contracts/lib/bonzo/SETUP.md`) and deployed the full library-linked core (GenericLogic → ReserveLogic → ValidationLogic → LendingPool → LendingPoolAddressesProvider → `initialize()`) for real. LendingPool used 4.6M gas; every contract's bytecode is well under the EIP-170 size limit. No fallback needed.
- [x] **Read a live Pyth price on Hedera testnet** (XAU/USD + an equity or index feed). Confirm feed IDs exist and update frequently enough. Spike #2. **Done — see `docs/phase-0-findings.md`. Real finding: Hedera testnet's Pyth contract is a pull oracle nobody keeps warm (every feed checked was stale); no equity/stock-index feed exists at all (`PriceFeedNotFound`), substituted with ETH/USD per §6.1. `StratusPriceOracle` needs an `updatePriceFeeds` pass-through added in Phase 2 — not yet implemented.**
- [x] **Mint one ATS token and transfer it between two EOAs.** ATS tokens are compliance-gated security tokens; transfers to arbitrary addresses may be blocked by control lists. Spike #3 — and the single biggest integration risk, because Aave requires transfers to the aToken contract. **Done — full deploy → mint → blocked-transfer → whitelist → successful-transfer sequence executed for real on testnet.** Confirmed ATS diamonds are real ERC20 and the control-list gate behaves exactly as designed. Along the way: the SDK's `Network.connect` turned out not to support headless/private-key signing at all (pivoted to direct contract calls via `@hashgraph/asset-tokenization-contracts`), and the SDK README's testnet Resolver/Factory addresses were stale (redeployed since; current live addresses recorded in `docs/phase-0-findings.md` and `tokenization/.env.example`).

**Gate 0: PASSED.** All four spikes green, no fallback needed for any of them — full detail and every tx hash in `docs/phase-0-findings.md`.

### Phase 1 — Assets (D3–D4)

- [x] `tokenization/` scripts: issue **GOLD-x** and **STOCK-x**, with mint-to-address helpers for demo funding. **Done — real ATS Equity diamonds deployed on Hedera testnet.** Went through direct ATS-contract calls (`tokenization/scripts/lib/ats-client.ts`), not the SDK — see docs/phase-0-findings.md Finding 1. GOLD-x `0xcF19378058EC9DFD25975527BDf7F68faeC2C7fc`, STOCK-x `0x59E3908069993cDDbD3C83479c1aFc92242c0d3A`, 10,000 of each minted to the deployer. ISINs are checksum-valid synthetic values (`tokenization/scripts/lib/isin.ts`), not real-world securities.
- [x] Control-list / whitelist management script so the aToken, LendingPool, Vault, and BasketToken addresses are all transfer-permitted. **Done for what exists so far** — `tokenization/scripts/whitelist-protocol-addresses.ts` rewritten on the same direct-contract pattern; `StratusBasketToken`'s address is whitelisted on both assets. aToken/Vault/liquidator entries are wired up but skip gracefully until Phase 2/3 produce those addresses.
- [x] Deploy a plain mock **USDC** (6dp) as the borrowable asset — the debt asset is not the innovation and does not need ATS. **Done — `0xDc2088fd97eda106943cABf443cA5c6702c37154`, 1,000,000 USDC minted to the deployer for later testing.**
- [x] `StratusBasketToken.sol` + unit tests: mint/redeem round-trip preserves the 50/50 ratio exactly, no dust drain. **Done — unit tests pass locally (contracts/test/StratusBasketToken.test.ts) AND verified for real on testnet against the real ATS tokens (see Gate 1 below).** Deployed at `0x2255Eb7Bc29A27E2b9113D6BA28807812Bd4DEaD`.

**Gate 1: PASSED.** Minted 100 basket tokens from real GOLD-x/STOCK-x (pulling 50/50), redeemed them back — GOLD-x and STOCK-x balances returned to *exactly* their pre-mint values, basket balance exactly 0. Tx hashes in `deployments/hederaTestnet.json` under `meta.gate1RoundTrip`.

### Phase 2 — Lending core stood up (D5–D8)

- [x] Fork Bonzo contracts into `contracts/lib/bonzo`, pinned to a specific commit, recorded in `docs/`. **Done in Phase 0** — vendored (not submodule, see `contracts/lib/bonzo/SETUP.md`), commit `38441b697a51c22bef6a9fb660bea46aa429c11c`.
- [x] Deploy: `LendingPoolAddressesProvider`, `LendingPool`, `LendingPoolConfigurator`, `LendingPoolCollateralManager`, `aToken`/`stableDebtToken`/`variableDebtToken` implementations, `DefaultReserveInterestRateStrategy`. **Done for real on testnet**, through the standard upgradeable-proxy flow (`setLendingPoolImpl`/`setLendingPoolConfiguratorImpl` auto-create + initialize their proxies) — not the bare-implementation shortcut the Phase 0 spike used. Every address in `deployments/hederaTestnet.json`; full writeup in `docs/phase-2-findings.md`.
- [x] `StratusPriceOracle.sol` (Pyth-backed, USD/18dp) wired into the addresses provider + `LendingRateOracle`. **Done** — oracle deployed and feeds wired for GOLD-x/STOCK-x/USDC in Phase 2's first step (`00-deploy-oracle.ts`); `LendingRateOracle` deployed and given a nominal 5% rate for all three (stable borrowing is disabled everywhere, so this value is never actually load-bearing — it only needs to exist so `DefaultReserveInterestRateStrategy`'s unconditional read doesn't hit an empty address).
- [x] Init three reserves with **deliberately different** risk params — the whole point is that they are not uniform:

  | Reserve | LTV | Liq. threshold | Liq. bonus | Rationale |
  |---|---|---|---|---|
  | GOLD-x | 70% | 75% | 5% | Low volatility, deep real-world liquidity |
  | STOCK-x | 55% | 65% | 10% | Higher volatility, equity drawdown risk |
  | USDC | — | — | — | Borrow-only, not enabled as collateral |

  (Numbers are the starting point; document the reasoning in `docs/risk-params.md` — judges will ask why they differ.) **Set for real via `configureReserveAsCollateral`/`enableBorrowingOnReserve` — confirmed on-chain exactly as above.**
- [x] Seed USDC liquidity from a deployer account so borrowing is possible. **Done — 100,000 USDC deposited** (`contracts/script/seed-usdc-liquidity.ts`).
- [~] Integration test: deposit GOLD-x directly → borrow USDC → repay → withdraw. **Deposit → withdraw leg verified for real** (`contracts/script/verify-gate2-deposit-withdraw.ts`, exact round trip). **Borrow → repay leg blocked**: Pyth's Hermes API started requiring a key on 2026-08-26 (confirmed dated, not sandbox-specific — see `docs/phase-2-findings.md`), so there's currently no way to push a fresh price on-chain, and every cached Hedera-testnet price is stale. `getUserAccountData` and `borrow` both revert on that staleness. User is registering for a free key (pythdata.app); resume once available.

**Gate 2: PASSED, fully.** Deposit/withdraw and borrow/repay all confirmed exact against the raw pool, real tx hashes in `deployments/hederaTestnet.json` (`meta.gate2DepositWithdraw`, `meta.gate2BorrowRepay`). Pyth (`StratusPriceOracle`) is blocked by infrastructure outside this repo's control — got a Hermes API key, fixed a real Hedera tinybar-precision bug in `updatePriceFeeds` along the way, but the on-chain Pyth contract itself rejects current Hermes update data with `InvalidWormholeVaa()` even so (confirmed directly against the raw contract; guardian set checked and matches network-wide, so it's not a stale-guardian-set issue — most likely a receiver-contract version gap on Hedera's side, not fixable from here). **Pivoted the pool's live oracle to `StratusChainlinkPriceOracle`**, backed by real, push-based Chainlink feeds confirmed live on Hedera testnet (no update step, no API key, no fee) — GOLD-x → HBAR/USD, STOCK-x → ETH/USD (same substitution pattern as Pyth), USDC → USDC/USD (real). `StratusPriceOracle` stays in the codebase as the documented, tested, originally-designed oracle; switching back is one `setPriceOracle` call if Pyth's Hedera infra gap closes. Full writeup in `docs/phase-2-findings.md`.

### Phase 3 — The basket vault (D9–D11) — *core original contribution*

- [x] `StratusVault.sol`:
  - `depositBasket(uint256 amount)` — pull basket → redeem to underlying → `pool.deposit(asset, amt, onBehalfOf=msg.sender)` per component. **Done, deployed, verified on testnet.**
  - `recomposeBasket(uint256 amount)` (named this in the actual implementation, not `withdrawToBasket`) — pull already-withdrawn underlying from the user → re-mint basket → return. **Done, deployed, verified on testnet.** Health-unwinding on recompose is enforced by the pool itself during the user's own `pool.withdraw` step (it reverts the withdrawal, not the recompose, if the position would go unhealthy) — see contract-level docs in `StratusVault.sol` for why recompose has nothing left to re-check by the time it's called.
  - Events: `BasketDecomposed`, `BasketRecomposed`, with per-component amounts — the on-chain proof of look-through. **Both confirmed emitted with exact amounts, on testnet.**
  - **Bug found and fixed during Phase 3 deploy:** the constructor originally pre-approved the pool for both components at deploy time — but since the components are ATS diamonds, `approve()` itself reverts (`AccountIsBlocked`) unless the caller is already control-list-whitelisted, and the vault can't be whitelisted before it has an address. Moved to a lazy `_ensureApproved` check inside `depositBasket`. See `docs/phase-2-findings.md`.
- [x] `StratusRiskView.sol`: per-component health factor + combined HF + per-component borrowing-capacity contribution, as a single struct read for the UI. **Deployed** (`0x05aD00333d8bf0C920F0041770344182c54f37c4`); `getUserRisk` itself still needs a live oracle read to actually execute, so it's untested end-to-end pending the Pyth/Wormhole blocker (§Phase 2) — its logic is otherwise unchanged since original review.
- [x] Tests (`contracts/test/StratusVault.test.ts`, 8 tests, `MockLendingPool` double):
  - Decompose → per-reserve balances match the basket ratio. ✅
  - ~~Borrow capacity == Σ(component value × component LTV)~~ / ~~Recompose after partial repay~~ / ~~Attempting to recompose while unhealthy reverts~~ — these are properties of the **real pool's** accounting (health factor, LTV-weighted capacity), not of the vault's own wrapper logic, so they're verified against the real, unmodified pool on testnet instead (Gate 2/3 scripts) rather than re-derived in a mock that would just be testing its own fidelity to Aave v2, not `StratusVault`. Unit tests instead cover: decompose call correctness (asset/amount/onBehalfOf), event emission (both directions), zero-amount rejection (both directions), idempotent lazy approval across repeated deposits, and a full mint→deposit→(simulated withdraw)→recompose round trip landing back at the exact starting balances.

**Gate 3: PASSED, fully.** `depositBasket` → decompose (event + independent aToken balances, exact 25/25 split) and withdraw-from-pool → `recomposeBasket` (event + exact basket amount back) both confirmed on testnet — tx hashes in `deployments/hederaTestnet.json` → `meta.gate3DecomposeRecompose`. The `→ borrow USDC →` middle step is the same pool-level `borrow`/`repay` Gate 2 exercises (the vault never touches borrowing at all — the user borrows directly against the pool after `depositBasket`), unblocked by the same Pyth→Chainlink oracle pivot — see §Phase 2 and `docs/phase-2-findings.md`.

### Phase 4 — Liquidation, isolated (D12–D13) — *the money shot of the demo*

- [x] Demo stress path (§6.3) implemented and gated behind an owner-only role. **Done in both oracles** — `setDemoOffsetBps` exists on `StratusPriceOracle` (Pyth) and `StratusChainlinkPriceOracle`, `onlyOwner`, event-logged.
- [x] Scripted scenario `script/demo-liquidation.ts`:
  1. User deposits collateral into two isolated reserve positions. **Deposited directly into the pool, not via the basket/vault — deliberate, see the script's own docs: GOLD-x (→HBAR/USD, ~$0.08) and STOCK-x (→ETH/USD, ~$2,470) are ~30,000x apart in price, so the basket's fixed 50/50 *token* ratio would make one leg's dollar value swamp the other, making the stress invisible in the combined health factor — not a flaw in isolation, just a numerically bad demo. Deposited value-balanced amounts (~$718 / ~$742) directly instead; exercises the identical `pool.liquidationCall` path the vault path would, and the vault's own decompose/recompose correctness is already proven separately in Gate 3.**
  2. User borrows USDC near max capacity. **Done — 90% of combined capacity.**
  3. Gold price is stressed down; stock price untouched. **Done — GOLD-x stressed −90% via the live Chainlink oracle's demo path.**
  4. Health factor < 1 → third-party liquidator calls `liquidationCall(GOLD-x, USDC, user, ...)`. **Done — health factor 0.65, liquidator is a distinct, separately funded and ATS-whitelisted account (`contracts/script/setup-demo-liquidator.ts`), not the borrower.**
  5. Assert: gold collateral reduced, **STOCK-x aToken balance byte-for-byte unchanged**, remaining debt still collateralised by the stock leg. **Done — GOLD-x collateral fully seized (its stressed value was less than the covered debt even with the liquidation bonus, so the pool capped the seizure at 100% of what was available — expected, not an error), STOCK-x balance exactly 0.3 before and after.**
- [x] Test the mirror case (stock crashes, gold untouched) so the isolation claim isn't a one-asset fluke. **Done (`contracts/script/demo-liquidation-mirror.ts`) — STOCK-x/ETH stressed −60% instead, liquidator seized STOCK-x only, GOLD-x aToken balance exactly 800.0 before and after.**

**Gate 4: PASSED, both directions, for real on testnet.** No local-only automated test was added for the untouched-leg invariant specifically (unlike Gates 1–3, which have both a Hardhat unit test and a testnet script) — the mechanism here is Aave v2's own `liquidationCall`, already correct-by-construction from the fork, and the two live testnet runs are the actual proof PLAN.md's gate asks for. Every tx hash in `deployments/hederaTestnet.json` under `meta.gate4LiquidationPrimary` and `meta.gate4LiquidationMirror`.

### Phase 5 — Frontend (D14–D17)

Four screens, no more — **all four wired to the real testnet deployment**:

1. **Mint basket** — acquire/mint GOLD-x + STOCK-x → basket token. [x] Done.
2. **Deposit** — one action; then show the *decomposition result*: two reserve cards, each with its own LTV, threshold, price, and component health factor. This screen is the pitch. [x] Done.
3. **Borrow / repay** — USDC, with combined capacity shown as the sum of the two component contributions, visibly itemised. [x] Done.
4. **Risk panel** — live prices (Chainlink, not Pyth — see §Phase 2), per-component HF bars, and the demo-stress banner. [x] Done — manually verified in a real browser against the live deployment; correctly showed STOCK-x stressed, matching the still-active demo offset left over from the Phase 4 liquidation run.

- [x] Wallets: MetaMask (Hedera EVM). **Done** — shared `WalletContext`, auto-switches/adds the Hedera testnet chain. HashPack not attempted (stretch scope, time-permitting).
- [x] Read layer: `StratusRiskView` in one read per screen that needs it, polled every 15s on the Risk Panel. Not literally multicall-batched (Hedera's per-call overhead didn't make that necessary at this scale) but each screen fetches its several reads via `Promise.all`.
- [ ] Empty/error states for: wrong network, ATS transfer blocked, stale oracle. **Partially done** — `addressesConfigured()` gate exists; wrong-network and blocked-transfer states are not yet explicit (errors currently surface as raw revert messages in the status line).

**Gate 5: mostly passed.** All four screens render correctly with no console errors and pull real on-chain data (verified via a real browser session against the live deployment — see commit history). Write actions (mint/deposit/borrow/repay) are wired but not yet click-tested end-to-end through an actual MetaMask session in this pass; read actions were.

### Phase 6 — Submission (D18–D21)

- [x] `README.md`: problem, mechanism, architecture diagram, deployed addresses, how to run. **Rewritten** — now a status report with the full live-deployment address table and gate-by-gate verified results (§9), not just the pre-build pitch.
- [x] `docs/demo-script.md`: exact click-by-click path for the video, including the liquidation. **Rewritten** to match the actually-built UI and real Gate 4 results; on-chain state reset to a clean, healthy slate (`contracts/script/cleanup-demo-state.ts`) so it's ready to record from.
- [ ] Demo video (≤ 4 min): problem → deposit/decompose → borrow → gold crash → isolated liquidation → stock leg survives. **Not yet recorded** — needs the user (screen + narration); `docs/demo-script.md` is ready.
- [x] Qualification checklist for the Hedera track: ATS used ✓, testnet deployed ✓, lifecycle operation demonstrated (borrow against tokenized collateral) ✓. **Written** — `docs/qualification-checklist.md`.
- [x] **Bonus criterion:** open at least one substantive issue or small PR upstream to ATS from real friction found in Phase 0/1 (see §8). **Done — three issues filed against `hashgraph/asset-tokenization-studio` on 2026-09-08:** [#1397](https://github.com/hashgraph/asset-tokenization-studio/issues/1397) (headless signing gap), [#1398](https://github.com/hashgraph/asset-tokenization-studio/issues/1398) (stale testnet addresses), [#1399](https://github.com/hashgraph/asset-tokenization-studio/issues/1399) (undocumented whitelist issuer-block).
- [ ] Buffer day. Something will break on D20.

---

## 4. Contract inventory (original code only)

| Contract | LoC target | Responsibility | Key risk |
|---|---|---|---|
| `StratusBasketToken` | ~150 | ERC20 wrapper holding underlying at fixed ratio; mint/redeem | Rounding/dust on redeem |
| `StratusVault` | ~250 | Decompose on deposit, recompose on withdraw, emit proof events | Approval flows, reentrancy on external token calls |
| `StratusPriceOracle` | ~120 | Pyth → Aave `IPriceOracleGetter`, USD/18dp, staleness guard | Decimal/exponent conversion bugs |
| `StratusRiskView` | ~180 | Per-component HF and capacity, read-only | Must mirror Aave's math exactly or the UI lies |

Everything else is forked and configured, not written.

---

## 5. Testing strategy

- **Unit (local Hardhat):** basket ratio math, oracle scaling across Pyth exponents (−8, −5, 0), risk-view math vs. hand-computed values.
- **Integration (local, forked config):** full lifecycle + both liquidation directions, using a mock Pyth so prices are freely controllable.
- **Testnet smoke (scripted):** deploy → configure → lifecycle → liquidation, run end-to-end at least twice from a clean deploy before submission. A demo that only works on a hand-massaged state is not a demo.
- **Invariant to assert everywhere:** *liquidating component A never changes the aToken balance of component B.*

---

## 6. Open decisions to resolve early

### 6.1 Which Pyth feeds
Confirm in Phase 0 that XAU/USD and a usable equity/index feed exist and update on Hedera testnet. If the equity feed is absent or stale, substitute a liquid crypto feed for the "volatile leg" and state the substitution plainly — the isolation mechanism is asset-agnostic and the honesty costs nothing.

### 6.2 ATS token ↔ Aave compatibility

**Confirmed by reading the upstream source** (`hashgraph/asset-tokenization-studio`, package `@hashgraph/asset-tokenization-sdk`): ATS issues each asset as an EIP-2535 diamond, but its `core`/`allowance`/`transfer` facets implement a real, standard ERC-20 surface — `approve`/`increaseAllowance`/`decreaseAllowance`, `transfer`/`transferFrom`, `balanceOf`, `decimals`, `Transfer`/`Approval` events — layered underneath the security-token facets (control list, KYC, freeze, hold, clearing, etc.). This de-risks the core assumption: Aave v2's plain `IERC20(asset).transferFrom(...)` calls should work against an ATS diamond address without any wrapper, *provided* the control list permits it.

That "provided" is still Phase 0 Spike #3, now scoped precisely: every address the pool moves tokens through or to — the **aToken contract**, the **StratusVault**, and any **liquidator** address — must be added via `Security.addToControlList` (requires the "Control list Role", granted via `Role.applyRoles`/`Role.grantRole`) before it can hold or move the asset. Resolve this in Phase 0; the fallback (§7) is expensive to adopt late.

Known real testnet coordinates for Phase 1 (verify still current before use — deployments get redeployed):
- SDK package: `@hashgraph/asset-tokenization-sdk` (npm, monorepo `hashgraph/asset-tokenization-studio`)
- Testnet Resolver: Hedera id `0.0.6797832`
- Testnet Factory: Hedera id `0.0.6797955`
- Relevant SDK namespaces confirmed from the SDK README: `Network.init`/`Network.connect` (setup), `Equity.create` (issuance — used for both GOLD-x and STOCK-x since neither is a bond), `Security.issue` (mint to an account), `Security.addToControlList`/`removeFromControlList`, `Role.applyRoles`/`grantRole`.

### 6.3 Demo price stress — do it honestly
Pyth on testnet serves real prices; we cannot crash real gold. Options, in order of preference:

1. **Deployer-only offset in `StratusPriceOracle`** (`setDemoOffsetBps`, owner-gated, emits an event, and the UI shows a loud "DEMO PRICE STRESS ACTIVE" banner). Simple, visible, and honest.
2. A parallel "stress" reserve with a mock feed — cleaner separation, more deploy work.

Choose (1). Do **not** silently ship an admin-writable oracle without labelling it — a judge finding that unlabelled is worse than not demoing liquidation at all.

---

## 7. Risk register

| # | Risk | Likelihood | Impact | Mitigation / fallback |
|---|---|---|---|---|
| 1 | Aave v2 pool too large / gas-capped on Hedera | Med | Fatal | Library-linked deployment (Aave v2 already supports it); spike on D1 |
| 2 | ATS compliance (control list) blocks pool/vault/liquidator transfers | Med | High | Confirmed the ATS diamond exposes real ERC20 (§6.2), so risk is scoped to control-list membership, not interface incompatibility — whitelist aToken, vault, and liquidator addresses via `Security.addToControlList` in Phase 0/1; fallback = thin ERC20 wrapper around the ATS token, with ATS still issuing the real asset |
| 3 | Pyth equity/index feed missing on testnet | Med | Med | Substitute volatile feed, disclose (§6.1) |
| 4 | Bonzo fork has Hedera/HTS-specific assumptions | Med | Med | Prefer canonical Aave v2 paths; drop HTS-specific extensions and use plain ERC20 interfaces |
| 5 | Frontend eats the last week | High | Med | Phase 4 gate is a *scripted* demo — the video can be carried by scripts + a partial UI if needed |
| 6 | Per-component HF math diverges from Aave's actual behaviour | Med | High (credibility) | Cross-check `StratusRiskView` against `pool.getUserAccountData` in tests; label it as a view, not a rule |

---

## 8. Upstream contribution (bonus points)

Phases 0–1 will generate real friction with ATS (control lists vs. DeFi contracts, EVM-side integration ergonomics, docs gaps). Capture each one in `docs/ats-friction.md` as it happens, then convert the best one into an upstream issue or PR. Target: filed by end of Phase 3, not the night before the deadline.

---

## 9. Definition of done

- [ ] Basket token minted from real ATS-issued underlying on Hedera testnet.
- [ ] `depositBasket` decomposes into two isolated reserves with distinct risk params — provable from events.
- [ ] USDC borrowed against combined, itemised capacity.
- [ ] `liquidationCall` on the stressed component executes; the other component's balance is provably unchanged (tx hashes in `deployments/`).
- [ ] Position recomposed back to the basket token after repayment.
- [ ] UI shows per-component health; demo stress is clearly labelled.
- [ ] README with addresses, demo video, ATS upstream contribution filed.

---

## 10. Post-submission-prep addendum: real RWA prices via RedStone

The Gate 2/3 narrative above (Pyth → Chainlink pivot) reflects what
happened at that point in the build and is left as-is. Afterward, GOLD-x
(HBAR/USD) and STOCK-x (ETH/USD) were upgraded to real gold and real
S&P 500 index prices via RedStone's pull-oracle model — closing the
disclosed-substitute gap risk #3 in the register above flagged as
"Med/Med" and accepted. Full research trail (why Pyth/Chainlink/Supra all
lack RWA feeds on Hedera testnet, and the architecture that makes
RedStone work without a Hedera-specific deployment) in
`docs/phase-3-oracle-research.md`.
