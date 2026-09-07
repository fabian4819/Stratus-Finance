import { ethers } from "hardhat";
import { requireContractAddress } from "../../../script/utils/deployments";

/**
 * Re-points the LendingPoolAddressesProvider at a redeployed
 * StratusPriceOracle. Needed whenever the oracle contract itself changes
 * (e.g. the tinybar-rounding fix in Phase 2 - see docs/phase-2-findings.md)
 * since the pool reads the oracle address from the provider, not from
 * deployments.json directly.
 */
async function main() {
  const providerAddress = requireContractAddress("hederaTestnet", "LendingPoolAddressesProvider");
  const oracleAddress = requireContractAddress("hederaTestnet", "StratusPriceOracle");

  const provider = await ethers.getContractAt("LendingPoolAddressesProvider", providerAddress);
  const current = await provider.getPriceOracle();
  console.log("Current price oracle on provider:", current);
  console.log("Target price oracle:", oracleAddress);

  if (current.toLowerCase() === oracleAddress.toLowerCase()) {
    console.log("Already up to date, nothing to do.");
    return;
  }

  const tx = await provider.setPriceOracle(oracleAddress);
  await tx.wait();
  console.log("Updated. tx:", tx.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
