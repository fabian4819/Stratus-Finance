/**
 * Real logos for the assets shown in the UI.
 *
 * - Crypto  → cryptocurrency-icons (color coin SVGs) via jsDelivr CDN.
 * - Stocks  → Financial Modeling Prep's public stock-image endpoint.
 * - Gold    → inline SVG coin (there is no official "gold" logo).
 * - S&P 500 → inline SVG index mark (an index has no company logo).
 *
 * Anything unmapped, or a URL that fails at runtime, falls back to the
 * deterministic initials chip in <TokenBadge> — the network is never on
 * the critical path.
 */

const CRYPTO_ICON = (ticker: string) =>
  `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${ticker.toLowerCase()}.svg`;

const STOCK_ICON = (ticker: string) =>
  `https://financialmodelingprep.com/image-stock/${ticker}.png`;

/** UI symbol (without the "-x") → the ticker FMP files the logo under. */
const STOCK_TICKER: Record<string, string> = {
  AAPL: "AAPL",
  TSLA: "TSLA",
  MSFT: "MSFT",
  NVDA: "NVDA",
  GOOGL: "GOOGL",
  AMZN: "AMZN",
  META: "META",
  BRKB: "BRK-B",
  AMD: "AMD",
  PLTR: "PLTR",
};

const CRYPTO_TICKERS = new Set([
  "BTC", "ETH", "USDT", "USDC", "XRP", "BNB", "SOL", "DOGE", "ADA", "TRX",
  "AVAX", "SHIB", "LINK", "DOT", "BCH", "TON", "SUI", "NEAR", "LTC", "ICP", "UNI",
]);

/** Hedera-ecosystem tokens (Bonzo Finance reserves) — not in the generic
 * cryptocurrency-icons set, so pulled directly from CoinGecko's asset
 * CDN (real project logos, found via CoinGecko's public coin API/search,
 * not guessed). WHBAR (wrapped HBAR) reuses HBAR's own logo — same asset. */
const HEDERA_ICON: Record<string, string> = {
  HBAR: "https://coin-images.coingecko.com/coins/images/3688/large/hbar.png",
  WHBAR: "https://coin-images.coingecko.com/coins/images/3688/large/hbar.png",
  HBARX: "https://coin-images.coingecko.com/coins/images/28590/large/hbarx.png",
  SAUCE: "https://coin-images.coingecko.com/coins/images/27401/large/SAUCE_ICON_FINAL_200x200.png",
};

const svgDataUri = (svg: string) => "data:image/svg+xml," + encodeURIComponent(svg.replace(/\s+/g, " ").trim());

const GOLD_COIN = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="16" fill="#E7B434"/>
    <circle cx="16" cy="16" r="11.5" fill="none" stroke="#A9791A" stroke-width="1.75"/>
    <text x="16" y="20.5" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="11" font-weight="700" fill="#7A560F">Au</text>
  </svg>`);

const SP500_MARK = svgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="16" fill="#0F172A"/>
    <path d="M6 21l6-5 4 3 10-10" fill="none" stroke="#38BDF8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="26" cy="9" r="2.1" fill="#38BDF8"/>
  </svg>`);

export interface AssetLogo {
  url: string;
  /** true = square company logo, needs a white pad + ring; false = full-bleed circular coin. */
  fitted: boolean;
}

export function assetLogo(symbol: string): AssetLogo | null {
  const s = symbol.toUpperCase().replace(/-X$/, "").replace(/[\s&.]/g, "");

  if (s === "GOLD" || s === "XAU") return { url: GOLD_COIN, fitted: false };
  if (s === "STOCK" || s === "SPX" || s === "SP500" || s === "SP500INDEX") {
    return { url: SP500_MARK, fitted: false };
  }
  if (STOCK_TICKER[s]) return { url: STOCK_ICON(STOCK_TICKER[s]), fitted: true };
  if (HEDERA_ICON[s]) return { url: HEDERA_ICON[s], fitted: false };
  if (CRYPTO_TICKERS.has(s)) return { url: CRYPTO_ICON(s), fitted: false };
  return null;
}
