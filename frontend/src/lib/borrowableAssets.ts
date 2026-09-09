/**
 * Every asset a user can choose to borrow — USDC plus the 20
 * top-market-cap crypto reserves (see docs/phase-5-crypto-borrow.md).
 * Aave v2's borrow() is account-level, not tied to a specific
 * collateral — any of these can be borrowed against any deposited
 * collateral (basket legs, individual stocks) as long as capacity and
 * pool liquidity allow it.
 */
export interface BorrowableAsset {
  symbol: string;
  displayName: string;
  tokenAddress: string;
  decimals: number;
}

function importEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

export const borrowableAssets: BorrowableAsset[] = [
  { symbol: "USDC", displayName: "USDC", tokenAddress: importEnv("VITE_USDC"), decimals: 6 },
  { symbol: "BTC", displayName: "Bitcoin", tokenAddress: importEnv("VITE_BTC_TOKEN"), decimals: 18 },
  { symbol: "ETH", displayName: "Ethereum", tokenAddress: importEnv("VITE_ETH_TOKEN"), decimals: 18 },
  { symbol: "USDT", displayName: "Tether", tokenAddress: importEnv("VITE_USDT_TOKEN"), decimals: 18 },
  { symbol: "XRP", displayName: "XRP", tokenAddress: importEnv("VITE_XRP_TOKEN"), decimals: 18 },
  { symbol: "BNB", displayName: "BNB", tokenAddress: importEnv("VITE_BNB_TOKEN"), decimals: 18 },
  { symbol: "SOL", displayName: "Solana", tokenAddress: importEnv("VITE_SOL_TOKEN"), decimals: 18 },
  { symbol: "DOGE", displayName: "Dogecoin", tokenAddress: importEnv("VITE_DOGE_TOKEN"), decimals: 18 },
  { symbol: "ADA", displayName: "Cardano", tokenAddress: importEnv("VITE_ADA_TOKEN"), decimals: 18 },
  { symbol: "TRX", displayName: "Tron", tokenAddress: importEnv("VITE_TRX_TOKEN"), decimals: 18 },
  { symbol: "AVAX", displayName: "Avalanche", tokenAddress: importEnv("VITE_AVAX_TOKEN"), decimals: 18 },
  { symbol: "SHIB", displayName: "Shiba Inu", tokenAddress: importEnv("VITE_SHIB_TOKEN"), decimals: 18 },
  { symbol: "LINK", displayName: "Chainlink", tokenAddress: importEnv("VITE_LINK_TOKEN"), decimals: 18 },
  { symbol: "DOT", displayName: "Polkadot", tokenAddress: importEnv("VITE_DOT_TOKEN"), decimals: 18 },
  { symbol: "BCH", displayName: "Bitcoin Cash", tokenAddress: importEnv("VITE_BCH_TOKEN"), decimals: 18 },
  { symbol: "TON", displayName: "Toncoin", tokenAddress: importEnv("VITE_TON_TOKEN"), decimals: 18 },
  { symbol: "SUI", displayName: "Sui", tokenAddress: importEnv("VITE_SUI_TOKEN"), decimals: 18 },
  { symbol: "NEAR", displayName: "NEAR", tokenAddress: importEnv("VITE_NEAR_TOKEN"), decimals: 18 },
  { symbol: "LTC", displayName: "Litecoin", tokenAddress: importEnv("VITE_LTC_TOKEN"), decimals: 18 },
  { symbol: "ICP", displayName: "Internet Computer", tokenAddress: importEnv("VITE_ICP_TOKEN"), decimals: 18 },
  { symbol: "UNI", displayName: "Uniswap", tokenAddress: importEnv("VITE_UNI_TOKEN"), decimals: 18 },
];
