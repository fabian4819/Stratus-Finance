/**
 * The 10 individual real-stock reserves, added alongside (not replacing)
 * the original GOLD-x/STOCK-x basket — see
 * docs/phase-4-individual-stocks.md. Each is its own ATS Equity token and
 * its own pool reserve, deposited/borrowed against directly (not wrapped
 * by StratusBasketToken).
 *
 * An 11th candidate, CVX (intended as Chevron), was deployed then dropped
 * after its RedStone price turned out to be Convex Finance's crypto
 * token, not Chevron stock — see tokenization/config/individual-stocks.json.
 * Its on-chain infra exists but is unused and intentionally absent here.
 */
export interface IndividualStock {
  symbol: string; // on-chain ATS symbol, e.g. "AAPL-x"
  displayName: string; // clean name for the UI, e.g. "Apple"
  tokenAddress: string;
  aTokenAddress: string;
}

function importEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

export const individualStocks: IndividualStock[] = [
  { symbol: "AAPL-x", displayName: "Apple", tokenAddress: importEnv("VITE_AAPL_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_AAPL") },
  { symbol: "TSLA-x", displayName: "Tesla", tokenAddress: importEnv("VITE_TSLA_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_TSLA") },
  { symbol: "MSFT-x", displayName: "Microsoft", tokenAddress: importEnv("VITE_MSFT_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_MSFT") },
  { symbol: "NVDA-x", displayName: "Nvidia", tokenAddress: importEnv("VITE_NVDA_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_NVDA") },
  { symbol: "GOOGL-x", displayName: "Alphabet", tokenAddress: importEnv("VITE_GOOGL_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_GOOGL") },
  { symbol: "AMZN-x", displayName: "Amazon", tokenAddress: importEnv("VITE_AMZN_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_AMZN") },
  { symbol: "META-x", displayName: "Meta", tokenAddress: importEnv("VITE_META_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_META") },
  { symbol: "BRKB-x", displayName: "Berkshire Hathaway", tokenAddress: importEnv("VITE_BRKB_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_BRKB") },
  { symbol: "AMD-x", displayName: "AMD", tokenAddress: importEnv("VITE_AMD_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_AMD") },
  { symbol: "PLTR-x", displayName: "Palantir", tokenAddress: importEnv("VITE_PLTR_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_PLTR") },
];

export function individualStocksConfigured(): boolean {
  return individualStocks.every((s) => s.tokenAddress.length > 0 && s.aTokenAddress.length > 0);
}
