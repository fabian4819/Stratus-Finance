import * as dotenv from "dotenv";
import * as assetsConfig from "../config/assets.json";
import { saveContractAddress } from "./utils/deployments";

dotenv.config();

/**
 * Issues GOLD-x and STOCK-x as ATS Equity securities on Hedera testnet,
 * then mints an initial supply to the operator account for demo funding —
 * PLAN.md Phase 1.
 *
 * API surface (Network.init/connect, Equity.create, Security.issue) is
 * taken directly from the `@hashgraph/asset-tokenization-sdk` README
 * (packages/ats/sdk/README.md in hashgraph/asset-tokenization-studio) —
 * confirmed real method namespaces, not invented. Exact TypeScript import
 * paths/parameter object shapes should be checked against the installed
 * package's type declarations the first time this is run (`npm install`
 * has not been exercised against this script yet); treat the shapes below
 * as "per the documented Request fields," to be adjusted to match the
 * actual exported types if they've drifted from the README.
 *
 * Requires tokenization/.env populated from .env.example.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Network, Equity, Security } = require("@hashgraph/asset-tokenization-sdk");

interface AssetDef {
  key: string;
  name: string;
  symbol: string;
  isin: string;
  currency: string;
  numberOfShares: string;
  nominalValue: string;
  nominalValueDecimals: number;
  decimals: number;
  regulationType: number;
  regulationSubType: number;
  isCountryControlListWhiteList: boolean;
  countries: string;
}

async function main() {
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");
  requireEnv("HEDERA_OPERATOR_PRIVATE_KEY");

  // --- Step 1: initialise + connect, per the SDK's documented two-step setup ---
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

  // --- Step 2: issue each configured asset as an Equity ---
  const assets = (assetsConfig as { assets: AssetDef[] }).assets;

  for (const asset of assets) {
    console.log(`\nDeploying ${asset.symbol} ("${asset.name}") as an ATS Equity...`);

    const created = await Equity.create({
      diamondOwnerAccount: operatorId,
      votingRight: false,
      informationRight: false,
      liquidationRight: false,
      subscriptionRight: false,
      conversionRight: false,
      redemptionRight: false,
      putRight: false,
      dividendRight: false,
      currency: toHexCurrency(asset.currency),
      numberOfShares: asset.numberOfShares,
      nominalValue: asset.nominalValue,
      nominalValueDecimals: asset.nominalValueDecimals,
      regulationType: asset.regulationType,
      regulationSubType: asset.regulationSubType,
      isCountryControlListWhiteList: asset.isCountryControlListWhiteList,
      countries: asset.countries,
      security: { name: asset.name, symbol: asset.symbol, isin: asset.isin, decimals: asset.decimals },
    });

    const securityId = created.securityViewModel.diamondAddress;
    const evmAddress = created.securityViewModel.evmDiamondAddress;
    console.log(`  Hedera id: ${securityId}, EVM address: ${evmAddress}`);
    console.log(`  Deploy tx: ${created.transactionId}`);

    // --- Step 3: mint initial demo supply to the operator ---
    const initialSupply = "10000"; // whole units; SDK expects amount "with decimals included" per README
    await Security.issue({
      securityId,
      targetId: operatorId,
      amount: toBaseUnits(initialSupply, asset.decimals),
    });
    console.log(`  Minted ${initialSupply} ${asset.symbol} to operator (${operatorId})`);

    // deployments/<network>.json keys the EVM address, since that's what
    // every downstream Solidity contract (StratusBasketToken, the pool)
    // needs — the Hedera-native id is only useful to further SDK calls.
    saveContractAddress("hederaTestnet", asset.key, evmAddress);
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

function toHexCurrency(iso3: string): string {
  return "0x" + Buffer.from(iso3, "ascii").toString("hex");
}

function toBaseUnits(wholeAmount: string, decimals: number): string {
  return (BigInt(wholeAmount) * 10n ** BigInt(decimals)).toString();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
