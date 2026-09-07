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

- [ ] Deploy a trivial contract to Hedera testnet via Hardhat + HashIO. Confirm gas/EVM behaviour.
- [ ] **Deploy an unmodified Aave v2 `LendingPool` to Hedera testnet.** This is spike #1 — it is a large contract and Hedera has its own gas ceiling per transaction. If it fails, we need the libraries-as-external-links deployment path (Aave v2 already splits `ReserveLogic`/`GenericLogic`/`ValidationLogic` into linked libraries — use them).
- [ ] **Read a live Pyth price on Hedera testnet** (XAU/USD + an equity or index feed). Confirm feed IDs exist and update frequently enough. Spike #2.
- [ ] **Mint one ATS token and transfer it between two EOAs.** ATS tokens are compliance-gated security tokens; transfers to arbitrary addresses may be blocked by control lists. Spike #3 — and the single biggest integration risk, because Aave requires transfers to the aToken contract.

**Gate 0:** all three spikes green, or a documented fallback chosen (see §7).

### Phase 1 — Assets (D3–D4)

- [ ] `tokenization/` scripts: issue **GOLD-x** and **STOCK-x** via ATS SDK, with mint-to-address helpers for demo funding.
- [ ] Control-list / whitelist management script so the aToken, LendingPool, Vault, and BasketToken addresses are all transfer-permitted.
- [ ] Deploy a plain mock **USDC** (6dp) as the borrowable asset — the debt asset is not the innovation and does not need ATS.
- [ ] `StratusBasketToken.sol` + unit tests: mint/redeem round-trip preserves the 50/50 ratio exactly, no dust drain.

**Gate 1:** a wallet holds basket tokens minted from real ATS underlying, and can redeem back to the exact underlying amounts.

### Phase 2 — Lending core stood up (D5–D8)

- [ ] Fork Bonzo contracts into `contracts/lib/bonzo`, pinned to a specific commit, recorded in `docs/`.
- [ ] Deploy: `LendingPoolAddressesProvider`, `LendingPool`, `LendingPoolConfigurator`, `LendingPoolCollateralManager`, `aToken`/`stableDebtToken`/`variableDebtToken` implementations, `DefaultReserveInterestRateStrategy`.
- [ ] `StratusPriceOracle.sol` (Pyth-backed, USD/18dp) wired into the addresses provider + `LendingRateOracle`.
- [ ] Init three reserves with **deliberately different** risk params — the whole point is that they are not uniform:

  | Reserve | LTV | Liq. threshold | Liq. bonus | Rationale |
  |---|---|---|---|---|
  | GOLD-x | 70% | 75% | 5% | Low volatility, deep real-world liquidity |
  | STOCK-x | 55% | 65% | 10% | Higher volatility, equity drawdown risk |
  | USDC | — | — | — | Borrow-only, not enabled as collateral |

  (Numbers are the starting point; document the reasoning in `docs/risk-params.md` — judges will ask why they differ.)
- [ ] Seed USDC liquidity from a deployer account so borrowing is possible.
- [ ] Integration test: deposit GOLD-x directly → borrow USDC → repay → withdraw.

**Gate 2:** a full deposit/borrow/repay/withdraw cycle works on testnet against the *raw* pool, with no basket involved. If this doesn't work, nothing above it will.

### Phase 3 — The basket vault (D9–D11) — *core original contribution*

- [ ] `StratusVault.sol`:
  - `depositBasket(uint256 amount)` — pull basket → redeem to underlying → `pool.deposit(asset, amt, onBehalfOf=msg.sender)` per component.
  - `withdrawToBasket(uint256 amount)` — pull underlying from the user (post `pool.withdraw`) → re-mint basket → return. Reverts if the resulting position is unhealthy (the pool already enforces this on withdraw; the vault re-checks and fails loudly).
  - Events: `BasketDecomposed`, `BasketRecomposed`, with per-component amounts — the on-chain proof of look-through.
- [ ] `StratusRiskView.sol`: per-component health factor + combined HF + per-component borrowing-capacity contribution, as a single struct read for the UI.
- [ ] Tests:
  - Decompose → per-reserve balances match the basket ratio.
  - Borrow capacity == Σ(component value × component LTV), *not* a single blended number.
  - Recompose after partial repay.
  - Attempting to recompose while unhealthy reverts.

**Gate 3:** `depositBasket` → borrow USDC → `withdrawToBasket` round-trips on testnet, with events proving decomposition.

### Phase 4 — Liquidation, isolated (D12–D13) — *the money shot of the demo*

- [ ] Demo stress path (§6.3) implemented and gated behind an owner-only role.
- [ ] Scripted scenario `script/demo-liquidation.ts`:
  1. User deposits 1 basket token → 2 isolated reserve positions.
  2. User borrows USDC near max capacity.
  3. Gold price is stressed down; stock price untouched.
  4. Health factor < 1 → third-party liquidator calls `liquidationCall(GOLD-x, USDC, user, ...)`.
  5. Assert: gold collateral reduced, **STOCK-x aToken balance byte-for-byte unchanged**, remaining debt still collateralised by the stock leg.
- [ ] Test the mirror case (stock crashes, gold untouched) so the isolation claim isn't a one-asset fluke.

**Gate 4:** an automated test asserts the untouched-leg invariant, and the same scenario runs against live testnet with recorded tx hashes saved to `deployments/`.

### Phase 5 — Frontend (D14–D17)

Four screens, no more:

1. **Mint basket** — acquire/mint GOLD-x + STOCK-x → basket token.
2. **Deposit** — one action; then show the *decomposition result*: two reserve cards, each with its own LTV, threshold, price, and component health factor. This screen is the pitch.
3. **Borrow / repay** — USDC, with combined capacity shown as the sum of the two component contributions, visibly itemised.
4. **Risk panel** — live Pyth prices, per-component HF bars, and a "what liquidates first" indicator.

- [ ] Wallets: MetaMask (Hedera EVM) first; HashPack if time permits.
- [ ] Read layer: `StratusRiskView` in one multicall-ish read, polled on price updates.
- [ ] Empty/error states for: wrong network, ATS transfer blocked, stale oracle.

**Gate 5:** a person who has never seen the project can go from zero to a borrowed position without instruction.

### Phase 6 — Submission (D18–D21)

- [ ] `README.md`: problem, mechanism, architecture diagram, deployed addresses, how to run.
- [ ] `docs/demo-script.md`: exact click-by-click path for the video, including the liquidation.
- [ ] Demo video (≤ 4 min): problem → deposit/decompose → borrow → gold crash → isolated liquidation → stock leg survives.
- [ ] Qualification checklist for the Hedera track: ATS used ✓, testnet deployed ✓, lifecycle operation demonstrated (borrow against tokenized collateral) ✓.
- [ ] **Bonus criterion:** open at least one substantive issue or small PR upstream to ATS from real friction found in Phase 0/1 (see §8). Do this the week it happens, not on the last day.
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
