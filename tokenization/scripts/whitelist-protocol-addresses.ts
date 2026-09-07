import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { loadDeployment } from "./utils/deployments";
import { whitelist } from "./lib/ats-client";

dotenv.config();

/**
 * Adds every protocol contract address that will hold or move GOLD-x /
 * STOCK-x to each asset's control list — the basket token wrapper, the
 * aToken contracts, StratusVault, and the demo liquidator account. This
 * is Phase 0 Spike #4 made concrete and repeatable — see
 * docs/phase-0-findings.md. Every one of these addresses would otherwise
 * hit `AccountIsBlocked` the same way the admin itself did before being
 * whitelisted in issue-assets.ts.
 *
 * Calls ATS diamond contracts directly (see tokenization/scripts/lib/ats-client.ts)
 * rather than through @hashgraph/asset-tokenization-sdk — see
 * docs/phase-0-findings.md Finding 1.
 *
 * Run after issue-assets.ts (assets exist) and whichever contract-deploy
 * step produced the address being whitelisted. Safe to re-run — `whitelist`
 * is a no-op if the address is already on the control list.
 */
async function main() {
  const rpcUrl = process.env.RPC_NODE_URL ?? "https://testnet.hashio.io/api";
  const privateKey = requireEnv("HEDERA_OPERATOR_PRIVATE_KEY"); // must hold ROLE_CONTROL_LIST on both assets

  const provider = new ethers.JsonRpcProvider(rpcUrl, 296, { staticNetwork: true });
  const admin = new ethers.Wallet(privateKey, provider);

  const deployment = loadDeployment("hederaTestnet");
  const assetKeys = ["GoldToken", "StockIndexToken"] as const;

  const protocolAddresses: Array<{ label: string; source: string; address: string | undefined }> = [
    {
      label: "StratusBasketToken",
      source: "deployments/hederaTestnet.json:StratusBasketToken",
      address: deployment.contracts["StratusBasketToken"],
    },
    { label: "aToken (Gold reserve)", source: "env:PROTOCOL_ADDRESS_ATOKEN_GOLD", address: process.env.PROTOCOL_ADDRESS_ATOKEN_GOLD },
    { label: "aToken (Stock reserve)", source: "env:PROTOCOL_ADDRESS_ATOKEN_STOCK", address: process.env.PROTOCOL_ADDRESS_ATOKEN_STOCK },
    { label: "StratusVault", source: "env:PROTOCOL_ADDRESS_VAULT", address: process.env.PROTOCOL_ADDRESS_VAULT },
    { label: "Demo liquidator", source: "env:PROTOCOL_ADDRESS_LIQUIDATOR_DEMO", address: process.env.PROTOCOL_ADDRESS_LIQUIDATOR_DEMO },
  ];

  for (const assetKey of assetKeys) {
    const diamondAddress = deployment.contracts[assetKey];
    if (!diamondAddress) {
      console.warn(`Skipping ${assetKey}: not found in deployments/hederaTestnet.json (run issue-assets.ts first)`);
      continue;
    }

    console.log(`\n${assetKey} (${diamondAddress}):`);

    for (const { label, source, address } of protocolAddresses) {
      if (!address) {
        console.warn(`  Skipping ${label}: not set yet (${source})`);
        continue;
      }
      await whitelist(diamondAddress, admin, address);
      console.log(`  Whitelisted ${label}: ${address}`);
    }
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
