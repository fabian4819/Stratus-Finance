import { ethers, network } from "hardhat";
import { saveContractAddress } from "./utils/deployments";

/**
 * Deploys StratusLivePriceReader — standalone real-time price display
 * helper, not the pool's oracle. See its contract docs for the full
 * rationale (RedStone calldata doesn't propagate through internal calls,
 * so the pool's actual oracle stays a cache; this is purely for the
 * frontend to show a live, always-fresh number).
 */
async function main() {
  const Reader = await ethers.getContractFactory("StratusLivePriceReader");
  const reader = await Reader.deploy();
  await reader.waitForDeployment();
  const address = await reader.getAddress();
  console.log(`StratusLivePriceReader deployed to ${address}`);
  saveContractAddress(network.name, "StratusLivePriceReader", address);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
