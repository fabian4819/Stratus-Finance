import { ethers, network } from "hardhat";
import { saveContractAddress } from "./utils/deployments";

/**
 * Deploys StratusPriceOracle. No pool dependency — runnable as soon as
 * PYTH_CONTRACT_ADDRESS is known for the target network (Phase 0 spike #2
 * in PLAN.md confirms this address and the feed IDs used in step 01).
 */
async function main() {
  const pythAddress = process.env.PYTH_CONTRACT_ADDRESS;
  if (!pythAddress) {
    throw new Error("PYTH_CONTRACT_ADDRESS not set — see contracts/.env.example");
  }

  const maxPriceAgeSeconds = 60; // reject any Pyth price older than 60s on the liquidation path

  const StratusPriceOracle = await ethers.getContractFactory("StratusPriceOracle");
  const oracle = await StratusPriceOracle.deploy(pythAddress, maxPriceAgeSeconds);
  await oracle.waitForDeployment();

  const address = await oracle.getAddress();
  console.log(`StratusPriceOracle deployed to ${address}`);
  saveContractAddress(network.name, "StratusPriceOracle", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
