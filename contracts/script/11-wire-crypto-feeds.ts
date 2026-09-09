import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";
import * as cryptoConfig from "../config/borrowable-crypto.json";

/**
 * Wires the 20 MockCrypto tokens' RedStone feed ids on the
 * already-deployed StratusRedstoneOracle — same pattern as
 * 07-wire-individual-stock-feeds.ts, no oracle redeploy needed (feedIds
 * is a plain mapping).
 */
interface CryptoDef {
  key: string;
  symbol: string;
  redstoneFeedId: string;
}

async function main() {
  const oracleAddress = requireContractAddress(network.name, "StratusRedstoneOracle");
  const oracle = await ethers.getContractAt("StratusRedstoneOracle", oracleAddress);
  const toBytes32 = (s: string) => ethers.encodeBytes32String(s);

  const assets = (cryptoConfig as { assets: CryptoDef[] }).assets;

  for (const asset of assets) {
    const tokenAddress = requireContractAddress(network.name, asset.key);
    const tx = await oracle.setFeedId(tokenAddress, toBytes32(asset.redstoneFeedId));
    await tx.wait();
    console.log(`${asset.symbol} -> ${asset.redstoneFeedId} (tx: ${tx.hash})`);
  }

  console.log("\nAll 20 crypto feed ids wired.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
