import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";
import * as cryptoConfig from "../config/borrowable-crypto.json";

/**
 * Deploys StratusStaking + StratusRewardToken and opens one pool per
 * borrowable crypto reserve (see docs/phase-5-crypto-borrow.md) — staking
 * is independent of the lending pool, a separate way to earn yield on
 * the same tokens without touching collateral/borrow at all.
 *
 * Flat demo reward rate for every pool (arbitrary; not tuned to any real
 * emissions budget — see StratusStaking.sol's own disclosure).
 *
 * Run:
 *   npx hardhat run script/14-deploy-staking.ts --network hederaTestnet
 */
const REWARD_PER_SECOND = ethers.parseUnits("0.01", 18); // 0.01 STRAT/sec per pool

interface CryptoDef {
  key: string;
  symbol: string;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HBAR\n");

  const RewardToken = await ethers.getContractFactory("StratusRewardToken");
  const rewardToken = await RewardToken.deploy();
  await rewardToken.waitForDeployment();
  const rewardTokenAddress = await rewardToken.getAddress();
  console.log("StratusRewardToken deployed to", rewardTokenAddress);
  saveContractAddress(network.name, "StratusRewardToken", rewardTokenAddress);

  const Staking = await ethers.getContractFactory("StratusStaking");
  const staking = await Staking.deploy(rewardTokenAddress);
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log("StratusStaking deployed to", stakingAddress);
  saveContractAddress(network.name, "StratusStaking", stakingAddress);

  console.log("\nTransferring StratusRewardToken ownership to StratusStaking...");
  await (await rewardToken.transferOwnership(stakingAddress)).wait();
  console.log("  done — only StratusStaking can mint STRAT now.");

  const assets = (cryptoConfig as { assets: CryptoDef[] }).assets;
  console.log(`\n=== Opening ${assets.length} staking pools (${ethers.formatUnits(REWARD_PER_SECOND, 18)} STRAT/sec each) ===`);
  for (const asset of assets) {
    const tokenAddress = requireContractAddress(network.name, asset.key);
    const tx = await staking.addPool(tokenAddress, REWARD_PER_SECOND);
    await tx.wait();
    console.log(`  ${asset.symbol}: pool opened (tx ${tx.hash.slice(0, 10)}...)`);
  }

  console.log("\n=== DONE: staking live for", assets.length, "crypto reserves ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
