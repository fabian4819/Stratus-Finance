import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 4: "Test the mirror case (stock crashes, gold untouched)
 * so the isolation claim isn't a one-asset fluke." Same mechanism as
 * demo-liquidation.ts, STOCK-x/ETH stressed instead of GOLD-x/HBAR.
 *
 * First repays any outstanding debt from a prior run to reset to a clean
 * slate (demo-liquidation.ts leaves the position under-collateralized on
 * purpose - it stops once the invariant is proven, doesn't clean up after
 * itself), then deposits a fresh value-balanced position.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const liquidator = new ethers.Wallet(requireEnv("DEMO_LIQUIDATOR_PRIVATE_KEY"), ethers.provider);
  console.log("Borrower (deployer):", deployer.address);
  console.log("Liquidator:", liquidator.address);

  const oracleAddress = requireContractAddress(network.name, "StratusChainlinkPriceOracle");
  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");
  const dataProviderAddress = requireContractAddress(network.name, "ProtocolDataProvider");

  const oracle = await ethers.getContractAt("StratusChainlinkPriceOracle", oracleAddress);
  const pool = await ethers.getContractAt("ILendingPool", poolAddress);
  const dataProvider = await ethers.getContractAt("IProtocolDataProvider", dataProviderAddress);
  const gold = await ethers.getContractAt("IERC20Metadata", goldAddress);
  const stock = await ethers.getContractAt("IERC20Metadata", stockAddress);
  const usdc = await ethers.getContractAt("IERC20Metadata", usdcAddress);

  // --- Step 0a: clean up any leftover debt from a prior demo run ---
  const [, totalDebtUsdBefore] = await pool.getUserAccountData(deployer.address);
  if (totalDebtUsdBefore > 0n) {
    console.log(`\nStep 0a: repaying leftover debt ($${ethers.formatEther(totalDebtUsdBefore)}) from a prior run...`);
    await (await usdc.approve(poolAddress, ethers.MaxUint256)).wait();
    const repayTx = await pool.repay(usdcAddress, ethers.MaxUint256, 2, deployer.address);
    await repayTx.wait();
    console.log(`  tx: ${repayTx.hash}`);
  }

  // --- Step 0b: clear GOLD-x's demo stress left active by a prior run of
  // demo-liquidation.ts, so this script's own price-based amount
  // calculations use the real live price, not a stale -90% offset.
  if (await oracle.isDemoStressed(goldAddress)) {
    console.log("\nStep 0b: clearing GOLD-x's leftover demo price stress...");
    const clearTx = await oracle.connect(deployer).setDemoOffsetBps(goldAddress, 0);
    await clearTx.wait();
    console.log(`  tx: ${clearTx.hash}`);
  }

  const goldPrice = await oracle.getAssetPrice(goldAddress);
  const stockPrice = await oracle.getAssetPrice(stockAddress);
  console.log(`\nLive prices: GOLD-x (HBAR/USD) $${ethers.formatEther(goldPrice)}, STOCK-x (ETH/USD) $${ethers.formatEther(stockPrice)}`);

  // --- Step 1: deposit value-balanced collateral into both reserves ---
  // GOLD-x sized to what's actually left in the wallet after
  // demo-liquidation.ts's run (it doesn't clean up after itself either -
  // liquidation is meant to consume collateral); STOCK-x computed to match
  // its dollar value at current live prices, not hardcoded.
  const goldBalance = await gold.balanceOf(deployer.address);
  const goldAmount = goldBalance > ethers.parseEther("800") ? ethers.parseEther("800") : (goldBalance * 9n) / 10n;
  const stockAmount = (goldAmount * goldPrice) / stockPrice;
  console.log(
    `\nStep 1: depositing ${ethers.formatEther(goldAmount)} GOLD-x (~$${ethers.formatEther((goldAmount * goldPrice) / 10n ** 18n)}) ` +
      `and ${ethers.formatEther(stockAmount)} STOCK-x (~$${ethers.formatEther((stockAmount * stockPrice) / 10n ** 18n)})...`
  );
  await (await gold.approve(poolAddress, goldAmount)).wait();
  const depositGoldTx = await pool.deposit(goldAddress, goldAmount, deployer.address, 0);
  await depositGoldTx.wait();
  await (await stock.approve(poolAddress, stockAmount)).wait();
  const depositStockTx = await pool.deposit(stockAddress, stockAmount, deployer.address, 0);
  await depositStockTx.wait();
  console.log(`  GOLD-x deposit tx: ${depositGoldTx.hash}`);
  console.log(`  STOCK-x deposit tx: ${depositStockTx.hash}`);

  const [totalCollateralUsd, , availableBorrowsUsd] = await pool.getUserAccountData(deployer.address);
  console.log(`  Total collateral: $${ethers.formatEther(totalCollateralUsd)}, available to borrow: $${ethers.formatEther(availableBorrowsUsd)}`);

  // --- Step 2: borrow near max combined capacity ---
  const borrowAmountUsd = (availableBorrowsUsd * 90n) / 100n;
  const borrowAmountUsdc = (borrowAmountUsd * 10n ** 6n) / 10n ** 18n;
  console.log(`\nStep 2: borrowing ${ethers.formatUnits(borrowAmountUsdc, 6)} USDC (90% of available capacity)...`);
  const borrowTx = await pool.borrow(usdcAddress, borrowAmountUsdc, 2, 0, deployer.address);
  await borrowTx.wait();
  console.log(`  tx: ${borrowTx.hash}`);

  // --- Snapshot the gold leg before stress, for the isolation assertion ---
  const [goldATokenBefore] = await dataProvider.getUserReserveData(goldAddress, deployer.address);

  // --- Step 3: stress the STOCK-x (ETH) price down this time ---
  const STRESS_OFFSET_BPS = -6_000; // -60%: ETH's dollar contribution is roughly balanced with gold here, less stress needed than the primary demo
  console.log(`\nStep 3: DEMO PRICE STRESS ACTIVE - stressing STOCK-x ${STRESS_OFFSET_BPS / 100}%...`);
  const stressTx = await oracle.connect(deployer).setDemoOffsetBps(stockAddress, STRESS_OFFSET_BPS);
  await stressTx.wait();
  console.log(`  tx: ${stressTx.hash}`);
  console.log(`  STOCK-x price now: $${ethers.formatEther(await oracle.getAssetPrice(stockAddress))}`);

  // --- Step 4: confirm health factor dropped below 1 ---
  const [, totalDebtUsd, , , , healthFactorAfterStress] = await pool.getUserAccountData(deployer.address);
  console.log(`\nStep 4: total debt $${ethers.formatEther(totalDebtUsd)}, health factor: ${ethers.formatEther(healthFactorAfterStress)}`);
  if (healthFactorAfterStress >= ethers.parseEther("1")) {
    throw new Error("Health factor still >= 1 after stress - increase STRESS_OFFSET_BPS or the borrow fraction.");
  }

  // --- Step 5: liquidator seizes ONLY the stock reserve ---
  const debtToCover = borrowAmountUsdc / 2n;
  console.log(`\nStep 5: liquidator covering ${ethers.formatUnits(debtToCover, 6)} USDC of debt, seizing STOCK-x only...`);
  await (await usdc.connect(liquidator).approve(poolAddress, debtToCover)).wait();
  const liquidationTx = await pool
    .connect(liquidator)
    .liquidationCall(stockAddress, usdcAddress, deployer.address, debtToCover, false);
  const liquidationReceipt = await liquidationTx.wait();
  console.log(`  tx: ${liquidationTx.hash} (gas used: ${liquidationReceipt!.gasUsed})`);

  // --- Step 6: assert the isolation invariant, mirrored ---
  const [goldATokenAfter] = await dataProvider.getUserReserveData(goldAddress, deployer.address);
  const [stockATokenAfter] = await dataProvider.getUserReserveData(stockAddress, deployer.address);
  console.log(`\nStep 6: GOLD-x aToken balance before: ${ethers.formatEther(goldATokenBefore)}, after: ${ethers.formatEther(goldATokenAfter)}`);
  console.log(`  STOCK-x aToken balance after liquidation: ${ethers.formatEther(stockATokenAfter)}`);
  if (goldATokenAfter !== goldATokenBefore) {
    throw new Error("ISOLATION INVARIANT VIOLATED: gold leg balance changed during stock liquidation.");
  }
  console.log("\n✅ Isolation invariant holds (mirrored): GOLD-x leg is byte-for-byte unchanged by the STOCK-x liquidation.");

  console.log("\n=== GATE 4 (mirror case): PASSED ===");
  console.log(
    JSON.stringify(
      {
        depositGoldTx: depositGoldTx.hash,
        depositStockTx: depositStockTx.hash,
        borrowTx: borrowTx.hash,
        stressTx: stressTx.hash,
        liquidationTx: liquidationTx.hash,
      },
      null,
      2
    )
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not set — see contracts/.env.example`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
