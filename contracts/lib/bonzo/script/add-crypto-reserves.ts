import { ethers } from "hardhat";
import { saveContractAddress, requireContractAddress } from "../../../script/utils/deployments";
import * as cryptoConfig from "../../../config/borrowable-crypto.json";

/**
 * Adds the 20 MockCrypto tokens (see docs/phase-5-crypto-borrow.md) as
 * new BORROW-ENABLED reserves on the already-live pool — same
 * batchInitReserve-against-existing-configurator pattern as
 * add-individual-stock-reserves.ts, chunked into groups of 3 (11-at-once
 * exceeded Hedera's per-tx gas limit when this was first discovered).
 *
 * Unlike the individual stocks (collateral-only), these are
 * collateral-enabled AND borrow-enabled — the whole point is letting a
 * user choose which crypto to borrow against their tokenized-stock/gold
 * collateral. Conservative risk params (LTV 50%/threshold 60%/bonus 10%,
 * same as the individual stocks) since these are volatile crypto assets.
 *
 * Run:
 *   npx hardhat run lib/bonzo/script/add-crypto-reserves.ts --config hardhat.bonzo.config.ts --network hederaTestnet
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

const LTV_BPS = 5_000;
const LIQUIDATION_THRESHOLD_BPS = 6_000;
const LIQUIDATION_BONUS_BPS = 11_000;

interface CryptoDef {
  key: string;
  symbol: string;
}

async function main() {
  const assets = (cryptoConfig as { assets: CryptoDef[] }).assets;

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

  const CHUNK_SIZE = 3;
  // Auto-estimated gas ran out mid-execution with empty revert data (gas_used
  // 5,131,707 vs. estimated gas_limit 5,213,990 — confirmed via the mirror
  // node's contracts/results endpoint, since HashIO itself returns no
  // decodable reason for these). ethers' automatic estimateGas is
  // apparently underestimating batchInitReserve's true cost once enough
  // reserves already exist (14 registered before this run) — override with
  // explicit headroom instead of trusting the estimate.
  const BATCH_INIT_GAS_LIMIT = 9_000_000;
  const initInputsAll: Array<{ input: unknown; asset: CryptoDef }> = [];

  for (const asset of assets) {
    const assetAddress = requireContractAddress(NETWORK, asset.key);

    const [existingATokenAddress] = await dataProviderPrecheck.getReserveTokensAddresses(assetAddress);
    if (existingATokenAddress !== ethers.ZeroAddress) {
      console.log(`  ${asset.symbol}: reserve already initialized — skipping`);
      saveContractAddress(NETWORK, `aToken_${asset.symbol}`, existingATokenAddress);
      continue;
    }

    let strategyAddress: string;
    try {
      strategyAddress = requireContractAddress(NETWORK, `InterestRateStrategy_${asset.symbol}`);
      console.log(`  ${asset.symbol} interest rate strategy (reused): ${strategyAddress}`);
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
      saveContractAddress(NETWORK, `InterestRateStrategy_${asset.symbol}`, strategyAddress);
      console.log(`  ${asset.symbol} interest rate strategy:`, strategyAddress);
    }

    initInputsAll.push({
      asset,
      input: {
        aTokenImpl: aTokenImplAddress,
        stableDebtTokenImpl: stableDebtImplAddress,
        variableDebtTokenImpl: variableDebtImplAddress,
        underlyingAssetDecimals: 18,
        interestRateStrategyAddress: strategyAddress,
        underlyingAsset: assetAddress,
        treasury: deployer.address,
        incentivesController: ethers.ZeroAddress,
        underlyingAssetName: asset.symbol,
        aTokenName: `Stratus a${asset.symbol}`,
        aTokenSymbol: `a${asset.symbol}`,
        variableDebtTokenName: `Stratus variableDebt${asset.symbol}`,
        variableDebtTokenSymbol: `variableDebt${asset.symbol}`,
        stableDebtTokenName: `Stratus stableDebt${asset.symbol}`,
        stableDebtTokenSymbol: `stableDebt${asset.symbol}`,
        params: "0x",
      },
    });
  }

  console.log(`\n=== batchInitReserve for ${initInputsAll.length} pending reserve(s), in chunks of ${CHUNK_SIZE} ===`);
  for (let i = 0; i < initInputsAll.length; i += CHUNK_SIZE) {
    const chunk = initInputsAll.slice(i, i + CHUNK_SIZE);
    const symbols = chunk.map((c) => c.asset.symbol).join(", ");
    console.log(`  Batch [${symbols}]...`);
    const initTx = await configurator.batchInitReserve(chunk.map((c) => c.input), { gasLimit: BATCH_INIT_GAS_LIMIT });
    const initReceipt = await initTx.wait();
    console.log(`    tx: ${initTx.hash} (gas used: ${initReceipt!.gasUsed})`);
  }

  console.log("\n=== Configuring risk parameters + enabling borrowing ===");
  for (const { asset } of initInputsAll) {
    const assetAddress = requireContractAddress(NETWORK, asset.key);
    const collateralTx = await configurator.configureReserveAsCollateral(
      assetAddress,
      LTV_BPS,
      LIQUIDATION_THRESHOLD_BPS,
      LIQUIDATION_BONUS_BPS
    );
    await collateralTx.wait();
    const borrowTx = await configurator.enableBorrowingOnReserve(assetAddress, false);
    await borrowTx.wait();
    console.log(`  ${asset.symbol}: LTV=${LTV_BPS / 100}% threshold=${LIQUIDATION_THRESHOLD_BPS / 100}% bonus=${(LIQUIDATION_BONUS_BPS - 10_000) / 100}%, borrowing enabled`);
  }

  console.log("\n=== aToken addresses ===");
  const dataProvider = await ethers.getContractAt("AaveProtocolDataProvider", dataProviderAddress);
  for (const asset of assets) {
    const assetAddress = requireContractAddress(NETWORK, asset.key);
    const [aTokenAddress] = await dataProvider.getReserveTokensAddresses(assetAddress);
    console.log(`  ${asset.symbol}: ${aTokenAddress}`);
    saveContractAddress(NETWORK, `aToken_${asset.symbol}`, aTokenAddress);
  }

  console.log("\n=== DONE: 20 crypto borrow reserves added ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
