import * as dotenv from "dotenv";
import { loadDeployment } from "./utils/deployments";

dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Network, Security, Role } = require("@hashgraph/asset-tokenization-sdk");

/**
 * Grants the "Control list Role" to the operator (if not already held) and
 * adds every protocol contract address that will hold or move GOLD-x /
 * STOCK-x to each asset's control list — the aToken contracts, the
 * StratusVault, and the demo liquidator account. This is Phase 0 Spike #3
 * made concrete, and must succeed before Phase 2/3 deploy scripts can move
 * real ATS tokens through the pool. See PLAN.md §6.2.
 *
 * Run after both `issue-assets.ts` (assets exist) and the Phase 2 pool
 * deploy (aToken addresses exist) and the Phase 3 vault deploy.
 */
async function main() {
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");

  await Network.init({
    network: "testnet",
    mirrorNode: { name: "testnet", url: process.env.MIRROR_NODE_URL },
    rpcNode: { name: "testnet", url: process.env.RPC_NODE_URL },
    configuration: {
      factories: [{ id: requireEnv("ATS_FACTORY_ID"), network: "testnet" }],
      resolvers: [{ id: requireEnv("ATS_RESOLVER_ID"), network: "testnet" }],
    },
  });
  await Network.connect({
    account: { accountId: operatorId },
    network: "testnet",
    mirrorNode: { name: "testnet", url: process.env.MIRROR_NODE_URL },
    rpcNode: { name: "testnet", url: process.env.RPC_NODE_URL },
  });

  const deployment = loadDeployment("hederaTestnet");
  const assetKeys = ["GoldToken", "StockIndexToken"] as const;

  const protocolAddresses = [
    { label: "aToken (Gold reserve)", envVar: "PROTOCOL_ADDRESS_ATOKEN_GOLD" },
    { label: "aToken (Stock reserve)", envVar: "PROTOCOL_ADDRESS_ATOKEN_STOCK" },
    { label: "StratusVault", envVar: "PROTOCOL_ADDRESS_VAULT" },
    { label: "Demo liquidator", envVar: "PROTOCOL_ADDRESS_LIQUIDATOR_DEMO" },
  ];

  for (const assetKey of assetKeys) {
    const securityId = deployment.contracts[assetKey];
    if (!securityId) {
      console.warn(`Skipping ${assetKey}: not found in deployments/hederaTestnet.json (run issue-assets.ts first)`);
      continue;
    }

    console.log(`\n${assetKey} (${securityId}):`);

    // Ensure the operator itself holds the Control list Role before it can
    // call addToControlList — no-op if already granted.
    await Role.grantRole({ securityId, targetId: operatorId, role: "CONTROL_LIST_ROLE" });

    for (const { label, envVar } of protocolAddresses) {
      const address = process.env[envVar];
      if (!address) {
        console.warn(`  Skipping ${label}: ${envVar} not set in tokenization/.env`);
        continue;
      }
      await Security.addToControlList({ securityId, targetId: address });
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
