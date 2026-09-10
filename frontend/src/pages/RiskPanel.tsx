import { useEffect, useState, useCallback } from "react";
import { formatEther, MaxUint256 } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { DemoStressBanner } from "../components/DemoStressBanner";
import { addresses, addressesConfigured } from "../lib/addresses";
import { getOracle, getRiskView } from "../lib/contracts";
import { readProvider } from "../lib/wallet";
import { fetchLivePrices } from "../lib/liveRedstonePrice";

interface ComponentRisk {
  aTokenBalance: bigint;
  collateralValueUsd: bigint;
  componentHealthFactor: bigint;
}

/** PLAN.md §Phase 5, Screen 4: live prices, per-component health factor
 * bars, and the demo-stress banner. Always renders the REAL combined
 * health factor (pool.getUserAccountData, via StratusRiskView) alongside
 * the per-component heuristic — never the component figure alone, per
 * StratusRiskView's contract-level docs. */
export function RiskPanel() {
  const { signer, address, connect } = useWallet();
  const [prices, setPrices] = useState<{ gold: bigint; stock: bigint; usdc: bigint } | null>(null);
  const [stressedAssets, setStressedAssets] = useState<string[]>([]);
  const [risk, setRisk] = useState<{ components: ComponentRisk[]; combinedHealthFactor: bigint } | null>(null);

  const refresh = useCallback(async () => {
    // Prices/stress status are public data — readable without a connected
    // wallet via a plain RPC provider; only the per-user risk breakdown
    // needs an actual address.
    const oracle = getOracle(signer ?? readProvider);

    const [goldStressed, stockStressed] = await Promise.all([
      oracle.isDemoStressed(addresses.goldToken),
      oracle.isDemoStressed(addresses.stockIndexToken),
    ]);

    // Genuinely real-time — StratusLivePriceReader, not the pool's cached
    // oracle (see liveRedstonePrice.ts). Falls back to the cache if the
    // live gateway call fails (e.g. offline), so the panel still shows
    // *a* number rather than blanking out.
    try {
      const live = await fetchLivePrices(["XAU", "USA500.Y", "USDC"]);
      setPrices({ gold: live["XAU"], stock: live["USA500.Y"], usdc: live["USDC"] });
    } catch (liveErr) {
      console.error("fetchLivePrices failed:", liveErr);
      try {
        const [goldPrice, stockPrice, usdcPrice] = await Promise.all([
          oracle.getAssetPrice(addresses.goldToken),
          oracle.getAssetPrice(addresses.stockIndexToken),
          oracle.getAssetPrice(addresses.usdc),
        ]);
        setPrices({ gold: goldPrice, stock: stockPrice, usdc: usdcPrice });
      } catch {
        setPrices(null);
      }
    }

    const stressed: string[] = [];
    if (goldStressed) stressed.push("Gold");
    if (stockStressed) stressed.push("S&P 500 Index");
    setStressedAssets(stressed);

    if (address) {
      const riskView = getRiskView(signer ?? readProvider);
      const userRisk = await riskView.getUserRisk(address, addresses.goldToken, addresses.stockIndexToken);
      setRisk({ components: userRisk.components, combinedHealthFactor: userRisk.combinedHealthFactor });
    }
  }, [signer, address]);

  useEffect(() => {
    refresh();
    // Poll — the price row above is genuinely real-time (StratusLivePriceReader,
    // a fresh wrapped read every call), but the combined health factor and
    // per-leg cards still come from the pool's cached oracle
    // (StratusRedstoneOracle) via StratusRiskView, since that's what
    // deposit/borrow/liquidation actually enforce — see
    // docs/phase-3-oracle-research.md for why that side can't be made
    // real-time the same way.
    const interval = setInterval(refresh, 6_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  return (
    <div className="mx-auto max-w-3xl">
      <DemoStressBanner stressedAssets={stressedAssets} />

      <h1 className="mb-4 text-2xl font-semibold tracking-tight text-white">Risk Panel</h1>

      {!address && (
        <button onClick={connect} className="btn-primary mb-6">
          Connect wallet for your position
        </button>
      )}

      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Live market prices
      </div>
      <div className="glass-panel mb-4 space-y-1 p-4 text-sm">
        <div className="stat-row">
          <span className="stat-label">Gold price (XAU/USD)</span>
          <span className="stat-value">{prices ? `$${Number(formatEther(prices.gold)).toFixed(2)}` : "—"}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">S&amp;P 500 Index price</span>
          <span className="stat-value">{prices ? `$${Number(formatEther(prices.stock)).toFixed(2)}` : "—"}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">USDC price</span>
          <span className="stat-value">{prices ? `$${Number(formatEther(prices.usdc)).toFixed(4)}` : "—"}</span>
        </div>
      </div>

      <div className="mb-1 text-xs text-slate-500">
        Uses the protocol's cached price (refreshed periodically) — what deposit/borrow/liquidation actually enforce
      </div>
      <div className="glass-panel mb-6 flex justify-between p-4 text-sm">
        <span className="stat-label">Combined health factor (real, enforced)</span>
        <span className="stat-value font-medium">
          {risk
            ? risk.combinedHealthFactor >= MaxUint256 / 2n
              ? "MAX (no debt)"
              : Number(formatEther(risk.combinedHealthFactor)).toFixed(2)
            : "—"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <HealthBar label="Gold leg" component={risk?.components[0]} />
        <HealthBar label="S&P 500 Index leg" component={risk?.components[1]} />
      </div>
    </div>
  );
}

function HealthBar({ label, component }: { label: string; component?: ComponentRisk }) {
  const hf = component?.componentHealthFactor;
  const isMax = hf !== undefined && hf >= MaxUint256 / 2n;
  // Cap the visual bar at HF=3 for a readable width; anything past that reads as "healthy" regardless.
  const pct = hf === undefined ? 0 : isMax ? 100 : Math.min(100, (Number(formatEther(hf)) / 3) * 100);
  const barColor = isMax || (hf !== undefined && Number(formatEther(hf)) >= 1.2) ? "bg-emerald-400" : "bg-amber-500";

  return (
    <div className="glass-panel p-4">
      <div className="mb-2 text-sm font-medium text-white">{label}</div>
      <div className="h-2 w-full rounded-full bg-white/10">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-400">
        Component health factor: {hf === undefined ? "—" : isMax ? "MAX" : Number(formatEther(hf)).toFixed(2)}
      </div>
      {component && (
        <div className="text-xs text-slate-400">
          Collateral value: ${Number(formatEther(component.collateralValueUsd)).toFixed(2)}
        </div>
      )}
    </div>
  );
}

function NotConfiguredNotice() {
  return (
    <div className="glass-panel mx-auto max-w-lg p-6 text-sm text-slate-400">
      Contract addresses not configured — copy <code className="inline-code">deployments/hederaTestnet.json</code>{" "}
      values into <code className="inline-code">frontend/.env</code> (see{" "}
      <code className="inline-code">.env.example</code>).
    </div>
  );
}
