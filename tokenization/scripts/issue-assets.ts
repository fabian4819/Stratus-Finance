import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as assetsConfig from "../config/assets.json";
import { saveContractAddress } from "./utils/deployments";
import { deployEquity, whitelist, mint, tokenReader } from "./lib/ats-client";
import { makeValidIsin } from "./lib/isin";

dotenv.config();

/**
 * Issues GOLD-x and STOCK-x as real ATS Equity securities on Hedera
 * testnet, whitelists the admin (required even for the issuer itself in
 * whitelist mode — see docs/phase-0-findings.md Finding 3), mints an
 * initial demo supply, and writes their addresses to
 * deployments/hederaTestnet.json — PLAN.md Phase 1.
 *
 * Calls ATS diamond contracts directly (via tokenization/scripts/lib/ats-client.ts)
 * rather than through @hashgraph/asset-tokenization-sdk — see
 * docs/phase-0-findings.md Finding 1 for why. Network name is
 * `network: "testnet"`.
 *
 * Requires tokenization/.env populated from .env.example.
 */

interface AssetDef {
  key: string;
  name: string;
  symbol: string;
  currency: string;
  numberOfShares: string;
  decimals: number;
  isinPrefix11: string; // 2-letter country + 9 alphanumeric, checksum computed at runtime
}

async function main() {
  const rpcUrl = process.env.RPC_NODE_URL ?? "https://testnet.hashio.io/api";
  const privateKey = requireEnv("HEDERA_OPERATOR_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(rpcUrl, 296, { staticNetwork: true });
  const admin = new ethers.Wallet(privateKey, provider);

  console.log("Admin (issuer) address:", admin.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(admin.address)), "HBAR\n");

  const assets = (assetsConfig as { assets: AssetDef[] }).assets;

  for (const asset of assets) {
    const isin = makeValidIsin(asset.isinPrefix11);
    console.log(`\nDeploying ${asset.symbol} ("${asset.name}", ISIN ${isin}) as an ATS Equity...`);

    const diamondAddress = await deployEquity(admin, {
      name: asset.name,
      symbol: asset.symbol,
      isin,
      decimals: asset.decimals,
      maxSupply: ethers.parseUnits(asset.numberOfShares, asset.decimals),
      currencyIso3: asset.currency,
    });
    console.log("  Diamond (token) address:", diamondAddress);

    console.log("  Whitelisting admin (required to hold tokens in whitelist mode)...");
    await whitelist(diamondAddress, admin, admin.address);

    const initialSupply = "10000"; // whole units, for demo funding
    console.log(`  Minting ${initialSupply} ${asset.symbol} to admin...`);
    await mint(diamondAddress, admin, admin.address, ethers.parseUnits(initialSupply, asset.decimals));

    const reader = tokenReader(diamondAddress, provider);
    console.log(
      "  Confirmed on-chain:",
      await reader.name(),
      await reader.symbol(),
      `(${await reader.decimals()} decimals)`,
      "balance:",
      ethers.formatUnits(await reader.balanceOf(admin.address), asset.decimals)
    );

    // deployments/<network>.json keys the EVM address, since that's what
    // every downstream Solidity contract (StratusBasketToken, the pool)
    // needs — the ISIN/Hedera-native details are only useful to further
    // ATS calls.
    saveContractAddress("hederaTestnet", asset.key, diamondAddress);
  }

  console.log(
    "\nDone. Next: contracts/script/01-deploy-basket-token.ts reads GoldToken/StockIndexToken " +
      "from deployments/hederaTestnet.json."
  );
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
