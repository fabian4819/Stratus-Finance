import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md oracle-track: deploys StratusRedstoneOracle, wires GOLD-x -> real
 * XAU (gold) and STOCK-x -> real USA500.Y (S&P 500 index), both confirmed
 * live on RedStone's redstone-primary-prod data service (see
 * docs/phase-3-oracle-research.md). USDC -> real "USDC" feed too, so the
 * whole pool reads from one oracle. Does NOT point the pool at it yet —
 * that's a separate setPriceOracle call once prices are confirmed fresh
 * (see script/update-redstone-prices.ts, must run first).
 */
const MAX_PRICE_AGE_SECONDS = 3600; // 1 hour

async function main() {
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");

  const Oracle = await ethers.getContractFactory("StratusRedstoneOracle");
  const oracle = await Oracle.deploy(MAX_PRICE_AGE_SECONDS);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log(`StratusRedstoneOracle deployed to ${oracleAddress}`);
  saveContractAddress(network.name, "StratusRedstoneOracle", oracleAddress);

  const toBytes32 = (s: string) => ethers.encodeBytes32String(s);

  await (await oracle.setFeedId(goldAddress, toBytes32("XAU"))).wait();
  console.log("GOLD-x -> XAU (real gold spot)");
  await (await oracle.setFeedId(stockAddress, toBytes32("USA500.Y"))).wait();
  console.log("STOCK-x -> USA500.Y (real S&P 500 index)");
  await (await oracle.setFeedId(usdcAddress, toBytes32("USDC"))).wait();
  console.log("USDC -> USDC (real stablecoin price)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
