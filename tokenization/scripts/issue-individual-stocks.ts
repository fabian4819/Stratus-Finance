import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as stocksConfig from "../config/individual-stocks.json";
import { saveContractAddress } from "./utils/deployments";
import { deployEquity, whitelist, mint, tokenReader } from "./lib/ats-client";
import { makeValidIsin } from "./lib/isin";

dotenv.config();

/**
 * Issues real individual stock trackers (AAPL-x, TSLA-x, MSFT-x, NVDA-x)
 * as ATS Equity securities on Hedera testnet — added alongside (not
 * replacing) the original GOLD-x/STOCK-x basket. See
 * docs/phase-4-individual-stocks.md. Each ticker is confirmed live on
 * RedStone's redstone-primary-prod data service.
 *
 * Same pattern as issue-assets.ts, reading tokenization/config/individual-stocks.json
 * instead. These are used directly as pool reserves (deposit/borrow), not
 * wrapped by StratusBasketToken.
 */

interface StockDef {
  key: string;
  name: string;
  symbol: string;
  currency: string;
  numberOfShares: string;
  decimals: number;
  isinPrefix11: string;
  redstoneFeedId: string;
}

async function main() {
  const rpcUrl = process.env.RPC_NODE_URL ?? "https://testnet.hashio.io/api";
  const privateKey = requireEnv("HEDERA_OPERATOR_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(rpcUrl, 296, { staticNetwork: true });
  const admin = new ethers.Wallet(privateKey, provider);

  console.log("Admin (issuer) address:", admin.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(admin.address)), "HBAR\n");

  const stocks = (stocksConfig as { assets: StockDef[] }).assets;

  for (const stock of stocks) {
    const isin = makeValidIsin(stock.isinPrefix11);
    console.log(`\nDeploying ${stock.symbol} ("${stock.name}", ISIN ${isin}) as an ATS Equity...`);

    const diamondAddress = await deployEquity(admin, {
      name: stock.name,
      symbol: stock.symbol,
      isin,
      decimals: stock.decimals,
      maxSupply: ethers.parseUnits(stock.numberOfShares, stock.decimals),
      currencyIso3: stock.currency,
    });
    console.log("  Diamond (token) address:", diamondAddress);

    console.log("  Whitelisting admin (required to hold tokens in whitelist mode)...");
    await whitelist(diamondAddress, admin, admin.address);

    const initialSupply = "10000"; // whole units, for demo funding
    console.log(`  Minting ${initialSupply} ${stock.symbol} to admin...`);
    await mint(diamondAddress, admin, admin.address, ethers.parseUnits(initialSupply, stock.decimals));

    const reader = tokenReader(diamondAddress, provider);
    console.log(
      "  Confirmed on-chain:",
      await reader.name(),
      await reader.symbol(),
      `(${await reader.decimals()} decimals)`,
      "balance:",
      ethers.formatUnits(await reader.balanceOf(admin.address), stock.decimals)
    );

    saveContractAddress("hederaTestnet", stock.key, diamondAddress);
  }

  console.log(
    "\nDone. Next: contracts/lib/bonzo/script/add-individual-stock-reserves.ts registers " +
      "these as pool reserves."
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
