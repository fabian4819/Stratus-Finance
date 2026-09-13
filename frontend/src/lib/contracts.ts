import { Contract, type ContractRunner } from "ethers";
import { addresses } from "./addresses";
import {
  ERC20_ABI,
  MINTABLE_ERC20_ABI,
  LENDING_POOL_ABI,
  PROTOCOL_DATA_PROVIDER_ABI,
  RISK_VIEW_ABI,
  ORACLE_ABI,
  MARKETPLACE_ABI,
} from "./abis";

export function getErc20(address: string, runner: ContractRunner) {
  return new Contract(address, ERC20_ABI, runner);
}

/** MockUSDC / MockCrypto with their open testnet `mint` — see pages/Faucet.tsx. */
export function getMintableErc20(address: string, runner: ContractRunner) {
  return new Contract(address, MINTABLE_ERC20_ABI, runner);
}

export function getPool(runner: ContractRunner) {
  return new Contract(addresses.lendingPool, LENDING_POOL_ABI, runner);
}

export function getDataProvider(runner: ContractRunner) {
  return new Contract(addresses.protocolDataProvider, PROTOCOL_DATA_PROVIDER_ABI, runner);
}

export function getRiskView(runner: ContractRunner) {
  return new Contract(addresses.stratusRiskView, RISK_VIEW_ABI, runner);
}

/** The pool is live on this oracle (RedStone-backed, real gold/S&P 500
 * prices) — see docs/phase-3-oracle-research.md. Its prices only refresh
 * when script/update-redstone-prices.ts runs (pull/cache model, not a
 * continuous push) — this just reads whatever's currently cached. */
export function getOracle(runner: ContractRunner) {
  return new Contract(addresses.stratusRedstoneOracle, ORACLE_ABI, runner);
}

export function getUsdc(runner: ContractRunner) {
  return getErc20(addresses.usdc, runner);
}

/** Self-serve "buy tokenized assets with USDC" — see StratusMarketplace.sol. */
export function getMarketplace(runner: ContractRunner) {
  return new Contract(addresses.stratusMarketplace, MARKETPLACE_ABI, runner);
}
