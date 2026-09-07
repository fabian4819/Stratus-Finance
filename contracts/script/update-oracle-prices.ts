import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * Fetches fresh price updates from Pyth Hermes (requires an API key since
 * 2026-08-26 - see docs/phase-2-findings.md) and pushes them on-chain via
 * StratusPriceOracle.updatePriceFeeds. Run this before any action that
 * needs getAssetPrice/getUserAccountData to succeed (borrow, liquidate,
 * or just checking account health) - Hedera testnet's Pyth cache is a
 * pull oracle nobody else keeps warm.
 */

const IPyth_GET_UPDATE_FEE_ABI = ["function getUpdateFee(bytes[] calldata updateData) view returns (uint256)"];

interface HermesResponse {
  binary: { data: string[]; encoding: string };
}

async function fetchUpdateData(feedIds: string[], apiKey: string): Promise<string[]> {
  const params = feedIds.map((id) => `ids[]=${id}`).join("&");
  const url = `https://hermes.pyth.network/v2/updates/price/latest?${params}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    throw new Error(`Hermes request failed: ${res.status} ${res.statusText} - ${await res.text()}`);
  }
  const body = (await res.json()) as HermesResponse;
  return body.binary.data.map((hex) => (hex.startsWith("0x") ? hex : `0x${hex}`));
}

async function main() {
  const [signer] = await ethers.getSigners();
  const apiKey = requireEnv("PYTH_HERMES_API_KEY");
  const pythAddress = requireEnv("PYTH_CONTRACT_ADDRESS");
  const feedIds = [
    requireEnv("PYTH_FEED_ID_XAU_USD"),
    requireEnv("PYTH_FEED_ID_STOCK_INDEX"),
    requireEnv("PYTH_FEED_ID_USDC_USD"),
  ];

  console.log("Fetching fresh price updates from Hermes...");
  const updateData = await fetchUpdateData(feedIds, apiKey);
  console.log(`  Got ${updateData.length} update blob(s)`);

  const pyth = await ethers.getContractAt(IPyth_GET_UPDATE_FEE_ABI, pythAddress);
  const rawFee: bigint = await pyth.getUpdateFee(updateData);

  // Hedera's native HBAR only has 8 decimal places (1 tinybar); the EVM
  // JSON-RPC layer represents value in 18-decimal "wei" for compatibility,
  // so any value below 1 tinybar (1e10 wei) silently rounds down to zero
  // when actually transferred - a raw Pyth fee of a few wei would arrive
  // on-chain as msg.value=0 and fail our own "insufficient fee" check.
  // Round up to the nearest whole tinybar.
  const TINYBAR_IN_WEI = 10_000_000_000n;
  const fee = rawFee === 0n ? 0n : ((rawFee + TINYBAR_IN_WEI - 1n) / TINYBAR_IN_WEI) * TINYBAR_IN_WEI;
  console.log(`  Raw Pyth fee: ${rawFee} wei -> sending ${ethers.formatEther(fee)} HBAR (rounded up to 1 tinybar)`);

  const oracleAddress = requireContractAddress(network.name, "StratusPriceOracle");
  const oracle = await ethers.getContractAt("StratusPriceOracle", oracleAddress);

  console.log("Pushing update on-chain via StratusPriceOracle.updatePriceFeeds...");
  const tx = await oracle.updatePriceFeeds(updateData, { value: fee });
  const receipt = await tx.wait();
  console.log(`  tx: ${tx.hash} (gas used: ${receipt!.gasUsed})`);

  console.log("\n=== Oracle prices refreshed ===");
  for (const [label, asset] of [
    ["GoldToken", requireContractAddress(network.name, "GoldToken")],
    ["StockIndexToken", requireContractAddress(network.name, "StockIndexToken")],
    ["MockUSDC", requireContractAddress(network.name, "MockUSDC")],
  ] as const) {
    const price = await oracle.getAssetPrice(asset);
    console.log(`  ${label}: $${ethers.formatEther(price)}`);
  }

  console.log(`\nSigner balance after: ${ethers.formatEther(await ethers.provider.getBalance(signer.address))} HBAR`);
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
