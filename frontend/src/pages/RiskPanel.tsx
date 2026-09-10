import { useEffect, useState, useCallback } from "react";
import { formatEther, MaxUint256 } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { DemoStressBanner } from "../components/DemoStressBanner";
import { addresses, addressesConfigured } from "../lib/addresses";
import { getOracle, getRiskView } from "../lib/contracts";
import { readProvider } from "../lib/wallet";
import { fetchLivePrices } from "../lib/liveRedstonePrice";
import { PageHeader, TokenBadge, StatCard, NotConfiguredNotice, HealthFactor } from "../components/ui";

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
    const oracle = getOracle(signer ?? readProvider);

    const [goldStressed, stockStressed] = await Promise.all([
      oracle.isDemoStressed(addresses.goldToken),
      oracle.isDemoStressed(addresses.stockIndexToken),
    ]);

    // Genuinely real-time — StratusLivePriceReader, not the pool's cached
    // oracle (see liveRedstonePrice.ts). Falls back to the cache if the
    // live gateway call fails, so the panel still shows a number.
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
    // Poll — the price row is genuinely real-time (StratusLivePriceReader,
    // a fresh wrapped read every call); the combined health factor and
    // per-leg cards still come from the pool's cached oracle via
    // StratusRiskView, since that's what deposit/borrow/liquidation
    // enforce — see docs/phase-3-oracle-research.md.
    const interval = setInterval(refresh, 6_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  const totalCollateral = risk?.components.reduce((acc, c) => acc + c.collateralValueUsd, 0n);
  const price = (v: bigint | undefined, dp = 2) =>
    v !== undefined ? `$${Number(formatEther(v)).toFixed(dp)}` : "—";

  let statusWord = "—";
  if (risk) {
    if (risk.combinedHealthFactor >= MaxUint256 / 2n) statusWord = "No debt";
    else {
      const n = Number(formatEther(risk.combinedHealthFactor));
      statusWord = n >= 1.5 ? "Healthy" : n >= 1.05 ? "Watch" : "At risk";
    }
  }

  return (
    <div>
      <DemoStressBanner stressedAssets={stressedAssets} />
      <PageHeader
        title="Portfolio"
        subtitle="Your position, priced live and cross-checked against the pool's own enforced numbers."
      />

      {!address && (
        <div className="mb-5">
          <button onClick={connect} className="btn-primary">
            Connect wallet for your position
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Collateral value"
          value={totalCollateral !== undefined ? price(totalCollateral) : "—"}
          hint="Gold + S&P 500 Index legs"
        />
        <div className="card p-4">
          <div className="stat-label">Combined health factor</div>
          <div className="mt-1 text-xl">
            <HealthFactor hf={risk?.combinedHealthFactor} />
          </div>
          <div className="mt-0.5 text-xs text-slate-400">Real, enforced by the pool</div>
        </div>
        <StatCard label="Status" value={statusWord} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <h2 className="section-title">Live market prices</h2>
          </div>
          <div className="space-y-2.5 text-sm">
            <PriceRow symbol="GOLD" name="Gold (XAU/USD)" value={price(prices?.gold)} />
            <PriceRow symbol="SPX" name="S&P 500 Index" value={price(prices?.stock)} />
            <PriceRow symbol="USDC" name="USDC" value={price(prices?.usdc, 4)} />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="section-title mb-3">Health by leg</h2>
          <div className="space-y-4">
            <HealthBar label="Gold leg" component={risk?.components[0]} />
            <HealthBar label="S&P 500 Index leg" component={risk?.components[1]} />
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Per-leg figures are a heuristic. The combined health factor above is the number the pool actually
            enforces.
          </p>
        </div>
      </div>
    </div>
  );
}

function PriceRow({ symbol, name, value }: { symbol: string; name: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-600">
        <TokenBadge symbol={symbol} size={22} />
        {name}
      </span>
      <span className="tabular-nums font-medium text-slate-900">{value}</span>
    </div>
  );
}

function HealthBar({ label, component }: { label: string; component?: ComponentRisk }) {
  const hf = component?.componentHealthFactor;
  const isMax = hf !== undefined && hf >= MaxUint256 / 2n;
  const pct = hf === undefined ? 0 : isMax ? 100 : Math.min(100, (Number(formatEther(hf)) / 3) * 100);
  const healthy = isMax || (hf !== undefined && Number(formatEther(hf)) >= 1.2);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <HealthFactor hf={hf} />
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${healthy ? "bg-emerald-500" : "bg-amber-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {component && (
        <div className="mt-1 text-xs text-slate-400">
          Collateral value ${Number(formatEther(component.collateralValueUsd)).toFixed(2)}
        </div>
      )}
    </div>
  );
}
