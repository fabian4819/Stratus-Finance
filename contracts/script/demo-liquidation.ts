import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * BLOCKED on Phase 2–4 (needs the deployed pool, vault, and a funded
 * second "liquidator" account — see contracts/script/README.md).
 *
 * This is the scripted scenario for PLAN.md Gate 4 — the demo's centerpiece:
 *
 *   1. `user` deposits 1 basket token -> two isolated reserve positions.
 *   2. `user` borrows USDC near max combined capacity.
 *   3. Gold price is stressed down via StratusPriceOracle.setDemoOffsetBps
 *      (owner-only, DEMO-ONLY — see PLAN.md §6.3). Stock price is untouched.
 *   4. Combined health factor drops below 1.
 *   5. `liquidator` calls pool.liquidationCall(GOLD-x, USDC, user, ...).
 *   6. Assert: STOCK-x aToken balance for `user` is BYTE-FOR-BYTE unchanged
 *      before and after the liquidation call — the isolation invariant.
 *
 * Every tx hash from a testnet run of this script belongs in
 * `deployments/<network>.json` under `meta.demoLiquidationRun` per
 * PLAN.md §9 (Definition of done).
 */
async function main() {
  const [deployer, user, liquidator] = await ethers.getSigners();
  if (!liquidator) {
    throw new Error("Need at least 3 signers (deployer, user, liquidator) — check your network config.");
  }

  const vaultAddress = requireContractAddress(network.name, "StratusVault");
  const oracleAddress = requireContractAddress(network.name, "StratusPriceOracle");
  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");

  console.log("Addresses:", { vaultAddress, oracleAddress, poolAddress, usdcAddress, goldAddress, stockAddress });

  const vault = await ethers.getContractAt("StratusVault", vaultAddress);
  const oracle = await ethers.getContractAt("StratusPriceOracle", oracleAddress);
  const pool = await ethers.getContractAt("ILendingPool", poolAddress);
  const dataProvider = await ethers.getContractAt(
    "IProtocolDataProvider",
    requireContractAddress(network.name, "ProtocolDataProvider")
  );

  // --- Step 1: deposit basket ---
  const basketAmount = ethers.parseEther("1");
  const basketToken = await ethers.getContractAt("StratusBasketToken", requireContractAddress(network.name, "StratusBasketToken"));
  await (await basketToken.connect(user).approve(vaultAddress, basketAmount)).wait();
  const depositTx = await vault.connect(user).depositBasket(basketAmount);
  await depositTx.wait();
  console.log(`Step 1 - depositBasket tx: ${depositTx.hash}`);

  // --- Step 2: borrow USDC near max capacity ---
  const [, totalDebtBefore, availableBorrows] = await pool.getUserAccountData(user.address);
  const borrowAmount = (availableBorrows * 90n) / 100n; // leave 10% headroom pre-stress
  console.log(`Step 2 - borrowing ${borrowAmount} (of ${availableBorrows} available)`);
  const borrowTx = await pool
    .connect(user)
    .borrow(usdcAddress, borrowAmount, 2 /* variable rate */, 0, user.address);
  await borrowTx.wait();
  console.log(`Step 2 - borrow tx: ${borrowTx.hash}`);

  // --- Snapshot stock leg before stress, for the isolation assertion ---
  const [stockATokenBefore] = await dataProvider.getUserReserveData(stockAddress, user.address);

  // --- Step 3: stress the gold price down (DEMO-ONLY, see PLAN.md §6.3) ---
  const STRESS_OFFSET_BPS = -4_000; // -40%
  const stressTx = await oracle.connect(deployer).setDemoOffsetBps(goldAddress, STRESS_OFFSET_BPS);
  await stressTx.wait();
  console.log(`Step 3 - DEMO PRICE STRESS ACTIVE: gold ${STRESS_OFFSET_BPS / 100}% (tx: ${stressTx.hash})`);

  // --- Step 4: confirm health factor dropped below 1 ---
  const [, , , , , healthFactorAfterStress] = await pool.getUserAccountData(user.address);
  console.log(`Step 4 - health factor after stress: ${ethers.formatEther(healthFactorAfterStress)}`);
  if (healthFactorAfterStress >= ethers.parseEther("1")) {
    throw new Error("Health factor still >= 1 after stress — increase STRESS_OFFSET_BPS or borrow amount.");
  }

  // --- Step 5: liquidator seizes ONLY the gold reserve ---
  const debtToCover = borrowAmount / 2n; // Aave v2 caps a single liquidationCall at 50% of debt by default
  await (await (await ethers.getContractAt("IERC20", usdcAddress)).connect(liquidator).approve(poolAddress, debtToCover)).wait();
  const liquidationTx = await pool
    .connect(liquidator)
    .liquidationCall(goldAddress, usdcAddress, user.address, debtToCover, false);
  await liquidationTx.wait();
  console.log(`Step 5 - liquidationCall tx: ${liquidationTx.hash}`);

  // --- Step 6: assert the isolation invariant ---
  const [stockATokenAfter] = await dataProvider.getUserReserveData(stockAddress, user.address);
  console.log(`Step 6 - stock-index aToken balance before: ${stockATokenBefore}, after: ${stockATokenAfter}`);
  if (stockATokenAfter !== stockATokenBefore) {
    throw new Error("ISOLATION INVARIANT VIOLATED: stock-index leg balance changed during gold liquidation.");
  }
  console.log("✅ Isolation invariant holds: stock-index leg untouched by the gold liquidation.");

  console.log("\nRecord these tx hashes in deployments/<network>.json under meta.demoLiquidationRun:");
  console.log({ depositTx: depositTx.hash, borrowTx: borrowTx.hash, stressTx: stressTx.hash, liquidationTx: liquidationTx.hash });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
