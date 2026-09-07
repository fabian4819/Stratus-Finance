import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";

/**
 * Deploys StratusBasketToken over the ATS-issued GOLD-x / STOCK-x
 * addresses written by `tokenization/scripts/issue-assets.ts`. Fixed 50/50
 * ratio per PLAN.md §0 (hackathon scope: two assets, fixed ratio).
 */
async function main() {
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");

  const RATIO_A_BPS = 5_000; // 50% gold / 50% stock-index

  const StratusBasketToken = await ethers.getContractFactory("StratusBasketToken");
  const basket = await StratusBasketToken.deploy(
    "Stratus ETF",
    "sETF",
    goldAddress,
    stockAddress,
    RATIO_A_BPS
  );
  await basket.waitForDeployment();

  const address = await basket.getAddress();
  console.log(`StratusBasketToken deployed to ${address}`);
  saveContractAddress(network.name, "StratusBasketToken", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
