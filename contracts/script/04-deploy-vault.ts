import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";

/**
 * BLOCKED on Phase 2 (needs the pool address — see
 * contracts/script/README.md). Deploys StratusVault and StratusRiskView
 * once the pool and basket token both exist.
 */
async function main() {
  const basketTokenAddress = requireContractAddress(network.name, "StratusBasketToken");
  const poolAddress = requireContractAddress(network.name, "LendingPool"); // written by Phase 2 deploy
  const oracleAddress = requireContractAddress(network.name, "StratusPriceOracle");
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
