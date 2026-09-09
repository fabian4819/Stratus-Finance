import { ethers } from "hardhat";
import { saveContractAddress, requireContractAddress } from "../../../script/utils/deployments";
import * as stocksConfig from "../../../../tokenization/config/individual-stocks.json";

/**
 * Adds the 11 individual real-stock tokens (see
 * tokenization/scripts/issue-individual-stocks.ts and
 * docs/phase-4-individual-stocks.md) as new reserves on the ALREADY-LIVE
 * pool — does NOT redeploy the core (LendingPool, AddressesProvider,
 * Configurator, or the shared aToken/debtToken implementations), reusing
 * every one of those from deployments/hederaTestnet.json. Same
 * batchInitReserve pattern as deploy-lending-core.ts's original 3
 * reserves, just run against the existing configurator instead of a
 * freshly-deployed one.
 *
 * Deliberately conservative risk params relative to GOLD-x/STOCK-x
 * (single-name equities are more volatile than gold or a diversified
 * index) — collateral-enabled, no borrowing (matches the existing
 * GOLD-x/STOCK-x pattern; USDC remains the only borrow-enabled asset).
 *
 * Run:
 *   npx hardhat run lib/bonzo/script/add-individual-stock-reserves.ts --config hardhat.bonzo.config.ts --network hederaTestnet
 *
 * Requires all 11 tokens already issued (issue-individual-stocks.ts) and
 * present in deployments/hederaTestnet.json.
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

const LTV_BPS = 5_000; // 50% — more conservative than GOLD-x (70%), matches STOCK-x-ish
const LIQUIDATION_THRESHOLD_BPS = 6_000; // 60%
const LIQUIDATION_BONUS_BPS = 11_000; // 10% bonus, same as STOCK-x

interface StockDef {
  key: string;
  symbol: string;
  decimals: number;
  redstoneFeedId: string;
}

async function main() {
  const stocks = (stocksConfig as { assets: StockDef[] }).assets;

  const providerAddress = requireContractAddress(NETWORK, "LendingPoolAddressesProvider");
  const configuratorAddress = requireContractAddress(NETWORK, "LendingPoolConfigurator");
  const aTokenImplAddress = requireContractAddress(NETWORK, "ATokenImpl");
  const stableDebtImplAddress = requireContractAddress(NETWORK, "StableDebtTokenImpl");
  const variableDebtImplAddress = requireContractAddress(NETWORK, "VariableDebtTokenImpl");
  const dataProviderAddress = requireContractAddress(NETWORK, "ProtocolDataProvider");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HBAR\n");

  const configurator = await ethers.getContractAt("LendingPoolConfigurator", configuratorAddress);

  const initInputs = [];
  const strategyAddresses: Record<string, string> = {};

  for (const stock of stocks) {
    const assetAddress = requireContractAddress(NETWORK, stock.key);

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
    strategyAddresses[stock.key] = strategyAddress;
    console.log(`  ${stock.symbol} interest rate strategy:`, strategyAddress);

    initInputs.push({
      aTokenImpl: aTokenImplAddress,
      stableDebtTokenImpl: stableDebtImplAddress,
      variableDebtTokenImpl: variableDebtImplAddress,
      underlyingAssetDecimals: stock.decimals,
      interestRateStrategyAddress: strategyAddress,
      underlyingAsset: assetAddress,
      treasury: deployer.address,
      incentivesController: ethers.ZeroAddress,
      underlyingAssetName: stock.symbol,
      aTokenName: `Stratus a${stock.symbol}`,
      aTokenSymbol: `a${stock.symbol}`,
      variableDebtTokenName: `Stratus variableDebt${stock.symbol}`,
      variableDebtTokenSymbol: `variableDebt${stock.symbol}`,
      stableDebtTokenName: `Stratus stableDebt${stock.symbol}`,
      stableDebtTokenSymbol: `stableDebt${stock.symbol}`,
      params: "0x",
    });
  }

  console.log("\n=== batchInitReserve for all 11 individual stocks ===");
  const initTx = await configurator.batchInitReserve(initInputs);
  const initReceipt = await initTx.wait();
  console.log(`  batchInitReserve tx: ${initTx.hash} (gas used: ${initReceipt!.gasUsed})`);

  console.log("\n=== Configuring risk parameters (collateral-enabled, no borrowing) ===");
  for (const stock of stocks) {
    const assetAddress = requireContractAddress(NETWORK, stock.key);
    const tx = await configurator.configureReserveAsCollateral(
      assetAddress,
      LTV_BPS,
      LIQUIDATION_THRESHOLD_BPS,
      LIQUIDATION_BONUS_BPS
    );
    await tx.wait();
    console.log(`  ${stock.symbol}: LTV=${LTV_BPS / 100}% threshold=${LIQUIDATION_THRESHOLD_BPS / 100}% bonus=${(LIQUIDATION_BONUS_BPS - 10_000) / 100}%`);
  }

  console.log("\n=== Saving deployment ===");
  for (const stock of stocks) {
    saveContractAddress(NETWORK, `InterestRateStrategy_${stock.symbol}`, strategyAddresses[stock.key]);
  }

  console.log("\n=== aToken addresses (whitelist these on each ATS control list) ===");
  const dataProvider = await ethers.getContractAt("AaveProtocolDataProvider", dataProviderAddress);
  for (const stock of stocks) {
    const assetAddress = requireContractAddress(NETWORK, stock.key);
    const [aTokenAddress] = await dataProvider.getReserveTokensAddresses(assetAddress);
    console.log(`  ${stock.symbol}: ${aTokenAddress}`);
    saveContractAddress(NETWORK, `aToken_${stock.symbol}`, aTokenAddress);
  }

  console.log("\n=== DONE: 11 individual stock reserves added ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
