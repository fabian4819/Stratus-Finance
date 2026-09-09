import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 3: deploys StratusVault and StratusRiskView now that
 * Phase 2's pool and Phase 1's basket token both exist.
 */
async function main() {
  const basketTokenAddress = requireContractAddress(network.name, "StratusBasketToken");
  const poolAddress = requireContractAddress(network.name, "LendingPool"); // written by Phase 2 deploy
  // Live oracle for StratusRiskView's immutable `oracle` reference — see
  // script/redeploy-risk-view.ts for why this must not be the Pyth-backed
  // StratusPriceOracle (blocked; see docs/phase-2-findings.md).
  const oracleAddress = requireContractAddress(
    network.name,
    process.env.ORACLE_DEPLOYMENT_KEY ?? "StratusChainlinkPriceOracle"
  );
  const dataProviderAddress = requireContractAddress(network.name, "ProtocolDataProvider"); // written by Phase 2 deploy

  const StratusVault = await ethers.getContractFactory("StratusVault");
  const vault = await StratusVault.deploy(basketTokenAddress, poolAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`StratusVault deployed to ${vaultAddress}`);
  saveContractAddress(network.name, "StratusVault", vaultAddress);

  const StratusRiskView = await ethers.getContractFactory("StratusRiskView");
  const riskView = await StratusRiskView.deploy(poolAddress, oracleAddress, dataProviderAddress);
  await riskView.waitForDeployment();
  const riskViewAddress = await riskView.getAddress();
  console.log(`StratusRiskView deployed to ${riskViewAddress}`);
  saveContractAddress(network.name, "StratusRiskView", riskViewAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
