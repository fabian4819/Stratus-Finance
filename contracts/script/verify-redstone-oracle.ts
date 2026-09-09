import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

async function main() {
  const oracleAddress = requireContractAddress(network.name, "StratusRedstoneOracle");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");

  const oracle = await ethers.getContractAt("StratusRedstoneOracle", oracleAddress);

  for (const [label, asset] of [
    ["GOLD-x (real gold, XAU)", goldAddress],
    ["STOCK-x (real S&P 500, USA500.Y)", stockAddress],
    ["USDC", usdcAddress],
  ] as const) {
    const price = await oracle.getAssetPrice(asset);
    console.log(`${label}: $${Number(price) / 1e18}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
