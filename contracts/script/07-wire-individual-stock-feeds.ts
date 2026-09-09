import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";
import * as stocksConfig from "../../tokenization/config/individual-stocks.json";

/**
 * Wires the 11 individual stock tokens' RedStone feed ids on the
 * already-deployed StratusRedstoneOracle (setFeedId is a plain mapping
 * write — the oracle contract itself is already generic, no redeploy
 * needed, unlike StratusRiskView's immutable oracle reference). Run
 * after tokenization/scripts/issue-individual-stocks.ts (needs the token
 * addresses) — does NOT depend on the pool reserves existing yet, so this
 * can run before or after contracts/lib/bonzo/script/add-individual-stock-reserves.ts.
 *
 * Does not call updatePrice() for these — that's
 * script/update-redstone-prices.ts's job, extend its dataPackagesIds/loop
 * once these feed ids are wired.
 */
interface StockDef {
  key: string;
  symbol: string;
  redstoneFeedId: string;
}

async function main() {
  const oracleAddress = requireContractAddress(network.name, "StratusRedstoneOracle");
  const oracle = await ethers.getContractAt("StratusRedstoneOracle", oracleAddress);
  const toBytes32 = (s: string) => ethers.encodeBytes32String(s);

  const stocks = (stocksConfig as { assets: StockDef[] }).assets;

  for (const stock of stocks) {
    const tokenAddress = requireContractAddress(network.name, stock.key);
    const tx = await oracle.setFeedId(tokenAddress, toBytes32(stock.redstoneFeedId));
    await tx.wait();
    console.log(`${stock.symbol} -> ${stock.redstoneFeedId} (tx: ${tx.hash})`);
  }

  console.log("\nAll 11 individual stock feed ids wired.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
