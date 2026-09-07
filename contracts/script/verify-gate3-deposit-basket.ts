import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 3 Gate 3 (partial): depositBasket decomposes a basket
 * token into two isolated reserve positions, proven by the
 * BasketDecomposed event and by each component's aToken balance
 * increasing independently. Mirrors Gate 2's deposit/withdraw-only pass -
 * borrow (and thus the full deposit->borrow->withdraw cycle) is still
 * blocked on Pyth Hermes/Wormhole infrastructure, see
 * docs/phase-2-findings.md.
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const vaultAddress = requireContractAddress(network.name, "StratusVault");
  const basketAddress = requireContractAddress(network.name, "StratusBasketToken");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");
  const aGoldAddress = requireContractAddress(network.name, "aToken_GOLD-x");
  const aStockAddress = requireContractAddress(network.name, "aToken_STOCK-x");

  const vault = await ethers.getContractAt("StratusVault", vaultAddress);
  const basket = await ethers.getContractAt("StratusBasketToken", basketAddress);
  const aGold = await ethers.getContractAt("IERC20Metadata", aGoldAddress);
  const aStock = await ethers.getContractAt("IERC20Metadata", aStockAddress);

  const basketAmount = ethers.parseEther("50"); // -> 25 GOLD-x + 25 STOCK-x at 50/50

  const basketBefore = await basket.balanceOf(signer.address);
  const aGoldBefore = await aGold.balanceOf(signer.address);
  const aStockBefore = await aStock.balanceOf(signer.address);
  console.log(`Before: ${ethers.formatEther(basketBefore)} basket, ${ethers.formatEther(aGoldBefore)} aGOLD-x, ${ethers.formatEther(aStockBefore)} aSTOCK-x`);

  if (basketBefore < basketAmount) {
    throw new Error("Not enough basket tokens - mint some first (see contracts/script/verify-basket-roundtrip.ts)");
  }

  console.log("\nApproving vault for the basket token...");
  await (await basket.approve(vaultAddress, basketAmount)).wait();

  console.log("Calling depositBasket(50)...");
  const tx = await vault.depositBasket(basketAmount);
  const receipt = await tx.wait();
  console.log(`  tx: ${tx.hash} (gas used: ${receipt!.gasUsed})`);

  const event = receipt!.logs
    .map((log) => {
      try {
        return vault.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "BasketDecomposed");
  if (!event) throw new Error("BasketDecomposed event not found");
  console.log("  BasketDecomposed event:", {
    user: event.args.user,
    basketAmount: ethers.formatEther(event.args.basketAmount),
    amountA: ethers.formatEther(event.args.amountA),
    amountB: ethers.formatEther(event.args.amountB),
  });

  const aGoldAfter = await aGold.balanceOf(signer.address);
  const aStockAfter = await aStock.balanceOf(signer.address);
  const basketAfter = await basket.balanceOf(signer.address);
  console.log(`After: ${ethers.formatEther(basketAfter)} basket, ${ethers.formatEther(aGoldAfter)} aGOLD-x, ${ethers.formatEther(aStockAfter)} aSTOCK-x`);

  const expectedDelta = ethers.parseEther("25");
  const exact =
    basketAfter === basketBefore - basketAmount &&
    aGoldAfter === aGoldBefore + expectedDelta &&
    aStockAfter === aStockBefore + expectedDelta;

  console.log(`\nDecomposition exact (25/25 split, both aToken balances independently increased): ${exact ? "PASS" : "FAIL"}`);
  if (!exact) throw new Error("Decomposition amounts did not match the expected 50/50 split");

  console.log("\n=== GATE 3 (deposit/decompose leg): PASSED ===");
  console.log("Borrow leg still blocked on Pyth Hermes/Wormhole - see docs/phase-2-findings.md");
  console.log(JSON.stringify({ depositBasketTx: tx.hash }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
