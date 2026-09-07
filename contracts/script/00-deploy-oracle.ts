import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";

/**
 * Deploys StratusPriceOracle and wires it to GoldToken/StockIndexToken/
 * MockUSDC's Pyth feeds. Requires Phase 1's assets already deployed
 * (deployments/<network>.json has GoldToken, StockIndexToken, MockUSDC) —
 * see contracts/script/README.md for order.
 *
 * All three feed IDs come from Phase 0 spike #2 (docs/phase-0-findings.md):
 * XAU/USD exists, no real equity/stock-index feed exists at all on Hedera
 * testnet's Pyth deployment (substituted ETH/USD per PLAN.md §6.1), and
 * USDC/USD exists. Every feed was stale when checked — StratusPriceOracle
 * needs `updatePriceFeeds` called with fresh Hermes data before any read
 * that must pass the staleness check; this script only wires the feed IDs,
 * it doesn't warm the cache.
 */
async function main() {
  const pythAddress = requireEnv("PYTH_CONTRACT_ADDRESS");
  const feedXau = requireEnv("PYTH_FEED_ID_XAU_USD");
  const feedStockIndex = requireEnv("PYTH_FEED_ID_STOCK_INDEX");
  const feedUsdc = requireEnv("PYTH_FEED_ID_USDC_USD");

  const maxPriceAgeSeconds = 60; // reject any Pyth price older than 60s on the liquidation path

  const StratusPriceOracle = await ethers.getContractFactory("StratusPriceOracle");
  const oracle = await StratusPriceOracle.deploy(pythAddress, maxPriceAgeSeconds);
  await oracle.waitForDeployment();

  const address = await oracle.getAddress();
  console.log(`StratusPriceOracle deployed to ${address}`);
  saveContractAddress(network.name, "StratusPriceOracle", address);

  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");

  console.log("\nWiring feeds...");
  for (const [label, asset, feed] of [
    ["GoldToken", goldAddress, feedXau],
    ["StockIndexToken", stockAddress, feedStockIndex],
    ["MockUSDC", usdcAddress, feedUsdc],
  ] as const) {
    const tx = await oracle.setFeed(asset, feed);
    await tx.wait();
    console.log(`  ${label} (${asset}) -> feed ${feed} (tx: ${tx.hash})`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not set — see contracts/.env.example`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
