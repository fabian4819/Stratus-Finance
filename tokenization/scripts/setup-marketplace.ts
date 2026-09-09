import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as stocksConfig from "../config/individual-stocks.json";
import { loadDeployment } from "./utils/deployments";
import { whitelist, grantRole, transferContract, mint, ATS_ROLES } from "./lib/ats-client";

dotenv.config();

/**
 * Wires StratusMarketplace up on all 12 sellable tokens (GOLD-x, STOCK-x,
 * 10 individual stocks): whitelists the marketplace contract itself
 * (needed to hold/move balances at all), grants it ROLE_CONTROL_LIST (so
 * it can whitelist first-time buyers atomically inside buy() — see
 * StratusMarketplace.sol's docs), transfers starting inventory from the
 * admin's existing pre-minted supply, and marks the token sellable on
 * the marketplace contract.
 *
 * Run after contracts/script/09-deploy-marketplace.ts. Safe to re-run —
 * whitelist/grantRole are no-ops if already done; inventory transfer
 * amount is fixed per run (re-running tops up by another INVENTORY_AMOUNT).
 */
const INVENTORY_AMOUNT = "1000"; // whole units per token, out of the 10000 originally minted to admin

interface StockDef {
  key: string;
  symbol: string;
  decimals: number;
}

async function main() {
  const rpcUrl = process.env.RPC_NODE_URL ?? "https://testnet.hashio.io/api";
  const privateKey = requireEnv("HEDERA_OPERATOR_PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(rpcUrl, 296, { staticNetwork: true });
  const admin = new ethers.Wallet(privateKey, provider);

  const deployment = loadDeployment("hederaTestnet");
  const marketplaceAddress = deployment.contracts["StratusMarketplace"];
  if (!marketplaceAddress) throw new Error("StratusMarketplace not deployed yet");

  const stocks = (stocksConfig as { assets: StockDef[] }).assets;
  const tokens: Array<{ key: string; symbol: string; decimals: number }> = [
    { key: "GoldToken", symbol: "GOLD-x", decimals: 18 },
    { key: "StockIndexToken", symbol: "STOCK-x", decimals: 18 },
    ...stocks.map((s) => ({ key: s.key, symbol: s.symbol, decimals: s.decimals })),
  ];

  const marketplace = new ethers.Contract(
    marketplaceAddress,
    ["function setSellable(address token, bool isSellable) external"],
    admin
  );

  for (const token of tokens) {
    const diamondAddress = deployment.contracts[token.key];
    if (!diamondAddress) {
      console.warn(`Skipping ${token.symbol}: not found in deployments/hederaTestnet.json`);
      continue;
    }
    console.log(`\n${token.symbol} (${diamondAddress}):`);

    await whitelist(diamondAddress, admin, marketplaceAddress);
    console.log("  Whitelisted marketplace on control list");

    await grantRole(diamondAddress, admin, ATS_ROLES.ROLE_CONTROL_LIST, marketplaceAddress);
    console.log("  Granted ROLE_CONTROL_LIST to marketplace");

    const inventoryAmount = ethers.parseUnits(INVENTORY_AMOUNT, token.decimals);
    const reader = new ethers.Contract(diamondAddress, ["function balanceOf(address) view returns (uint256)"], provider);
    const adminBalance: bigint = await reader.balanceOf(admin.address);
    if (adminBalance < inventoryAmount) {
      const topUp = inventoryAmount - adminBalance + ethers.parseUnits("100", token.decimals); // small buffer
      await mint(diamondAddress, admin, admin.address, topUp);
      console.log(`  Admin balance (${ethers.formatUnits(adminBalance, token.decimals)}) too low — minted ${ethers.formatUnits(topUp, token.decimals)} more`);
    }

    const transfer = transferContract(diamondAddress, admin);
    const tx = await transfer.transfer(marketplaceAddress, inventoryAmount, { gasLimit: 500_000 });
    await tx.wait();
    console.log(`  Transferred ${INVENTORY_AMOUNT} ${token.symbol} inventory to marketplace`);

    const sellableTx = await marketplace.setSellable(diamondAddress, true);
    await sellableTx.wait();
    console.log("  Marked sellable");
  }

  console.log("\nDone. StratusMarketplace is live for all 12 tokens.");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} — see tokenization/.env.example`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
