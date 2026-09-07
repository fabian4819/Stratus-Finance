import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * BLOCKED on Phase 2 (contracts/lib/bonzo submodule + pool deployment —
 * see contracts/script/README.md). Written against the pool's expected
 * admin interface so it's ready to run once that lands.
 *
 * Initializes the two isolated reserves with deliberately different risk
 * parameters (PLAN.md §Phase 2 table) and wires StratusPriceOracle as the
 * pool's price oracle. The actual `initReserve` / `configureReserveAsCollateral`
 * calls go through the Bonzo/Aave v2 `LendingPoolConfigurator`, whose
 * concrete address only exists after Phase 2 — this script currently only
 * documents and validates the parameters, it does not yet call the
 * configurator.
 */

interface ReserveConfig {
  name: string;
  ltvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
}

const RESERVES: ReserveConfig[] = [
  { name: "GoldToken", ltvBps: 7_000, liquidationThresholdBps: 7_500, liquidationBonusBps: 10_500 },
  { name: "StockIndexToken", ltvBps: 5_500, liquidationThresholdBps: 6_500, liquidationBonusBps: 11_000 },
];

async function main() {
  const oracleAddress = requireContractAddress(network.name, "StratusPriceOracle");
  console.log(`Oracle: ${oracleAddress}`);

  for (const reserve of RESERVES) {
    const assetAddress = requireContractAddress(network.name, reserve.name);
    console.log(
      `${reserve.name} (${assetAddress}): LTV=${reserve.ltvBps / 100}% ` +
        `threshold=${reserve.liquidationThresholdBps / 100}% ` +
        `bonus=${(reserve.liquidationBonusBps - 10_000) / 100}%`
    );
  }

  throw new Error(
    "Phase 2 not yet complete: contracts/lib/bonzo has no pool deployed. " +
      "See contracts/lib/bonzo/SETUP.md and contracts/script/README.md."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
