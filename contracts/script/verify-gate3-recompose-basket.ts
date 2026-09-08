import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 3 Gate 3, the withdrawal direction: the user withdraws
 * both components from the pool directly (Aave v2 has no "withdraw on
 * behalf of" - see StratusVault's contract docs), approves the vault for
 * those exact amounts, then calls recomposeBasket to get the basket token
 * back. No live oracle price needed (no active debt).
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const vaultAddress = requireContractAddress(network.name, "StratusVault");
  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const basketAddress = requireContractAddress(network.name, "StratusBasketToken");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");

  const pool = await ethers.getContractAt("ILendingPool", poolAddress);
  const basket = await ethers.getContractAt("StratusBasketToken", basketAddress);
  const gold = await ethers.getContractAt("IERC20Metadata", goldAddress);
  const stock = await ethers.getContractAt("IERC20Metadata", stockAddress);

  const basketAmount = ethers.parseEther("50");
  const [amountA, amountB] = await basket.previewComponents(basketAmount);
  console.log(`Recomposing 50 basket -> need ${ethers.formatEther(amountA)} GOLD-x + ${ethers.formatEther(amountB)} STOCK-x back`);

  const basketBefore = await basket.balanceOf(signer.address);
  console.log(`Basket balance before: ${ethers.formatEther(basketBefore)}`);

  console.log("\nStep 1: withdrawing both components from the pool to own wallet...");
  const withdrawATx = await pool.withdraw(goldAddress, amountA, signer.address);
  await withdrawATx.wait();
  console.log(`  GOLD-x withdraw tx: ${withdrawATx.hash}`);
  const withdrawBTx = await pool.withdraw(stockAddress, amountB, signer.address);
  await withdrawBTx.wait();
  console.log(`  STOCK-x withdraw tx: ${withdrawBTx.hash}`);

  console.log("\nStep 2: approving the vault for the withdrawn amounts...");
  await (await gold.approve(vaultAddress, amountA)).wait();
  await (await stock.approve(vaultAddress, amountB)).wait();

  console.log("\nStep 3: calling recomposeBasket(50)...");
  const vault = await ethers.getContractAt("StratusVault", vaultAddress);
  const tx = await vault.recomposeBasket(basketAmount);
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
    .find((parsed) => parsed?.name === "BasketRecomposed");
  if (!event) throw new Error("BasketRecomposed event not found");
  console.log("  BasketRecomposed event:", {
    basketAmount: ethers.formatEther(event.args.basketAmount),
    amountA: ethers.formatEther(event.args.amountA),
    amountB: ethers.formatEther(event.args.amountB),
  });

  const basketAfter = await basket.balanceOf(signer.address);
  console.log(`\nBasket balance after: ${ethers.formatEther(basketAfter)}`);

  const exact = basketAfter === basketBefore + basketAmount;
  console.log(`Recompose exact: ${exact ? "PASS" : "FAIL"}`);
  if (!exact) throw new Error("Recomposed basket amount did not match");

  console.log("\n=== GATE 3 (recompose/withdraw leg): PASSED ===");
  console.log(
    JSON.stringify(
      { withdrawGoldTx: withdrawATx.hash, withdrawStockTx: withdrawBTx.hash, recomposeTx: tx.hash },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
