import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 2 Gate 2, the remaining leg: borrow USDC against existing
 * collateral, then repay it. Now unblocked by the Pyth -> Chainlink
 * oracle pivot (docs/phase-2-findings.md) - the pool is wired to
 * StratusChainlinkPriceOracle, which needs no update step at all.
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");

  const pool = await ethers.getContractAt("ILendingPool", poolAddress);
  const usdc = await ethers.getContractAt("IERC20Metadata", usdcAddress);

  console.log("\nReading account data (needs a live oracle price - this alone was blocked before the pivot)...");
  const [totalCollateralUsd, totalDebtBefore, availableBorrows, currentLiquidationThreshold, ltv, healthFactorBefore] =
    await pool.getUserAccountData(signer.address);
  console.log(`  Total collateral (base currency, 18dp): $${ethers.formatEther(totalCollateralUsd)}`);
  console.log(`  Total debt: $${ethers.formatEther(totalDebtBefore)}`);
  console.log(`  Available to borrow: $${ethers.formatEther(availableBorrows)}`);
  console.log(`  LTV: ${ltv}bps, liquidation threshold: ${currentLiquidationThreshold}bps`);
  console.log(`  Health factor: ${healthFactorBefore === ethers.MaxUint256 ? "MAX (no debt)" : ethers.formatEther(healthFactorBefore)}`);

  if (availableBorrows === 0n) {
    throw new Error("No borrow capacity - deposit some GOLD-x/STOCK-x collateral first");
  }

  // Borrow a conservative fraction of capacity, leaving headroom.
  const borrowAmountUsd = (availableBorrows * 50n) / 100n;
  const borrowAmountUsdc = (borrowAmountUsd * 10n ** 6n) / 10n ** 18n; // USDC is 6dp, availableBorrows is 18dp base currency ~= USD
  console.log(`\nBorrowing ~50% of capacity: ${ethers.formatUnits(borrowAmountUsdc, 6)} USDC...`);

  const usdcBefore = await usdc.balanceOf(signer.address);
  const borrowTx = await pool.borrow(usdcAddress, borrowAmountUsdc, 2 /* variable rate */, 0, signer.address);
  const borrowReceipt = await borrowTx.wait();
  console.log(`  tx: ${borrowTx.hash} (gas used: ${borrowReceipt!.gasUsed})`);

  const usdcAfterBorrow = await usdc.balanceOf(signer.address);
  console.log(`  USDC balance: ${ethers.formatUnits(usdcBefore, 6)} -> ${ethers.formatUnits(usdcAfterBorrow, 6)}`);
  if (usdcAfterBorrow !== usdcBefore + borrowAmountUsdc) {
    throw new Error("USDC balance did not increase by exactly the borrowed amount");
  }

  const [, totalDebtAfterBorrow, , , , healthFactorAfterBorrow] = await pool.getUserAccountData(signer.address);
  console.log(`  Total debt now: $${ethers.formatEther(totalDebtAfterBorrow)}`);
  console.log(`  Health factor now: ${ethers.formatEther(healthFactorAfterBorrow)}`);

  console.log("\nRepaying the full borrowed amount...");
  await (await usdc.approve(poolAddress, borrowAmountUsdc)).wait();
  const repayTx = await pool.repay(usdcAddress, borrowAmountUsdc, 2, signer.address);
  const repayReceipt = await repayTx.wait();
  console.log(`  tx: ${repayTx.hash} (gas used: ${repayReceipt!.gasUsed})`);

  const usdcAfterRepay = await usdc.balanceOf(signer.address);
  const [, totalDebtAfterRepay, , , , healthFactorAfterRepay] = await pool.getUserAccountData(signer.address);
  console.log(`  USDC balance after repay: ${ethers.formatUnits(usdcAfterRepay, 6)}`);
  console.log(`  Total debt after repay: $${ethers.formatEther(totalDebtAfterRepay)}`);
  console.log(`  Health factor after repay: MAX (no debt) = ${healthFactorAfterRepay === ethers.MaxUint256}`);

  const exact = usdcAfterRepay === usdcBefore && totalDebtAfterRepay === 0n;
  console.log(`\nBorrow/repay round trip exact: ${exact ? "PASS" : "FAIL"}`);
  if (!exact) throw new Error("USDC balance or debt did not return to the exact starting state");

  console.log("\n=== GATE 2: FULLY PASSED (deposit -> borrow -> repay -> withdraw) ===");
  console.log(JSON.stringify({ borrowTx: borrowTx.hash, repayTx: repayTx.hash }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
