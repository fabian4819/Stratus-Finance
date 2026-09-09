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
  const dataProviderPrecheck = await ethers.getContractAt("AaveProtocolDataProvider", dataProviderAddress);

  // Chunk size for batchInitReserve — 11-at-once exceeded Hedera's
  // per-transaction gas limit (CONTRACT_REVERT_EXECUTED / INSUFFICIENT_GAS
  // during estimateGas); the original 3-asset batch in
  // deploy-lending-core.ts is the known-working size, so chunk at 3.
  const CHUNK_SIZE = 3;

  const initInputsAll: Array<{ input: unknown; stock: StockDef }> = [];

  for (const stock of stocks) {
    const assetAddress = requireContractAddress(NETWORK, stock.key);

    // Idempotency: skip if this reserve was already initialized in a
    // prior (partial) run of this script.
    const [existingATokenAddress] = await dataProviderPrecheck.getReserveTokensAddresses(assetAddress);
    if (existingATokenAddress !== ethers.ZeroAddress) {
      console.log(`  ${stock.symbol}: reserve already initialized (aToken ${existingATokenAddress}) — skipping`);
      saveContractAddress(NETWORK, `aToken_${stock.symbol}`, existingATokenAddress);
      continue;
    }

    // Idempotency: reuse a strategy address from a prior partial run if
    // one was already saved, rather than deploying a new one every retry.
    let strategyAddress: string;
    try {
      strategyAddress = requireContractAddress(NETWORK, `InterestRateStrategy_${stock.symbol}`);
      console.log(`  ${stock.symbol} interest rate strategy (reused): ${strategyAddress}`);
    } catch {
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
      strategyAddress = await strategy.getAddress();
      // Saved immediately (not batched at the end) so a later failure in
      // this run doesn't lose track of what's already been paid for.
      saveContractAddress(NETWORK, `InterestRateStrategy_${stock.symbol}`, strategyAddress);
      console.log(`  ${stock.symbol} interest rate strategy:`, strategyAddress);
    }

    initInputsAll.push({
      stock,
      input: {
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
      },
    });
  }

  console.log(`\n=== batchInitReserve for ${initInputsAll.length} pending reserve(s), in chunks of ${CHUNK_SIZE} ===`);
  for (let i = 0; i < initInputsAll.length; i += CHUNK_SIZE) {
    const chunk = initInputsAll.slice(i, i + CHUNK_SIZE);
    const symbols = chunk.map((c) => c.stock.symbol).join(", ");
    console.log(`  Batch [${symbols}]...`);
    const initTx = await configurator.batchInitReserve(chunk.map((c) => c.input));
    const initReceipt = await initTx.wait();
    console.log(`    tx: ${initTx.hash} (gas used: ${initReceipt!.gasUsed})`);
  }

  console.log("\n=== Configuring risk parameters (collateral-enabled, no borrowing) ===");
  for (const { stock } of initInputsAll) {
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
