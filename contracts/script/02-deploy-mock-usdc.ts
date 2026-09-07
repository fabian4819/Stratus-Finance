import { ethers, network } from "hardhat";
import { saveContractAddress } from "./utils/deployments";

/**
 * Deploys MockUSDC, the borrowable debt asset (PLAN.md §Phase 1). Not an
 * RWA and deliberately not ATS-issued — the debt asset isn't the part of
 * the protocol being demonstrated. No dependency on the other Phase 1
 * deploys; runs independently.
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  const address = await usdc.getAddress();
  console.log(`MockUSDC deployed to ${address}`);
  saveContractAddress(network.name, "MockUSDC", address);

  // Seed the deployer with a starting balance for later demo/testing use.
  const seedAmount = ethers.parseUnits("1000000", 6);
  const mintTx = await usdc.mint(deployer.address, seedAmount);
  await mintTx.wait();
  console.log(`Minted ${ethers.formatUnits(seedAmount, 6)} USDC to ${deployer.address} (tx: ${mintTx.hash})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
