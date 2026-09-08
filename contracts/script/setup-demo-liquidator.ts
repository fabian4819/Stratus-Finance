import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * PLAN.md Phase 4 setup: funds the dedicated demo liquidator account with
 * HBAR (gas) and USDC (to cover debtToCover in liquidationCall). A
 * distinct account from the operator so the demo shows a real
 * third-party liquidation, not self-dealing.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const liquidatorAddress = requireEnv("DEMO_LIQUIDATOR_ADDRESS");

  const hbarAmount = ethers.parseEther("5");
  console.log(`Sending ${ethers.formatEther(hbarAmount)} HBAR to liquidator (${liquidatorAddress})...`);
  const hbarTx = await deployer.sendTransaction({ to: liquidatorAddress, value: hbarAmount });
  await hbarTx.wait();
  console.log(`  tx: ${hbarTx.hash}`);

  const usdcAddress = requireContractAddress(network.name, "MockUSDC");
  const usdc = await ethers.getContractAt("MockUSDC", usdcAddress);
  const usdcAmount = ethers.parseUnits("1000", 6);
  console.log(`\nMinting ${ethers.formatUnits(usdcAmount, 6)} USDC directly to liquidator...`);
  const mintTx = await usdc.mint(liquidatorAddress, usdcAmount);
  await mintTx.wait();
  console.log(`  tx: ${mintTx.hash}`);

  console.log("\n=== Liquidator funded ===");
  console.log(`HBAR: ${ethers.formatEther(await ethers.provider.getBalance(liquidatorAddress))}`);
  console.log(`USDC: ${ethers.formatUnits(await usdc.balanceOf(liquidatorAddress), 6)}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} not set — see contracts/.env.example`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
