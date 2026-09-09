/**
 * The 12 tokens sellable through StratusMarketplace — GOLD-x, STOCK-x,
 * and the 10 individual stocks. Combines addresses.ts (basket assets)
 * and individualStocks.ts (the stock reserves) into one list for the Buy
 * page's asset picker. See docs/phase-4-individual-stocks.md and
 * StratusMarketplace.sol.
 */
import { addresses } from "./addresses";
import { individualStocks } from "./individualStocks";

export interface SellableAsset {
  symbol: string;
  displayName: string;
  tokenAddress: string;
}

export const sellableAssets: SellableAsset[] = [
  { symbol: "GOLD-x", displayName: "Gold", tokenAddress: addresses.goldToken },
  { symbol: "STOCK-x", displayName: "S&P 500 Index", tokenAddress: addresses.stockIndexToken },
  ...individualStocks.map((s) => ({ symbol: s.symbol, displayName: s.displayName, tokenAddress: s.tokenAddress })),
];
