import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as stocksConfig from "../config/individual-stocks.json";
import { loadDeployment } from "./utils/deployments";
import { whitelist } from "./lib/ats-client";

dotenv.config();

/**
 * Whitelists the LendingPool proxy and each stock's own aToken on that
 * stock's ATS control list — the same two addresses
 * whitelist-protocol-addresses.ts adds for GOLD-x/STOCK-x, minus
 * StratusBasketToken/StratusVault/the demo liquidator, since individual
 * stocks are deposited directly into the pool (same pattern as
 * demo-liquidation.ts), not through the basket wrapper.
 *
 * LendingPool must be whitelisted because ATS's approve()/transferFrom
 * checks the SPENDER, not just the transfer parties — LendingPool.deposit
 * calls IERC20(asset).safeTransferFrom(msg.sender, aToken, amount), so
 * the pool proxy is the ERC20 spender (see docs/phase-0-findings.md /
 * docs/ats-friction.md). The aToken must be whitelisted since it's the
 * transfer recipient.
 *
 * Safe to re-run — whitelist() is a no-op if already on the control list.
 */
interface StockDef {
  key: string;
  symbol: string;
}

async function main() {
  const rpcUrl = process.env.RPC_NODE_URL ?? "https://testnet.hashio.io/api";
  const privateKey = requireEnv("HEDERA_OPERATOR_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(rpcUrl, 296, { staticNetwork: true });
  const admin = new ethers.Wallet(privateKey, provider);

  const deployment = loadDeployment("hederaTestnet");
  const lendingPoolAddress = deployment.contracts["LendingPool"];
  if (!lendingPoolAddress) throw new Error("LendingPool not found in deployments/hederaTestnet.json");

  const stocks = (stocksConfig as { assets: StockDef[] }).assets;

  for (const stock of stocks) {
    const diamondAddress = deployment.contracts[stock.key];
    const aTokenAddress = deployment.contracts[`aToken_${stock.symbol}`];
    if (!diamondAddress) {
      console.warn(`Skipping ${stock.symbol}: token not issued yet`);
      continue;
    }
    if (!aTokenAddress) {
      console.warn(`Skipping ${stock.symbol}: aToken not found (run add-individual-stock-reserves.ts first)`);
      continue;
    }

    console.log(`\n${stock.symbol} (${diamondAddress}):`);

    await whitelist(diamondAddress, admin, lendingPoolAddress);
    console.log(`  Whitelisted LendingPool (proxy): ${lendingPoolAddress}`);

    await whitelist(diamondAddress, admin, aTokenAddress);
    console.log(`  Whitelisted aToken (${stock.symbol} reserve): ${aTokenAddress}`);
  }
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
