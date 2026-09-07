import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 2: seeds USDC liquidity into the pool from the deployer
 * account so borrowing is possible once the borrow leg is unblocked (see
 * docs/phase-2-findings.md - blocked on Pyth Hermes API access, not on
 * this). Plain deposit, no oracle read needed - same as GOLD-x's deposit
 * leg in verify-gate2-deposit-withdraw.ts.
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");

  const pool = await ethers.getContractAt("ILendingPool", poolAddress);
  const usdc = await ethers.getContractAt("IERC20Metadata", usdcAddress);

  const seedAmount = ethers.parseUnits("100000", 6); // 100k USDC of liquidity

  const balance = await usdc.balanceOf(signer.address);
  console.log(`Deployer USDC balance: ${ethers.formatUnits(balance, 6)}`);
  if (balance < seedAmount) {
    throw new Error("Not enough USDC to seed - run contracts/script/02-deploy-mock-usdc.ts first");
  }

  console.log(`Approving pool for ${ethers.formatUnits(seedAmount, 6)} USDC...`);
  await (await usdc.approve(poolAddress, seedAmount)).wait();

  console.log("Depositing USDC liquidity...");
  const tx = await pool.deposit(usdcAddress, seedAmount, signer.address, 0);
  const receipt = await tx.wait();
  console.log(`  tx: ${tx.hash} (gas used: ${receipt!.gasUsed})`);

  console.log("\n=== USDC liquidity seeded ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
