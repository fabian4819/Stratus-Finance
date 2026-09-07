import { ethers } from "hardhat";
import { saveContractAddress, requireContractAddress } from "../../../script/utils/deployments";

/**
 * PLAN.md Phase 2: deploys the real, unmodified Bonzo/Aave v2 lending
 * core through the standard upgradeable-proxy flow (unlike the Phase 0
 * spike, which called `initialize()` directly on a bare implementation
 * just to prove deployability/gas) - and initializes the three reserves
 * with deliberately different risk parameters.
 *
 * Run under the Bonzo-only config, since this is the only place the
 * vendored contracts are compiled:
 *   npx hardhat run lib/bonzo/script/deploy-lending-core.ts --config hardhat.bonzo.config.ts --network hederaTestnet
 *
 * Requires Phase 1 assets (GoldToken, StockIndexToken, MockUSDC) and the
 * Phase 2 StratusPriceOracle already in deployments/hederaTestnet.json.
 */

const NETWORK = "hederaTestnet";
const RAY = 10n ** 27n;

// Same curve for all three reserves — the risk differentiation that
// matters for the demo is LTV/threshold/liquidation-bonus (set via
// configureReserveAsCollateral below), not the interest rate curve.
// Standard Aave v2-style defaults.
const RATE_STRATEGY_PARAMS = {
  optimalUtilizationRate: (RAY * 80n) / 100n, // 80%
  baseVariableBorrowRate: (RAY * 1n) / 100n, // 1%
  variableRateSlope1: (RAY * 4n) / 100n, // 4%
  variableRateSlope2: (RAY * 75n) / 100n, // 75%
  stableRateSlope1: (RAY * 4n) / 100n, // unused (stable borrowing disabled everywhere) but required by the constructor
  stableRateSlope2: (RAY * 75n) / 100n,
};

interface ReserveSpec {
  key: string; // deployments.json key for the underlying asset address
  symbol: string;
  decimals: number;
  isCollateral: boolean;
  ltvBps?: number;
  liquidationThresholdBps?: number;
  liquidationBonusBps?: number; // Aave convention: 100% + bonus, e.g. 10500 = 5% bonus
  enableBorrowing: boolean;
}

// PLAN.md §Phase 2 risk table.
const RESERVES: ReserveSpec[] = [
  {
    key: "GoldToken",
    symbol: "GOLD-x",
    decimals: 18,
    isCollateral: true,
    ltvBps: 7_000,
    liquidationThresholdBps: 7_500,
    liquidationBonusBps: 10_500,
    enableBorrowing: false,
  },
  {
    key: "StockIndexToken",
    symbol: "STOCK-x",
    decimals: 18,
    isCollateral: true,
    ltvBps: 5_500,
    liquidationThresholdBps: 6_500,
    liquidationBonusBps: 11_000,
    enableBorrowing: false,
  },
  {
    key: "MockUSDC",
    symbol: "USDC",
    decimals: 6,
    isCollateral: false, // borrow-only, per PLAN.md
    enableBorrowing: true,
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HBAR\n");

  const oracleAddress = requireContractAddress(NETWORK, "StratusPriceOracle");

  // --- 1. Libraries ---
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

  // --- 2. LendingPool implementation ---
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

  // --- 3. AddressesProvider ---
  console.log("\n=== Deploying LendingPoolAddressesProvider ===");
  const AddressesProvider = await ethers.getContractFactory("LendingPoolAddressesProvider");
  const provider = await AddressesProvider.deploy("Stratus Finance");
  await provider.waitForDeployment();
  const providerAddress = await provider.getAddress();
  console.log("LendingPoolAddressesProvider:", providerAddress);

  await (await provider.setPoolAdmin(deployer.address)).wait();
  await (await provider.setEmergencyAdmin(deployer.address)).wait();
  console.log("Pool admin + emergency admin set to deployer");

  // --- 4. LendingPool proxy (auto-created + initialized by setLendingPoolImpl) ---
  await (await provider.setLendingPoolImpl(await LendingPoolImpl.getAddress())).wait();
  const lendingPoolAddress = await provider.getLendingPool();
  console.log("LendingPool proxy:", lendingPoolAddress);

  // --- 5. LendingPoolConfigurator implementation + proxy ---
  console.log("\n=== Deploying LendingPoolConfigurator ===");
  const ConfiguratorImpl = await (await ethers.getContractFactory("LendingPoolConfigurator")).deploy();
  await ConfiguratorImpl.waitForDeployment();
  await (await provider.setLendingPoolConfiguratorImpl(await ConfiguratorImpl.getAddress())).wait();
  const configuratorAddress = await provider.getLendingPoolConfigurator();
  console.log("LendingPoolConfigurator proxy:", configuratorAddress);

  // --- 6. LendingPoolCollateralManager (delegatecall target, no proxy) ---
  console.log("\n=== Deploying LendingPoolCollateralManager ===");
  const CollateralManager = await (await ethers.getContractFactory("LendingPoolCollateralManager")).deploy();
  await CollateralManager.waitForDeployment();
  await (await provider.setLendingPoolCollateralManager(await CollateralManager.getAddress())).wait();
  console.log("LendingPoolCollateralManager:", await CollateralManager.getAddress());

  // --- 7. Oracles ---
  console.log("\n=== Wiring oracles ===");
  await (await provider.setPriceOracle(oracleAddress)).wait();
  console.log("Price oracle (StratusPriceOracle):", oracleAddress);

  const LendingRateOracle = await (await ethers.getContractFactory("LendingRateOracle")).deploy();
  await LendingRateOracle.waitForDeployment();
  const rateOracleAddress = await LendingRateOracle.getAddress();
  await (await provider.setLendingRateOracle(rateOracleAddress)).wait();
  console.log("Lending rate oracle:", rateOracleAddress);
  // Nominal rates only — stable-rate borrowing is disabled on every
  // reserve, so this value is never actually used to gate anything; it
  // only prevents a call to an address with no code.
  for (const reserve of RESERVES) {
    const assetAddress = requireContractAddress(NETWORK, reserve.key);
    await (await LendingRateOracle.setMarketBorrowRate(assetAddress, (RAY * 5n) / 100n)).wait();
  }
  console.log("Set a nominal 5% market borrow rate for all three reserves");

  // --- 8. Shared token implementations (proxied per-reserve by initReserve) ---
  console.log("\n=== Deploying shared AToken/StableDebtToken/VariableDebtToken implementations ===");
  const ATokenImpl = await (await ethers.getContractFactory("AToken")).deploy();
  await ATokenImpl.waitForDeployment();
  const StableDebtTokenImpl = await (await ethers.getContractFactory("StableDebtToken")).deploy();
  await StableDebtTokenImpl.waitForDeployment();
  const VariableDebtTokenImpl = await (await ethers.getContractFactory("VariableDebtToken")).deploy();
  await VariableDebtTokenImpl.waitForDeployment();
  console.log("AToken impl:", await ATokenImpl.getAddress());
  console.log("StableDebtToken impl:", await StableDebtTokenImpl.getAddress());
  console.log("VariableDebtToken impl:", await VariableDebtTokenImpl.getAddress());

  // --- 9. AaveProtocolDataProvider ---
  console.log("\n=== Deploying AaveProtocolDataProvider ===");
  const DataProvider = await (await ethers.getContractFactory("AaveProtocolDataProvider")).deploy(providerAddress);
  await DataProvider.waitForDeployment();
  console.log("AaveProtocolDataProvider:", await DataProvider.getAddress());

  // --- 10. Per-reserve interest rate strategies + batchInitReserve ---
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
      aTokenName: `Stratus a${reserve.symbol}`,
      aTokenSymbol: `a${reserve.symbol}`,
      variableDebtTokenName: `Stratus variableDebt${reserve.symbol}`,
      variableDebtTokenSymbol: `variableDebt${reserve.symbol}`,
      stableDebtTokenName: `Stratus stableDebt${reserve.symbol}`,
      stableDebtTokenSymbol: `stableDebt${reserve.symbol}`,
      params: "0x",
    });
  }

  const initTx = await configurator.batchInitReserve(initInputs);
  const initReceipt = await initTx.wait();
  console.log(`  batchInitReserve tx: ${initTx.hash} (gas used: ${initReceipt!.gasUsed})`);

  // --- 11. Risk params + borrowing flags ---
  console.log("\n=== Configuring risk parameters ===");
  for (const reserve of RESERVES) {
    const assetAddress = requireContractAddress(NETWORK, reserve.key);
    if (reserve.isCollateral) {
      const tx = await configurator.configureReserveAsCollateral(
        assetAddress,
        reserve.ltvBps,
        reserve.liquidationThresholdBps,
        reserve.liquidationBonusBps
      );
      await tx.wait();
      console.log(
        `  ${reserve.symbol}: LTV=${reserve.ltvBps! / 100}% threshold=${reserve.liquidationThresholdBps! / 100}% bonus=${
          (reserve.liquidationBonusBps! - 10_000) / 100
        }%`
      );
    }
    if (reserve.enableBorrowing) {
      const tx = await configurator.enableBorrowingOnReserve(assetAddress, false); // stable borrowing disabled
      await tx.wait();
      console.log(`  ${reserve.symbol}: borrowing enabled (variable rate only)`);
    }
  }

  // --- 12. Record every address ---
  console.log("\n=== Saving deployment ===");
  const toSave: Record<string, string> = {
    GenericLogic: await GenericLogic.getAddress(),
    ReserveLogic: await ReserveLogic.getAddress(),
    ValidationLogic: await ValidationLogic.getAddress(),
    LendingPoolImpl: await LendingPoolImpl.getAddress(),
    LendingPoolAddressesProvider: providerAddress,
    LendingPool: lendingPoolAddress,
    LendingPoolConfiguratorImpl: await ConfiguratorImpl.getAddress(),
    LendingPoolConfigurator: configuratorAddress,
    LendingPoolCollateralManager: await CollateralManager.getAddress(),
    LendingRateOracle: rateOracleAddress,
    ATokenImpl: await ATokenImpl.getAddress(),
    StableDebtTokenImpl: await StableDebtTokenImpl.getAddress(),
    VariableDebtTokenImpl: await VariableDebtTokenImpl.getAddress(),
    ProtocolDataProvider: await DataProvider.getAddress(),
  };
  for (const reserve of RESERVES) {
    toSave[`InterestRateStrategy_${reserve.symbol}`] = strategyAddresses[reserve.key];
  }
  for (const [name, address] of Object.entries(toSave)) {
    saveContractAddress(NETWORK, name, address);
  }

  // --- 13. Read back and print the aToken addresses (needed for ATS control-list whitelisting) ---
  console.log("\n=== aToken addresses (whitelist these on the respective ATS control list) ===");
  const dataProvider = await ethers.getContractAt("AaveProtocolDataProvider", await DataProvider.getAddress());
  for (const reserve of RESERVES) {
    const assetAddress = requireContractAddress(NETWORK, reserve.key);
    const [aTokenAddress] = await dataProvider.getReserveTokensAddresses(assetAddress);
    console.log(`  ${reserve.symbol}: ${aTokenAddress}`);
    saveContractAddress(NETWORK, `aToken_${reserve.symbol}`, aTokenAddress);
  }

  console.log("\n=== PHASE 2 CORE DEPLOY: DONE ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
