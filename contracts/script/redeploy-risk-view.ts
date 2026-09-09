import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";

/**
 * StratusRiskView's `oracle` is immutable — set once at construction and
 * never updatable. It was originally deployed (04-deploy-vault.ts, Phase 3)
 * pointed at StratusPriceOracle (Pyth-backed), before the oracle pivot to
 * Chainlink (see docs/phase-2-findings.md). The LendingPool itself was
 * re-pointed via LendingPoolAddressesProvider.setPriceOracle
 * (update-price-oracle.ts), but StratusRiskView kept calling its own,
 * now-dead Pyth oracle for getAssetPrice() — every getUserRisk() call
 * reverted with Pyth's StalePrice() (selector 0x19abf40e), surfaced in the
 * frontend as "execution reverted (unknown custom error)".
 *
 * This redeploys StratusRiskView (read-only, no state to migrate) against
 * the live oracle, defaulting to StratusChainlinkPriceOracle. Does NOT
 * touch StratusVault or any pool state.
 */
async function main() {
  const oracleKey = process.env.ORACLE_DEPLOYMENT_KEY ?? "StratusChainlinkPriceOracle";

  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const oracleAddress = requireContractAddress(network.name, oracleKey);
  const dataProviderAddress = requireContractAddress(network.name, "ProtocolDataProvider");

  console.log(`Redeploying StratusRiskView against oracle "${oracleKey}" (${oracleAddress})...`);

  const StratusRiskView = await ethers.getContractFactory("StratusRiskView");
  const riskView = await StratusRiskView.deploy(poolAddress, oracleAddress, dataProviderAddress);
  await riskView.waitForDeployment();
  const riskViewAddress = await riskView.getAddress();
  console.log(`StratusRiskView redeployed to ${riskViewAddress}`);
  saveContractAddress(network.name, "StratusRiskView", riskViewAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
