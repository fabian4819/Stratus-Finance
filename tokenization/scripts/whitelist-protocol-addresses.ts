import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { loadDeployment } from "./utils/deployments";
import { whitelist } from "./lib/ats-client";

dotenv.config();

/**
 * Adds every protocol contract address that will hold or move GOLD-x /
 * STOCK-x to the relevant asset's control list — the basket token
 * wrapper, the per-asset aToken contract, StratusVault, and the demo
 * liquidator account. This is Phase 0 Spike #4 made concrete and
 * repeatable — see docs/phase-0-findings.md. Every one of these addresses
 * would otherwise hit `AccountIsBlocked` the same way the admin itself
 * did before being whitelisted in issue-assets.ts.
 *
 * Each entry declares which asset(s) it actually needs to be whitelisted
 * on — the Gold aToken only ever touches GOLD-x, for instance — so this
 * doesn't burn gas whitelisting addresses on control lists they'll never
 * be checked against.
 *
 * Calls ATS diamond contracts directly (see tokenization/scripts/lib/ats-client.ts)
 * rather than through @hashgraph/asset-tokenization-sdk — see
 * docs/phase-0-findings.md Finding 1.
 *
 * Run after issue-assets.ts (assets exist) and whichever contract-deploy
 * step produced the address being whitelisted. Safe to re-run — `whitelist`
 * is a no-op if the address is already on the control list.
 */

type AssetKey = "GoldToken" | "StockIndexToken";
const BOTH: AssetKey[] = ["GoldToken", "StockIndexToken"];

async function main() {
  const rpcUrl = process.env.RPC_NODE_URL ?? "https://testnet.hashio.io/api";
  const privateKey = requireEnv("HEDERA_OPERATOR_PRIVATE_KEY"); // must hold ROLE_CONTROL_LIST on both assets

  const provider = new ethers.JsonRpcProvider(rpcUrl, 296, { staticNetwork: true });
  const admin = new ethers.Wallet(privateKey, provider);

  const deployment = loadDeployment("hederaTestnet");

  const protocolAddresses: Array<{
    label: string;
    source: string;
    address: string | undefined;
    assetKeys: AssetKey[];
  }> = [
    {
      label: "StratusBasketToken",
      source: "deployments/hederaTestnet.json:StratusBasketToken",
      address: deployment.contracts["StratusBasketToken"],
      assetKeys: BOTH, // holds both components when decomposing/recomposing the basket
    },
    {
      label: "aToken (Gold reserve)",
      source: "env:PROTOCOL_ADDRESS_ATOKEN_GOLD",
      address: process.env.PROTOCOL_ADDRESS_ATOKEN_GOLD,
      assetKeys: ["GoldToken"],
    },
    {
      label: "aToken (Stock reserve)",
      source: "env:PROTOCOL_ADDRESS_ATOKEN_STOCK",
      address: process.env.PROTOCOL_ADDRESS_ATOKEN_STOCK,
      assetKeys: ["StockIndexToken"],
    },
    {
      // ATS's approve() rejects a blocked spender outright (confirmed by
      // decoding an AccountIsBlocked(address) revert naming the pool
      // proxy, not the aToken) - LendingPool.deposit calls
      // IERC20(asset).safeTransferFrom(msg.sender, aToken, amount), so the
      // pool proxy itself is the ERC20 "spender" and must be whitelisted,
      // in addition to the aToken it moves funds into.
      label: "LendingPool (proxy)",
      source: "deployments/hederaTestnet.json:LendingPool",
      address: deployment.contracts["LendingPool"],
      assetKeys: BOTH,
    },
    {
      label: "StratusVault",
      source: "env:PROTOCOL_ADDRESS_VAULT",
      address: process.env.PROTOCOL_ADDRESS_VAULT,
      assetKeys: BOTH, // decomposes/recomposes both components
    },
    {
      label: "Demo liquidator",
      source: "env:PROTOCOL_ADDRESS_LIQUIDATOR_DEMO",
      address: process.env.PROTOCOL_ADDRESS_LIQUIDATOR_DEMO,
      assetKeys: BOTH, // could seize either collateral leg depending on which one is stressed
    },
  ];

  for (const assetKey of BOTH) {
    const diamondAddress = deployment.contracts[assetKey];
    if (!diamondAddress) {
      console.warn(`Skipping ${assetKey}: not found in deployments/hederaTestnet.json (run issue-assets.ts first)`);
      continue;
    }

    console.log(`\n${assetKey} (${diamondAddress}):`);

    for (const { label, source, address, assetKeys } of protocolAddresses) {
      if (!assetKeys.includes(assetKey)) continue;
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
