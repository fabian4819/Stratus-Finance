import { ethers } from "hardhat";
import { requireContractAddress } from "../../../script/utils/deployments";

/**
 * Re-points the LendingPoolAddressesProvider at a different oracle
 * deployment. Needed whenever the "live" oracle changes - the tinybar-
 * rounding fix and the Pyth -> Chainlink pivot in Phase 2 both needed
 * this - since the pool reads the oracle address from the provider, not
 * from deployments.json directly.
 *
 * Set ORACLE_DEPLOYMENT_KEY to pick which deployments.json entry to
 * point at (defaults to StratusChainlinkPriceOracle, the oracle the pool
 * actually uses as of Phase 2 - see docs/phase-2-findings.md for why).
 */
async function main() {
  const oracleKey = process.env.ORACLE_DEPLOYMENT_KEY ?? "StratusChainlinkPriceOracle";
  const providerAddress = requireContractAddress("hederaTestnet", "LendingPoolAddressesProvider");
  const oracleAddress = requireContractAddress("hederaTestnet", oracleKey);

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
