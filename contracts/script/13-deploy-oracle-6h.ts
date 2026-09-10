import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";
import * as stocksConfig from "../../tokenization/config/individual-stocks.json";
import * as cryptoConfig from "../config/borrowable-crypto.json";

/**
 * Redeploys StratusRedstoneOracle with maxPriceAge raised from 1 hour to
 * 6 hours — reduces how often script/update-redstone-prices.ts must run
 * to keep the pool's cached price from going stale, at the cost of the
 * pool's deposit/borrow/liquidation math potentially using a price up to
 * 6 hours old (display prices via StratusLivePriceReader are unaffected
 * either way — always real-time, separate code path).
 *
 * Wires all 33 feed ids (GOLD-x, STOCK-x, USDC, 10 stocks, 20 crypto).
 * Does NOT yet: point the pool at it, redeploy StratusRiskView, or
 * redeploy StratusMarketplace — both of those have an immutable
 * reference to the old oracle and need their own redeploy/rewire, done
 * in separate scripts once prices are confirmed fresh on this one.
 */
const MAX_PRICE_AGE_SECONDS = 6 * 60 * 60; // 6 hours

interface AssetDef {
  key: string;
  symbol: string;
  redstoneFeedId: string;
}

async function main() {
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");

  const Oracle = await ethers.getContractFactory("StratusRedstoneOracle");
  const oracle = await Oracle.deploy(MAX_PRICE_AGE_SECONDS);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log(`StratusRedstoneOracle (6h) deployed to ${oracleAddress}`);
  saveContractAddress(network.name, "StratusRedstoneOracle", oracleAddress);

  const toBytes32 = (s: string) => ethers.encodeBytes32String(s);

  await (await oracle.setFeedId(goldAddress, toBytes32("XAU"))).wait();
  console.log("GOLD-x -> XAU");
  await (await oracle.setFeedId(stockAddress, toBytes32("USA500.Y"))).wait();
  console.log("STOCK-x -> USA500.Y");
  await (await oracle.setFeedId(usdcAddress, toBytes32("USDC"))).wait();
  console.log("USDC -> USDC");

  const stocks = (stocksConfig as { assets: AssetDef[] }).assets;
  for (const s of stocks) {
    const tokenAddress = requireContractAddress(network.name, s.key);
    await (await oracle.setFeedId(tokenAddress, toBytes32(s.redstoneFeedId))).wait();
    console.log(`${s.symbol} -> ${s.redstoneFeedId}`);
  }

  const cryptos = (cryptoConfig as { assets: AssetDef[] }).assets;
  for (const c of cryptos) {
    const tokenAddress = requireContractAddress(network.name, c.key);
    await (await oracle.setFeedId(tokenAddress, toBytes32(c.redstoneFeedId))).wait();
    console.log(`${c.symbol} -> ${c.redstoneFeedId}`);
  }

  console.log("\nAll 33 feed ids wired on the new 6h oracle.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
