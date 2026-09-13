/**
 * All spot RWA reserves deposited/borrowed against directly in the pool
 * (plain LendingPool.deposit/withdraw, no wrapper) — Gold, the S&P 500
 * Index, and 10 individual stocks. See docs/phase-4-individual-stocks.md.
 *
 * Gold and the S&P 500 Index used to be reachable only via
 * StratusBasketToken (mint sETF from both, then vault.depositBasket to
 * decompose into these same two reserves) — removed because it forced a
 * buyer of just one of the two into a dead end. StratusRiskView never
 * required the basket either (getUserRisk takes two arbitrary reserve
 * addresses), so folding these in here needed no contract change.
 *
 * An 11th stock candidate, CVX (intended as Chevron), was deployed then
 * dropped after its RedStone price turned out to be Convex Finance's
 * crypto token, not Chevron stock — see
 * tokenization/config/individual-stocks.json. Its on-chain infra exists
 * but is unused and intentionally absent here.
 */
import { addresses } from "./addresses";

export interface IndividualStock {
  symbol: string; // on-chain ATS symbol, e.g. "AAPL-x"
  displayName: string; // clean name for the UI, e.g. "Apple"
  tokenAddress: string;
  aTokenAddress: string;
  redstoneFeedId: string; // for StratusLivePriceReader — see liveRedstonePrice.ts
}

function importEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

export const individualStocks: IndividualStock[] = [
  { symbol: "GOLD-x", displayName: "Gold", tokenAddress: addresses.goldToken, aTokenAddress: addresses.aTokenGold, redstoneFeedId: "XAU" },
  { symbol: "STOCK-x", displayName: "S&P 500 Index", tokenAddress: addresses.stockIndexToken, aTokenAddress: addresses.aTokenStock, redstoneFeedId: "USA500.Y" },
  { symbol: "AAPL-x", displayName: "Apple", tokenAddress: importEnv("VITE_AAPL_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_AAPL"), redstoneFeedId: "AAPL" },
  { symbol: "TSLA-x", displayName: "Tesla", tokenAddress: importEnv("VITE_TSLA_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_TSLA"), redstoneFeedId: "TSLA" },
  { symbol: "MSFT-x", displayName: "Microsoft", tokenAddress: importEnv("VITE_MSFT_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_MSFT"), redstoneFeedId: "MSFT" },
  { symbol: "NVDA-x", displayName: "Nvidia", tokenAddress: importEnv("VITE_NVDA_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_NVDA"), redstoneFeedId: "NVDA" },
  { symbol: "GOOGL-x", displayName: "Alphabet", tokenAddress: importEnv("VITE_GOOGL_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_GOOGL"), redstoneFeedId: "GOOGL" },
  { symbol: "AMZN-x", displayName: "Amazon", tokenAddress: importEnv("VITE_AMZN_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_AMZN"), redstoneFeedId: "AMZN" },
  { symbol: "META-x", displayName: "Meta", tokenAddress: importEnv("VITE_META_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_META"), redstoneFeedId: "META" },
  { symbol: "BRKB-x", displayName: "Berkshire Hathaway", tokenAddress: importEnv("VITE_BRKB_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_BRKB"), redstoneFeedId: "BRKB" },
  { symbol: "AMD-x", displayName: "AMD", tokenAddress: importEnv("VITE_AMD_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_AMD"), redstoneFeedId: "AMD" },
  { symbol: "PLTR-x", displayName: "Palantir", tokenAddress: importEnv("VITE_PLTR_TOKEN"), aTokenAddress: importEnv("VITE_ATOKEN_PLTR"), redstoneFeedId: "PLTR" },
];

export function individualStocksConfigured(): boolean {
  return individualStocks.every((s) => s.tokenAddress.length > 0 && s.aTokenAddress.length > 0);
}
