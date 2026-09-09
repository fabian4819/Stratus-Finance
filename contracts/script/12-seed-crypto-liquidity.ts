import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";
import * as cryptoConfig from "../config/borrowable-crypto.json";

/**
 * Deposits half the deployer's minted MockCrypto supply (500,000 of the
 * 1,000,000 minted per token in 10-deploy-borrowable-crypto.ts) into the
 * pool as supplied liquidity — without this, enableBorrowingOnReserve
 * alone doesn't give anyone anything to actually borrow (Aave v2 checks
 * the pool's real aToken-held balance, not just the borrow-enabled flag).
 * The other half stays in the deployer's wallet for direct testing/demo
 * use. Must run after script/11-wire-crypto-feeds.ts and a fresh
 * update-redstone-prices.ts (deposit reads the oracle).
 */
const SEED_AMOUNT = "500000"; // whole units, out of 1,000,000 minted per token

interface CryptoDef {
  key: string;
  symbol: string;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const pool = await ethers.getContractAt("ILendingPool", poolAddress);

  const assets = (cryptoConfig as { assets: CryptoDef[] }).assets;

  for (const asset of assets) {
    const tokenAddress = requireContractAddress(network.name, asset.key);
    const token = await ethers.getContractAt("IERC20", tokenAddress);
    const seedAmount = ethers.parseUnits(SEED_AMOUNT, 18);

    await (await token.approve(poolAddress, seedAmount)).wait();
    const tx = await pool.deposit(tokenAddress, seedAmount, deployer.address, 0);
    await tx.wait();
    console.log(`${asset.symbol}: deposited ${SEED_AMOUNT} as pool liquidity (tx: ${tx.hash})`);
  }

  console.log("\nAll 20 crypto reserves seeded with liquidity.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
