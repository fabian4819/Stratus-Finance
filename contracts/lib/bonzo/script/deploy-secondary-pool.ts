import { ethers } from "hardhat";
import { saveContractAddress, requireContractAddress } from "../../../script/utils/deployments";

/**
 * Deploys a SECOND, fully independent Aave v2 lending core — same
 * contracts/pattern as deploy-lending-core.ts, run again from scratch
 * (own libraries, own LendingPool/Configurator/DataProvider proxies) so
 * it's a genuinely separate on-chain protocol, not a second reserve on
 * the primary pool.
 *
 * Reserves reuse the PRIMARY pool's own underlying tokens (MockUSDC,
 * BtcToken, EthToken, SolToken) instead of newly-minted ones — so any
 * balance a user already picked up from the Faucet for the primary pool
 * is immediately supply-able here too. This exists to give the AI
 * Advisor's "cross-protocol" comparison a second real, on-chain,
 * transaction-executing market that doesn't require a wallet to hold a
 * genuinely external testnet asset (see docs/phase-6-ai-advisor.md for
 * why the earlier real-Bonzo-Finance integration hit that wall).
 *
 * Run:
 *   npx hardhat run lib/bonzo/script/deploy-secondary-pool.ts --config hardhat.bonzo.config.ts --network hederaTestnet
 */
const NETWORK = "hederaTestnet";
const RAY = 10n ** 27n;

const RATE_STRATEGY_PARAMS = {
  optimalUtilizationRate: (RAY * 80n) / 100n,
  baseVariableBorrowRate: (RAY * 1n) / 100n,
  variableRateSlope1: (RAY * 4n) / 100n,
  variableRateSlope2: (RAY * 75n) / 100n,
  stableRateSlope1: (RAY * 4n) / 100n,
  stableRateSlope2: (RAY * 75n) / 100n,
};

const LTV_BPS = 6_000;
const LIQUIDATION_THRESHOLD_BPS = 7_000;
const LIQUIDATION_BONUS_BPS = 11_000;

interface ReserveSpec {
  key: string; // deployments.json key for the underlying asset (already deployed by the primary pool's own scripts)
  symbol: string;
  decimals: number;
}

const RESERVES: ReserveSpec[] = [
  { key: "MockUSDC", symbol: "USDC", decimals: 6 },
  { key: "BtcToken", symbol: "BTC", decimals: 18 },
  { key: "EthToken", symbol: "ETH", decimals: 18 },
  { key: "SolToken", symbol: "SOL", decimals: 18 },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HBAR\n");

  // Reuse the primary pool's own price oracle — it already has live
  // RedStone feeds wired for USDC/BTC/ETH/SOL, and price lookups are
  // stateless per-asset, so nothing about sharing it ties the two pools
  // together.
  const oracleAddress = requireContractAddress(NETWORK, "StratusPriceOracle");

  console.log("=== Deploying libraries ===");
  const GenericLogic = await (await ethers.getContractFactory("GenericLogic")).deploy();
  await GenericLogic.waitForDeployment();
  console.log("GenericLogic:", await GenericLogic.getAddress());

  const ReserveLogic = await (await ethers.getContractFactory("ReserveLogic")).deploy();
  await ReserveLogic.waitForDeployment();
  console.log("ReserveLogic:", await ReserveLogic.getAddress());

  const ValidationLogic = await (
    await ethers.getContractFactory("ValidationLogic", {
      libraries: { GenericLogic: await GenericLogic.getAddress() },
    })
  ).deploy();
  await ValidationLogic.waitForDeployment();
  console.log("ValidationLogic:", await ValidationLogic.getAddress());

  console.log("\n=== Deploying LendingPool implementation ===");
  const LendingPoolImpl = await (
    await ethers.getContractFactory("LendingPool", {
      libraries: {
        ReserveLogic: await ReserveLogic.getAddress(),
        ValidationLogic: await ValidationLogic.getAddress(),
      },
    })
  ).deploy();
  await LendingPoolImpl.waitForDeployment();
  console.log("LendingPool implementation:", await LendingPoolImpl.getAddress());

  console.log("\n=== Deploying LendingPoolAddressesProvider ===");
  const AddressesProvider = await ethers.getContractFactory("LendingPoolAddressesProvider");
  const provider = await AddressesProvider.deploy("Cirrus Finance");
  await provider.waitForDeployment();
  const providerAddress = await provider.getAddress();
  console.log("LendingPoolAddressesProvider:", providerAddress);

  await (await provider.setPoolAdmin(deployer.address)).wait();
  await (await provider.setEmergencyAdmin(deployer.address)).wait();

  await (await provider.setLendingPoolImpl(await LendingPoolImpl.getAddress())).wait();
  const lendingPoolAddress = await provider.getLendingPool();
  console.log("LendingPool proxy:", lendingPoolAddress);

  console.log("\n=== Deploying LendingPoolConfigurator ===");
  const ConfiguratorImpl = await (await ethers.getContractFactory("LendingPoolConfigurator")).deploy();
  await ConfiguratorImpl.waitForDeployment();
  await (await provider.setLendingPoolConfiguratorImpl(await ConfiguratorImpl.getAddress())).wait();
  const configuratorAddress = await provider.getLendingPoolConfigurator();
  console.log("LendingPoolConfigurator proxy:", configuratorAddress);

  console.log("\n=== Deploying LendingPoolCollateralManager ===");
  const CollateralManager = await (await ethers.getContractFactory("LendingPoolCollateralManager")).deploy();
  await CollateralManager.waitForDeployment();
  await (await provider.setLendingPoolCollateralManager(await CollateralManager.getAddress())).wait();

  console.log("\n=== Wiring oracles ===");
  await (await provider.setPriceOracle(oracleAddress)).wait();
  console.log("Price oracle (shared StratusPriceOracle):", oracleAddress);

  const LendingRateOracle = await (await ethers.getContractFactory("LendingRateOracle")).deploy();
  await LendingRateOracle.waitForDeployment();
  const rateOracleAddress = await LendingRateOracle.getAddress();
  await (await provider.setLendingRateOracle(rateOracleAddress)).wait();
  for (const reserve of RESERVES) {
    const assetAddress = requireContractAddress(NETWORK, reserve.key);
    await (await LendingRateOracle.setMarketBorrowRate(assetAddress, (RAY * 5n) / 100n)).wait();
  }
  console.log("Lending rate oracle:", rateOracleAddress);

  console.log("\n=== Deploying shared AToken/StableDebtToken/VariableDebtToken implementations ===");
  const ATokenImpl = await (await ethers.getContractFactory("AToken")).deploy();
  await ATokenImpl.waitForDeployment();
  const StableDebtTokenImpl = await (await ethers.getContractFactory("StableDebtToken")).deploy();
  await StableDebtTokenImpl.waitForDeployment();
  const VariableDebtTokenImpl = await (await ethers.getContractFactory("VariableDebtToken")).deploy();
  await VariableDebtTokenImpl.waitForDeployment();

  console.log("\n=== Deploying AaveProtocolDataProvider ===");
  const DataProvider = await (await ethers.getContractFactory("AaveProtocolDataProvider")).deploy(providerAddress);
  await DataProvider.waitForDeployment();
  console.log("AaveProtocolDataProvider:", await DataProvider.getAddress());

  console.log("\n=== Deploying interest rate strategies and initializing reserves ===");
  const configurator = await ethers.getContractAt("LendingPoolConfigurator", configuratorAddress);

  const initInputs = [];
  const strategyAddresses: Record<string, string> = {};
  for (const reserve of RESERVES) {
    const assetAddress = requireContractAddress(NETWORK, reserve.key);
    const strategy = await (
      await ethers.getContractFactory("DefaultReserveInterestRateStrategy")
    ).deploy(
      providerAddress,
      RATE_STRATEGY_PARAMS.optimalUtilizationRate,
      RATE_STRATEGY_PARAMS.baseVariableBorrowRate,
      RATE_STRATEGY_PARAMS.variableRateSlope1,
      RATE_STRATEGY_PARAMS.variableRateSlope2,
      RATE_STRATEGY_PARAMS.stableRateSlope1,
      RATE_STRATEGY_PARAMS.stableRateSlope2
    );
    await strategy.waitForDeployment();
    const strategyAddress = await strategy.getAddress();
    strategyAddresses[reserve.key] = strategyAddress;
    console.log(`  ${reserve.symbol} interest rate strategy:`, strategyAddress);

    initInputs.push({
      aTokenImpl: await ATokenImpl.getAddress(),
      stableDebtTokenImpl: await StableDebtTokenImpl.getAddress(),
      variableDebtTokenImpl: await VariableDebtTokenImpl.getAddress(),
      underlyingAssetDecimals: reserve.decimals,
      interestRateStrategyAddress: strategyAddress,
      underlyingAsset: assetAddress,
      treasury: deployer.address,
      incentivesController: ethers.ZeroAddress,
      underlyingAssetName: reserve.symbol,
      aTokenName: `Cirrus a${reserve.symbol}`,
      aTokenSymbol: `ca${reserve.symbol}`,
      variableDebtTokenName: `Cirrus variableDebt${reserve.symbol}`,
      variableDebtTokenSymbol: `cvariableDebt${reserve.symbol}`,
      stableDebtTokenName: `Cirrus stableDebt${reserve.symbol}`,
      stableDebtTokenSymbol: `cstableDebt${reserve.symbol}`,
      params: "0x",
    });
  }

  // 4 reserves in one call reverted with empty revert data at ~8.85M gas
  // consumed against a 9M limit — same too-much-in-one-tx ceiling
  // add-crypto-reserves.ts hit, worked around there with chunks of 3.
  // Chunk into 2s here with headroom.
  const CHUNK_SIZE = 2;
  for (let i = 0; i < initInputs.length; i += CHUNK_SIZE) {
    const chunk = initInputs.slice(i, i + CHUNK_SIZE);
    const initTx = await configurator.batchInitReserve(chunk, { gasLimit: 9_000_000 });
    const initReceipt = await initTx.wait();
    console.log(`  batchInitReserve chunk tx: ${initTx.hash} (gas used: ${initReceipt!.gasUsed})`);
  }

  console.log("\n=== Configuring risk parameters + enabling borrowing ===");
  for (const reserve of RESERVES) {
    const assetAddress = requireContractAddress(NETWORK, reserve.key);
    await (
      await configurator.configureReserveAsCollateral(assetAddress, LTV_BPS, LIQUIDATION_THRESHOLD_BPS, LIQUIDATION_BONUS_BPS)
    ).wait();
    await (await configurator.enableBorrowingOnReserve(assetAddress, false)).wait();
    console.log(`  ${reserve.symbol}: LTV=${LTV_BPS / 100}% threshold=${LIQUIDATION_THRESHOLD_BPS / 100}% bonus=${(LIQUIDATION_BONUS_BPS - 10_000) / 100}%, borrowing enabled`);
  }

  console.log("\n=== Saving deployment (Cirrus_ prefix) ===");
  const toSave: Record<string, string> = {
    Cirrus_GenericLogic: await GenericLogic.getAddress(),
    Cirrus_ReserveLogic: await ReserveLogic.getAddress(),
    Cirrus_ValidationLogic: await ValidationLogic.getAddress(),
    Cirrus_LendingPoolImpl: await LendingPoolImpl.getAddress(),
    Cirrus_LendingPoolAddressesProvider: providerAddress,
    Cirrus_LendingPool: lendingPoolAddress,
    Cirrus_LendingPoolConfiguratorImpl: await ConfiguratorImpl.getAddress(),
    Cirrus_LendingPoolConfigurator: configuratorAddress,
    Cirrus_LendingPoolCollateralManager: await CollateralManager.getAddress(),
    Cirrus_LendingRateOracle: rateOracleAddress,
    Cirrus_ATokenImpl: await ATokenImpl.getAddress(),
    Cirrus_StableDebtTokenImpl: await StableDebtTokenImpl.getAddress(),
    Cirrus_VariableDebtTokenImpl: await VariableDebtTokenImpl.getAddress(),
    Cirrus_ProtocolDataProvider: await DataProvider.getAddress(),
  };
  for (const reserve of RESERVES) {
    toSave[`Cirrus_InterestRateStrategy_${reserve.symbol}`] = strategyAddresses[reserve.key];
  }
  for (const [name, address] of Object.entries(toSave)) {
    saveContractAddress(NETWORK, name, address);
  }

  console.log("\n=== aToken addresses ===");
  const dataProvider = await ethers.getContractAt("AaveProtocolDataProvider", await DataProvider.getAddress());
  for (const reserve of RESERVES) {
    const assetAddress = requireContractAddress(NETWORK, reserve.key);
    const [aTokenAddress] = await dataProvider.getReserveTokensAddresses(assetAddress);
    console.log(`  ${reserve.symbol}: ${aTokenAddress}`);
    saveContractAddress(NETWORK, `Cirrus_aToken_${reserve.symbol}`, aTokenAddress);
  }

  console.log("\n=== SECONDARY POOL DEPLOY: DONE ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
