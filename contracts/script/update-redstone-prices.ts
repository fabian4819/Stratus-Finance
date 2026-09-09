import * as dotenv from "dotenv";
import { providers, Wallet, Contract } from "ethers-v5";
import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { requireContractAddress, loadDeployment } from "./utils/deployments";
import * as stocksConfig from "../../tokenization/config/individual-stocks.json";

dotenv.config();

/**
 * Refreshes StratusRedstoneOracle's cached prices for GOLD-x, STOCK-x,
 * USDC, and every individual stock reserve wired so far
 * (tokenization/config/individual-stocks.json — skips any not yet issued,
 * so this stays runnable mid-rollout). Must be run before any operation
 * that needs a fresh price (deposit/borrow/liquidation/getUserRisk) —
 * RedStone's signed data has to be pulled and cached via a wrapped
 * `updatePrice(asset)` call; unlike Chainlink/Supra there is no
 * continuous on-chain push. See StratusRedstoneOracle.sol's
 * contract-level docs for the full architecture rationale.
 *
 * Uses ethers v5 (aliased as "ethers-v5" in package.json) because
 * @redstone-finance/evm-connector@0.9.0's WrapperBuilder is built against
 * the v5 Contract/Provider API — this repo's main hardhat/frontend tooling
 * stays on ethers v6 throughout; only this one script needs v5.
 */
const NETWORK = "hederaTestnet";
const RPC_URL = process.env.HEDERA_TESTNET_RPC_URL ?? "https://testnet.hashio.io/api";
const PRIVATE_KEY = process.env.HEDERA_TESTNET_OPERATOR_PRIVATE_KEY ?? "";

// PrimaryProdDataServiceConsumerBase's 5 hardcoded authorised signers
// (from @redstone-finance/evm-connector@0.9.0's contract source) — the SDK
// needs this list explicitly; it is not auto-derived from the contract.
const AUTHORIZED_SIGNERS = [
  "0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774",
  "0xdEB22f54738d54976C4c0fe5ce6d408E40d88499",
  "0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202",
  "0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE",
  "0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de",
];

const ORACLE_ABI = [
  "function updatePrice(address asset) external",
  "function feedIds(address asset) view returns (bytes32)",
];

interface StockDef {
  key: string;
  symbol: string;
  redstoneFeedId: string;
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("HEDERA_TESTNET_OPERATOR_PRIVATE_KEY not set");

  const oracleAddress = requireContractAddress(NETWORK, "StratusRedstoneOracle");
  const goldAddress = requireContractAddress(NETWORK, "GoldToken");
  const stockAddress = requireContractAddress(NETWORK, "StockIndexToken");
  const usdcAddress = requireContractAddress(NETWORK, "MockUSDC");

  const provider = new providers.JsonRpcProvider(RPC_URL, 296);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const oracle = new Contract(oracleAddress, ORACLE_ABI, wallet);

  const deployed = loadDeployment(NETWORK).contracts;
  const stocks = (stocksConfig as { assets: StockDef[] }).assets;
  const readyStocks: Array<StockDef & { asset: string }> = [];
  const skipped: string[] = [];
  for (const s of stocks) {
    const asset = deployed[s.key];
    if (!asset) {
      skipped.push(`${s.symbol} (not issued yet)`);
      continue;
    }
    const feedId: string = await oracle.feedIds(asset);
    if (/^0x0+$/.test(feedId)) {
      skipped.push(`${s.symbol} (feed id not wired yet — run 07-wire-individual-stock-feeds.ts)`);
      continue;
    }
    readyStocks.push({ ...s, asset });
  }
  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length}: ${skipped.join(", ")}`);
  }

  const targets: Array<{ label: string; asset: string }> = [
    { label: "GOLD-x (XAU)", asset: goldAddress },
    { label: "STOCK-x (USA500.Y)", asset: stockAddress },
    { label: "USDC", asset: usdcAddress },
    ...readyStocks.map((s) => ({ label: `${s.symbol} (${s.redstoneFeedId})`, asset: s.asset })),
  ];
  const dataPackagesIds = ["XAU", "USA500.Y", "USDC", ...readyStocks.map((s) => s.redstoneFeedId)];

  // `as any`: WrapperBuilder's own type declarations resolve `ethers.Contract`
  // against evm-connector's nested @ethersproject/* copy, which npm hoists
  // separately from this file's own "ethers-v5" alias resolution — same
  // runtime shape, structurally "different" types to the compiler. A pure
  // interop cast, not a real type-safety gap.
  const wrapped = WrapperBuilder.wrap(oracle as any).usingDataService({
    dataServiceId: "redstone-primary-prod",
    dataPackagesIds,
    uniqueSignersCount: 3,
    authorizedSigners: AUTHORIZED_SIGNERS,
  });

  for (const { label, asset } of targets) {
    console.log(`Updating ${label}...`);
    const tx = await wrapped.updatePrice(asset);
    const receipt = await tx.wait();
    console.log(`  tx: ${receipt.transactionHash}`);
  }

  console.log("\nAll prices refreshed.");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exitCode = 1;
});
