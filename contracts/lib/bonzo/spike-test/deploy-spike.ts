import { ethers } from "hardhat";

/**
 * PLAN.md Phase 0 spike: deploy an unmodified Aave v2 LendingPool (from the
 * vendored Bonzo contracts, see contracts/lib/bonzo/SETUP.md) to Hedera
 * testnet. Deploys the library-linked implementation contracts and calls
 * initialize() to confirm both deployment AND execution work within
 * Hedera's gas behaviour - not just that the bytecode fits.
 *
 * Run with: npx hardhat run lib/bonzo/spike-test/deploy-spike.ts --config hardhat.bonzo.config.ts --network hederaTestnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HBAR");

  const results: Record<string, { address: string; gasUsed: string; txHash: string }> = {};

  async function deployAndRecord(name: string, factory: any, ...args: any[]) {
    console.log(`\nDeploying ${name}...`);
    const contract = await factory.deploy(...args);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    const tx = contract.deploymentTransaction();
    const receipt = await tx!.wait();
    console.log(`  ${name} -> ${address} (gas used: ${receipt!.gasUsed})`);
    results[name] = { address, gasUsed: receipt!.gasUsed.toString(), txHash: tx!.hash };
    return contract;
  }

  // 1-2. Independent libraries
  const GenericLogic = await ethers.getContractFactory("GenericLogic");
  const genericLogic = await deployAndRecord("GenericLogic", GenericLogic);

  const ReserveLogic = await ethers.getContractFactory("ReserveLogic");
  await deployAndRecord("ReserveLogic", ReserveLogic);

  // 3. ValidationLogic, linked to GenericLogic
  const ValidationLogic = await ethers.getContractFactory("ValidationLogic", {
    libraries: { GenericLogic: await genericLogic.getAddress() },
  });
  const validationLogic = await deployAndRecord("ValidationLogic", ValidationLogic);

  // 4. LendingPool, linked to ReserveLogic + ValidationLogic
  const LendingPool = await ethers.getContractFactory("LendingPool", {
    libraries: {
      ReserveLogic: results["ReserveLogic"].address,
      ValidationLogic: await validationLogic.getAddress(),
    },
  });
  const lendingPool = await deployAndRecord("LendingPool", LendingPool);

  // 5. LendingPoolAddressesProvider (unmodified, self-contained)
  const AddressesProvider = await ethers.getContractFactory("LendingPoolAddressesProvider");
  await deployAndRecord("LendingPoolAddressesProvider", AddressesProvider, "Stratus Finance Phase 0 Spike");
  const provider = await ethers.getContractAt(
    "LendingPoolAddressesProvider",
    results["LendingPoolAddressesProvider"].address
  );

  // 6. Prove the linked bytecode actually EXECUTES on Hedera's EVM, not
  // just deploys: call LendingPool.initialize(provider) directly on the
  // implementation (this is not the real upgradeable-proxy flow Aave v2
  // uses in production - that's Phase 2 - just an execution smoke test).
  console.log("\nCalling LendingPool.initialize(provider) directly on the implementation...");
  const initTx = await lendingPool.initialize(await provider.getAddress());
  const initReceipt = await initTx.wait();
  console.log(`  initialize() succeeded, gas used: ${initReceipt!.gasUsed}, tx: ${initTx.hash}`);
  results["LendingPool.initialize"] = {
    address: results["LendingPool"].address,
    gasUsed: initReceipt!.gasUsed.toString(),
    txHash: initTx.hash,
  };

  console.log("\n=== SPIKE RESULT: SUCCESS ===");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error("SPIKE FAILED:", e.shortMessage || e.message);
  process.exitCode = 1;
});
