import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 2 Gate 2 (partial): deposit GOLD-x directly into the raw
 * pool (no basket involved), then withdraw it back out — both legs of
 * this round trip work without a live oracle price (Aave v2's
 * validateDeposit doesn't touch the oracle at all, and validateWithdraw
 * only does when the user has active debt against the withdrawn
 * collateral - see docs/phase-0-findings.md for why the borrow leg is
 * blocked separately).
 *
 * borrow -> repay is the remaining half of Gate 2, blocked on a Pyth
 * Hermes API key (Hermes started requiring one on 2026-08-26 - see
 * docs/phase-2-findings.md) needed to push a fresh price on-chain before
 * ValidationLogic.validateBorrow's oracle read can succeed.
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const aGoldAddress = requireContractAddress(network.name, "aToken_GOLD-x");

  const pool = await ethers.getContractAt("ILendingPool", poolAddress);
  const gold = await ethers.getContractAt("IERC20Metadata", goldAddress);
  const aGold = await ethers.getContractAt("IERC20Metadata", aGoldAddress);

  const depositAmount = ethers.parseEther("100");

  const goldBefore = await gold.balanceOf(signer.address);
  const aGoldBefore = await aGold.balanceOf(signer.address);
  console.log(`Before: ${ethers.formatEther(goldBefore)} GOLD-x, ${ethers.formatEther(aGoldBefore)} aGOLD-x`);

  console.log("\nApproving pool for GOLD-x...");
  await (await gold.approve(poolAddress, depositAmount)).wait();

  console.log("Depositing 100 GOLD-x directly into the pool...");
  const depositTx = await pool.deposit(goldAddress, depositAmount, signer.address, 0);
  const depositReceipt = await depositTx.wait();
  console.log(`  tx: ${depositTx.hash} (gas used: ${depositReceipt!.gasUsed})`);

  const aGoldAfterDeposit = await aGold.balanceOf(signer.address);
  console.log(`  aGOLD-x balance after deposit: ${ethers.formatEther(aGoldAfterDeposit)}`);
  if (aGoldAfterDeposit !== aGoldBefore + depositAmount) {
    throw new Error("aGOLD-x balance did not increase by exactly the deposited amount");
  }

  // getUserAccountData always computes totalCollateralUsd via the oracle,
  // even with zero debt - so it hits the same stale-price revert as
  // borrow would. Skipped here; not needed for the deposit/withdraw leg.
  console.log("  (skipping getUserAccountData - it unconditionally reads the oracle, blocked on Hermes access)");

  console.log("\nWithdrawing the full 100 GOLD-x back out...");
  const withdrawTx = await pool.withdraw(goldAddress, depositAmount, signer.address);
  const withdrawReceipt = await withdrawTx.wait();
  console.log(`  tx: ${withdrawTx.hash} (gas used: ${withdrawReceipt!.gasUsed})`);

  const goldAfterWithdraw = await gold.balanceOf(signer.address);
  const aGoldAfterWithdraw = await aGold.balanceOf(signer.address);
  console.log(
    `After: ${ethers.formatEther(goldAfterWithdraw)} GOLD-x, ${ethers.formatEther(aGoldAfterWithdraw)} aGOLD-x`
  );

  const exact = goldAfterWithdraw === goldBefore && aGoldAfterWithdraw === aGoldBefore;
  console.log(`\nDeposit/withdraw round trip exact: ${exact ? "PASS" : "FAIL"}`);
  if (!exact) {
    throw new Error("Round trip did not return exactly the original balances");
  }

  console.log("\n=== GATE 2 (deposit/withdraw leg): PASSED ===");
  console.log("Borrow/repay leg still blocked on Pyth Hermes API access — see docs/phase-2-findings.md");
  console.log(JSON.stringify({ depositTx: depositTx.hash, withdrawTx: withdrawTx.hash }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
