import { Contract, type ContractRunner } from "ethers";
import { addresses } from "./addresses";
import {
  ERC20_ABI,
  STRATUS_BASKET_TOKEN_ABI,
  STRATUS_VAULT_ABI,
  LENDING_POOL_ABI,
  PROTOCOL_DATA_PROVIDER_ABI,
  RISK_VIEW_ABI,
  ORACLE_ABI,
} from "./abis";

export function getErc20(address: string, runner: ContractRunner) {
  return new Contract(address, ERC20_ABI, runner);
}

export function getBasketToken(runner: ContractRunner) {
  return new Contract(addresses.stratusBasketToken, STRATUS_BASKET_TOKEN_ABI, runner);
}

export function getVault(runner: ContractRunner) {
  return new Contract(addresses.stratusVault, STRATUS_VAULT_ABI, runner);
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

/** The pool is live on this oracle (Chainlink-backed), not the originally
 * designed Pyth one — see docs/phase-2-findings.md. */
export function getOracle(runner: ContractRunner) {
  return new Contract(addresses.stratusChainlinkPriceOracle, ORACLE_ABI, runner);
}

export function getGoldToken(runner: ContractRunner) {
  return getErc20(addresses.goldToken, runner);
}

export function getStockToken(runner: ContractRunner) {
  return getErc20(addresses.stockIndexToken, runner);
}

export function getUsdc(runner: ContractRunner) {
  return getErc20(addresses.usdc, runner);
}
