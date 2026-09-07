import { useState } from "react";
import { DemoStressBanner } from "../components/DemoStressBanner";
import { addressesConfigured } from "../lib/addresses";

/**
 * Screen 4 (PLAN.md §Phase 5): live Pyth prices, per-component health
 * factor bars, and a "what liquidates first" indicator. Always renders the
 * REAL combined health factor (pool.getUserAccountData) alongside the
 * per-component heuristic (StratusRiskView) — never the component figure
 * alone, per StratusRiskView's contract-level docs.
 *
 * TODO once contracts are deployed:
 *   - poll oracle.getAssetPrice / oracle.isDemoStressed per component
 *   - poll riskView.getUserRisk(user, gold, stock) for the breakdown
 */
export function RiskPanel() {
  // Wired to oracle.isDemoStressed(asset) per-component once deployed.
  const [stressedAssets] = useState<string[]>([]);

  if (!addressesConfigured()) {
    return <NotConfiguredNotice />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <DemoStressBanner stressedAssets={stressedAssets} />

      <div className="p-6">
        <h1 className="text-xl font-semibold mb-4">Risk Panel</h1>

        <div className="rounded-lg border border-slate-200 p-4 mb-6 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Combined health factor (real, enforced)</span>
            <span className="font-medium">—</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <HealthBarPlaceholder label="GOLD-x leg" />
          <HealthBarPlaceholder label="STOCK-x leg" />
        </div>
      </div>
    </div>
  );
}

function HealthBarPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-sm font-medium mb-2">{label}</div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-slate-300" style={{ width: "0%" }} />
      </div>
      <div className="text-xs text-slate-400 mt-1">Component health factor: —</div>
    </div>
  );
}

function NotConfiguredNotice() {
  return (
    <div className="max-w-lg mx-auto p-6 text-sm text-slate-500">
      Contract addresses not configured — copy <code>deployments/hederaTestnet.json</code> values into{" "}
      <code>frontend/.env</code> (see <code>.env.example</code>).
    </div>
  );
}
