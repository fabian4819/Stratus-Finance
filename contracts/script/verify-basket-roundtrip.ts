import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 1 Gate 1: "a wallet holds basket tokens minted from real
 * ATS underlying, and can redeem back to the exact underlying amounts."
 *
 * Requires: issue-assets.ts has run (real GOLD-x/STOCK-x exist, admin
 * holds a balance and is whitelisted on both), 01-deploy-basket-token.ts
 * has run, and whitelist-protocol-addresses.ts has whitelisted the
 * StratusBasketToken address on both control lists.
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const basketAddress = requireContractAddress(network.name, "StratusBasketToken");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");

  const basket = await ethers.getContractAt("StratusBasketToken", basketAddress);
  const gold = await ethers.getContractAt("IERC20Metadata", goldAddress);
  const stock = await ethers.getContractAt("IERC20Metadata", stockAddress);

  const basketAmount = ethers.parseEther("100"); // -> 50 GOLD-x + 50 STOCK-x at the 50/50 ratio
  const [amountA, amountB] = await basket.previewComponents(basketAmount);
  console.log(`previewComponents(100): ${ethers.formatEther(amountA)} GOLD-x + ${ethers.formatEther(amountB)} STOCK-x`);

  const goldBefore = await gold.balanceOf(signer.address);
  const stockBefore = await stock.balanceOf(signer.address);
  console.log(`Before: ${ethers.formatEther(goldBefore)} GOLD-x, ${ethers.formatEther(stockBefore)} STOCK-x, 0 basket`);

  console.log("\nApproving basket token for GOLD-x + STOCK-x...");
  await (await gold.approve(basketAddress, amountA)).wait();
  await (await stock.approve(basketAddress, amountB)).wait();

  console.log("Minting 100 basket tokens...");
  const mintTx = await basket.mint(basketAmount);
  await mintTx.wait();
  console.log("  tx:", mintTx.hash);

  const basketBalance = await basket.balanceOf(signer.address);
  const goldAfterMint = await gold.balanceOf(signer.address);
  const stockAfterMint = await stock.balanceOf(signer.address);
  console.log(
    `After mint: ${ethers.formatEther(goldAfterMint)} GOLD-x, ${ethers.formatEther(stockAfterMint)} STOCK-x, ${ethers.formatEther(basketBalance)} basket`
  );

  console.log("\nRedeeming 100 basket tokens...");
  const redeemTx = await basket.redeem(basketAmount);
  await redeemTx.wait();
  console.log("  tx:", redeemTx.hash);

  const goldAfterRedeem = await gold.balanceOf(signer.address);
  const stockAfterRedeem = await stock.balanceOf(signer.address);
  const basketAfterRedeem = await basket.balanceOf(signer.address);
  console.log(
    `After redeem: ${ethers.formatEther(goldAfterRedeem)} GOLD-x, ${ethers.formatEther(stockAfterRedeem)} STOCK-x, ${ethers.formatEther(basketAfterRedeem)} basket`
  );

  const roundTripExact = goldAfterRedeem === goldBefore && stockAfterRedeem === stockBefore && basketAfterRedeem === 0n;
  console.log(`\nGate 1 round-trip exact: ${roundTripExact ? "PASS" : "FAIL"}`);
  if (!roundTripExact) {
    throw new Error("Round trip did not return exactly the original underlying amounts");
  }

  console.log("\n=== GATE 1: PASSED ===");
  console.log(JSON.stringify({ mintTx: mintTx.hash, redeemTx: redeemTx.hash }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
