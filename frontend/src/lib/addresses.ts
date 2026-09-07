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
  stratusPriceOracle: importEnv("VITE_STRATUS_PRICE_ORACLE"),
  stratusRiskView: importEnv("VITE_STRATUS_RISK_VIEW"),
  lendingPool: importEnv("VITE_LENDING_POOL"),
  goldToken: importEnv("VITE_GOLD_TOKEN"),
  stockIndexToken: importEnv("VITE_STOCK_INDEX_TOKEN"),
  usdc: importEnv("VITE_USDC"),
};

function importEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

export function addressesConfigured(): boolean {
  return Object.values(addresses).every((a) => a.length > 0);
}
