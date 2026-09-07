import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/** One-off: mint basket tokens without redeeming, for Gate 3 setup. */
async function main() {
  const [signer] = await ethers.getSigners();
  const basketAddress = requireContractAddress(network.name, "StratusBasketToken");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");

  const basket = await ethers.getContractAt("StratusBasketToken", basketAddress);
  const gold = await ethers.getContractAt("IERC20Metadata", goldAddress);
  const stock = await ethers.getContractAt("IERC20Metadata", stockAddress);

  const basketAmount = ethers.parseEther("50");
  const [amountA, amountB] = await basket.previewComponents(basketAmount);
  console.log(`Need: ${ethers.formatEther(amountA)} GOLD-x + ${ethers.formatEther(amountB)} STOCK-x`);

  console.log("Approving...");
  await (await gold.approve(basketAddress, amountA)).wait();
  console.log(`  balance: ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} HBAR`);
  await (await stock.approve(basketAddress, amountB)).wait();
  console.log(`  balance: ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} HBAR`);

  console.log("Minting 50 basket tokens...");
  const tx = await basket.mint(basketAmount);
  const receipt = await tx.wait();
  console.log(`  tx: ${tx.hash} (gas used: ${receipt!.gasUsed})`);
  console.log(`  balance: ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} HBAR`);

  console.log("Basket balance:", ethers.formatEther(await basket.balanceOf(signer.address)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
