import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * Resets on-chain state to healthy/unstressed after a demo-liquidation.ts
 * or demo-liquidation-mirror.ts run - neither script cleans up after
 * itself on purpose (liquidation is meant to be terminal for that run).
 * Run this before recording so the deployment starts from a clean slate.
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const oracleAddress = requireContractAddress(network.name, "StratusChainlinkPriceOracle");
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");
  const goldAddress = requireContractAddress(network.name, "GoldToken");
  const stockAddress = requireContractAddress(network.name, "StockIndexToken");

  const pool = await ethers.getContractAt("ILendingPool", poolAddress);
  const oracle = await ethers.getContractAt("StratusChainlinkPriceOracle", oracleAddress);
  const usdc = await ethers.getContractAt("IERC20Metadata", usdcAddress);

  const [, totalDebtUsd] = await pool.getUserAccountData(deployer.address);
  if (totalDebtUsd > 0n) {
    console.log(`Repaying leftover debt ($${ethers.formatEther(totalDebtUsd)})...`);
    await (await usdc.approve(poolAddress, ethers.MaxUint256)).wait();
    const tx = await pool.repay(usdcAddress, ethers.MaxUint256, 2, deployer.address);
    await tx.wait();
    console.log(`  tx: ${tx.hash}`);
  } else {
    console.log("No outstanding debt.");
  }

  for (const [label, asset] of [
    ["GOLD-x", goldAddress],
    ["STOCK-x", stockAddress],
  ] as const) {
    if (await oracle.isDemoStressed(asset)) {
      console.log(`Clearing ${label} demo stress...`);
      const tx = await oracle.connect(deployer).setDemoOffsetBps(asset, 0);
      await tx.wait();
      console.log(`  tx: ${tx.hash}`);
    } else {
      console.log(`${label}: not stressed.`);
    }
  }

  const [totalCollateralUsd, finalDebtUsd, , , , hf] = await pool.getUserAccountData(deployer.address);
  console.log(
    `\nFinal state: collateral $${ethers.formatEther(totalCollateralUsd)}, debt $${ethers.formatEther(finalDebtUsd)}, ` +
      `health factor: ${hf >= ethers.MaxUint256 / 2n ? "MAX" : ethers.formatEther(hf)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
