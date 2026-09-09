/**
 * Contract addresses for the connected network. Populated from Vite env
 * vars (`.env`, see `.env.example`) which should be kept in sync with
 * `deployments/hederaTestnet.json` after every deploy — copied by hand
 * rather than imported directly, since Vite's dev server restricts
 * filesystem access outside the project root by default.
 */
export const addresses = {
  stratusBasketToken: importEnv("VITE_STRATUS_BASKET_TOKEN"),
  stratusVault: importEnv("VITE_STRATUS_VAULT"),
  stratusRiskView: importEnv("VITE_STRATUS_RISK_VIEW"),
  // The pool is live on the RedStone-backed oracle (real gold/S&P 500
  // prices) — see docs/phase-3-oracle-research.md. The Chainlink and Pyth
  // addresses are kept so the UI/scripts can reference prior oracles if
  // needed; only one is actually live on the pool at a time.
  stratusRedstoneOracle: importEnv("VITE_STRATUS_REDSTONE_PRICE_ORACLE"),
  // Standalone, genuinely real-time price reader — NOT the pool's oracle,
  // see StratusLivePriceReader.sol's docs. Frontend-display-only.
  stratusLivePriceReader: importEnv("VITE_STRATUS_LIVE_PRICE_READER"),
  stratusChainlinkPriceOracle: importEnv("VITE_STRATUS_CHAINLINK_PRICE_ORACLE"),
  stratusPriceOracle: importEnv("VITE_STRATUS_PRICE_ORACLE"),
  lendingPool: importEnv("VITE_LENDING_POOL"),
  protocolDataProvider: importEnv("VITE_PROTOCOL_DATA_PROVIDER"),
  goldToken: importEnv("VITE_GOLD_TOKEN"),
  stockIndexToken: importEnv("VITE_STOCK_INDEX_TOKEN"),
  usdc: importEnv("VITE_USDC"),
  aTokenGold: importEnv("VITE_ATOKEN_GOLD"),
  aTokenStock: importEnv("VITE_ATOKEN_STOCK"),
};

function importEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

// Only the addresses every screen needs at minimum — the two oracle
// addresses are allowed to be blank since only one is actually live at a
// time in practice.
const REQUIRED_KEYS: (keyof typeof addresses)[] = [
  "stratusBasketToken",
  "stratusVault",
  "stratusRiskView",
  "lendingPool",
  "protocolDataProvider",
  "goldToken",
  "stockIndexToken",
  "usdc",
  "aTokenGold",
  "aTokenStock",
];

export function addressesConfigured(): boolean {
  return REQUIRED_KEYS.every((key) => addresses[key].length > 0);
}
