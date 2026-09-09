import { ethers, network } from "hardhat";
import { saveContractAddress, requireContractAddress } from "./utils/deployments";

/**
 * Deploys StratusMarketplace — self-serve "buy tokenized assets with
 * USDC" flow. See its contract docs for the full rationale. Does NOT
 * wire it up yet (whitelisting/role-granting/inventory/setSellable) —
 * that's script/10-setup-marketplace.ts, run separately per-token since
 * it's a lot of transactions across 12 tokens.
 */
async function main() {
  const usdcAddress = requireContractAddress(network.name, "MockUSDC");
  const oracleAddress = requireContractAddress(network.name, "StratusRedstoneOracle");

  const Marketplace = await ethers.getContractFactory("StratusMarketplace");
  const marketplace = await Marketplace.deploy(usdcAddress, oracleAddress);
  await marketplace.waitForDeployment();
  const address = await marketplace.getAddress();
  console.log(`StratusMarketplace deployed to ${address}`);
  saveContractAddress(network.name, "StratusMarketplace", address);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
