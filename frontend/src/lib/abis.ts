/**
 * Minimal ABI fragments — just the functions/events each screen actually
 * calls, matching the hand-written-fragment style used throughout the
 * rest of this repo (contracts/script/*, tokenization/scripts/lib/ats-client.ts)
 * rather than importing full generated artifacts into the frontend bundle.
 */

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export const STRATUS_BASKET_TOKEN_ABI = [
  ...ERC20_ABI,
  "function previewComponents(uint256 basketAmount) view returns (uint256 amountA, uint256 amountB)",
  "function mint(uint256 basketAmount) returns (uint256 amountA, uint256 amountB)",
  "function redeem(uint256 basketAmount) returns (uint256 amountA, uint256 amountB)",
  "function componentA() view returns (address)",
  "function componentB() view returns (address)",
  "function ratioABps() view returns (uint256)",
];

export const STRATUS_VAULT_ABI = [
  "function depositBasket(uint256 basketAmount)",
  "function recomposeBasket(uint256 basketAmount)",
  "event BasketDecomposed(address indexed user, uint256 basketAmount, uint256 amountA, uint256 amountB)",
  "event BasketRecomposed(address indexed user, uint256 basketAmount, uint256 amountA, uint256 amountB)",
];

export const LENDING_POOL_ABI = [
  "function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
  "function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)",
  "function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf) returns (uint256)",
  "function getUserAccountData(address user) view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
];

export const PROTOCOL_DATA_PROVIDER_ABI = [
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
  "function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
];

export const RISK_VIEW_ABI = [
  "function getUserRisk(address user, address componentA, address componentB) view returns (tuple(tuple(address asset, uint256 aTokenBalance, uint256 collateralValueUsd, uint256 liquidationThresholdBps, uint256 debtShareUsd, uint256 componentHealthFactor)[2] components, uint256 totalCollateralUsd, uint256 totalDebtUsd, uint256 combinedHealthFactor))",
];

// Same shape for both StratusPriceOracle (Pyth) and
// StratusChainlinkPriceOracle — see StratusVault's contract docs on why
// the pool is actually wired to the Chainlink one.
export const ORACLE_ABI = [
  "function getAssetPrice(address asset) view returns (uint256)",
  "function isDemoStressed(address asset) view returns (bool)",
  "function demoOffsetBps(address asset) view returns (int256)",
];

export const MARKETPLACE_ABI = [
  "function quote(address token, uint256 tokenAmount) view returns (uint256 usdcCost)",
  "function buy(address token, uint256 tokenAmount)",
  "function sellable(address token) view returns (bool)",
];
