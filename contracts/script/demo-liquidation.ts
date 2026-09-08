import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 4, Gate 4 — the demo's centerpiece: an isolated
 * liquidation. One collateral leg gets liquidated; the other is
 * byte-for-byte untouched.
 *
 * Deposits directly into the pool (both components), not via
 * StratusVault/basket - deliberately, for one honest reason: GOLD-x
 * (-> HBAR/USD, ~$0.08) and STOCK-x (-> ETH/USD, ~$2,470) are ~30,000x
 * apart in price (both are substitute feeds, see docs/phase-2-findings.md
 * and docs/phase-0-findings.md - no real gold/equity feed exists on
 * Hedera testnet from either Pyth or Chainlink). The basket's fixed 50/50
 * *token* ratio would make one leg's dollar value totally swamp the
 * other at these prices, so stressing the smaller leg would barely move
 * the combined health factor - not because isolation doesn't work, but
 * because the demo would be numerically invisible. Depositing directly
 * with value-balanced amounts instead makes the isolation mechanism
 * clearly visible, and exercises the exact same pool.liquidationCall path
 * either way - the vault's decompose/recompose correctness is already
 * proven separately in Gate 3.
 *
 * Run: npx hardhat run script/demo-liquidation.ts --network hederaTestnet
 * Requires DEMO_LIQUIDATOR_PRIVATE_KEY in contracts/.env (a funded,
 * ATS-whitelisted account distinct from the operator - see
 * contracts/script/setup-demo-liquidator.ts).
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

  const goldPrice = await oracle.getAssetPrice(goldAddress);
  const stockPrice = await oracle.getAssetPrice(stockAddress);
  console.log(`\nLive prices: GOLD-x (HBAR/USD) $${ethers.formatEther(goldPrice)}, STOCK-x (ETH/USD) $${ethers.formatEther(stockPrice)}`);

  // --- Step 1: deposit value-balanced collateral into both reserves ---
  const goldAmount = ethers.parseEther("9000"); // ~$718 at current prices
  const stockAmount = ethers.parseEther("0.3"); // ~$741 at current prices
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

  // --- Snapshot the stock leg before stress, for the isolation assertion ---
  const [stockATokenBefore] = await dataProvider.getUserReserveData(stockAddress, deployer.address);

  // --- Step 3: stress the gold price down (DEMO-ONLY, see PLAN.md §6.3) ---
  const STRESS_OFFSET_BPS = -9_000; // -90%: gold's dollar contribution is small even balanced, needs a large stress to cross the threshold
  console.log(`\nStep 3: DEMO PRICE STRESS ACTIVE - stressing GOLD-x ${STRESS_OFFSET_BPS / 100}%...`);
  const stressTx = await oracle.connect(deployer).setDemoOffsetBps(goldAddress, STRESS_OFFSET_BPS);
  await stressTx.wait();
  console.log(`  tx: ${stressTx.hash}`);
  console.log(`  GOLD-x price now: $${ethers.formatEther(await oracle.getAssetPrice(goldAddress))}`);

  // --- Step 4: confirm health factor dropped below 1 ---
  const [, totalDebtUsd, , , , healthFactorAfterStress] = await pool.getUserAccountData(deployer.address);
  console.log(`\nStep 4: total debt $${ethers.formatEther(totalDebtUsd)}, health factor: ${ethers.formatEther(healthFactorAfterStress)}`);
  if (healthFactorAfterStress >= ethers.parseEther("1")) {
    throw new Error("Health factor still >= 1 after stress - increase STRESS_OFFSET_BPS or the borrow fraction.");
  }

  // --- Step 5: liquidator seizes ONLY the gold reserve ---
  const debtToCover = borrowAmountUsdc / 2n; // Aave v2 caps a single liquidationCall at 50% of debt by default
  console.log(`\nStep 5: liquidator covering ${ethers.formatUnits(debtToCover, 6)} USDC of debt, seizing GOLD-x only...`);
  await (await usdc.connect(liquidator).approve(poolAddress, debtToCover)).wait();
  const liquidationTx = await pool
    .connect(liquidator)
    .liquidationCall(goldAddress, usdcAddress, deployer.address, debtToCover, false);
  const liquidationReceipt = await liquidationTx.wait();
  console.log(`  tx: ${liquidationTx.hash} (gas used: ${liquidationReceipt!.gasUsed})`);

  // --- Step 6: assert the isolation invariant ---
  const [stockATokenAfter] = await dataProvider.getUserReserveData(stockAddress, deployer.address);
  const [goldATokenAfter] = await dataProvider.getUserReserveData(goldAddress, deployer.address);
  console.log(`\nStep 6: STOCK-x aToken balance before: ${ethers.formatEther(stockATokenBefore)}, after: ${ethers.formatEther(stockATokenAfter)}`);
  console.log(`  GOLD-x aToken balance after liquidation: ${ethers.formatEther(goldATokenAfter)}`);
  if (stockATokenAfter !== stockATokenBefore) {
    throw new Error("ISOLATION INVARIANT VIOLATED: stock-index leg balance changed during gold liquidation.");
  }
  console.log("\n✅ Isolation invariant holds: STOCK-x leg is byte-for-byte unchanged by the GOLD-x liquidation.");

  console.log("\n=== GATE 4: PASSED ===");
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
