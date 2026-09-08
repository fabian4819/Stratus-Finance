import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";

/**
 * Deploys StratusChainlinkPriceOracle and wires it to real, live Chainlink
 * feeds on Hedera testnet - see docs/phase-2-findings.md for why the pool
 * is pivoting to this instead of the originally-designed Pyth-backed
 * StratusPriceOracle (still in the codebase, still tested, blocked by
 * Pyth infrastructure outside this repo's control).
 *
 * Feed addresses confirmed live at integration time via
 * https://reference-data-directory.vercel.app/feeds-hedera-testnet.json
 * and a direct latestRoundData() call (all updated within the last few
 * hours, well under the 86400s heartbeat). No commodities/equities feed
 * exists on Hedera testnet from Chainlink either (mirrors the Pyth
 * finding) - GOLD-x maps to HBAR/USD (Hedera's native asset - fitting for
 * a Hedera-track submission) and STOCK-x maps to ETH/USD (the same
 * volatile-leg substitution already used for the Pyth design, so the
 * "which leg is riskier" story stays consistent). Both are honest
 * substitutions, not real gold/equity prices - same disclosure as before.
 */
const CHAINLINK_FEEDS_HEDERA_TESTNET = {
  HBAR_USD: "0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a",
  ETH_USD: "0xb9d461e0b962aF219866aDfA7DD19C52bB9871b9",
  USDC_USD: "0xb632a7e7e02d76c0Ce99d9C62c7a2d1B5F92B6B5",
};

async function main() {
  const maxPriceAgeSeconds = 90_000; // ~25h - Chainlink's Hedera testnet feeds have an 86400s heartbeat

  const StratusChainlinkPriceOracle = await ethers.getContractFactory("StratusChainlinkPriceOracle");
  const oracle = await StratusChainlinkPriceOracle.deploy(maxPriceAgeSeconds);
  await oracle.waitForDeployment();

  const address = await oracle.getAddress();
  console.log(`StratusChainlinkPriceOracle deployed to ${address}`);
  saveContractAddress(network.name, "StratusChainlinkPriceOracle", address);

  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");

  console.log("\nWiring feeds...");
  for (const [label, asset, feed] of [
    ["GoldToken (-> HBAR/USD)", goldAddress, CHAINLINK_FEEDS_HEDERA_TESTNET.HBAR_USD],
    ["StockIndexToken (-> ETH/USD)", stockAddress, CHAINLINK_FEEDS_HEDERA_TESTNET.ETH_USD],
    ["MockUSDC (-> USDC/USD)", usdcAddress, CHAINLINK_FEEDS_HEDERA_TESTNET.USDC_USD],
  ] as const) {
    const tx = await oracle.setFeed(asset, feed);
    await tx.wait();
    console.log(`  ${label}: ${asset} -> ${feed} (tx: ${tx.hash})`);
  }

  console.log("\nReading back live prices to confirm...");
  for (const [label, asset] of [
    ["GoldToken", goldAddress],
    ["StockIndexToken", stockAddress],
    ["MockUSDC", usdcAddress],
  ] as const) {
    const price = await oracle.getAssetPrice(asset);
    console.log(`  ${label}: $${ethers.formatEther(price)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
