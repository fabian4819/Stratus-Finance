/**
 * Persistent "DEMO PRICE STRESS ACTIVE" banner — REQUIRED whenever
 * StratusPriceOracle.isDemoStressed(asset) is true for any asset. See
 * PLAN.md §6.3: an admin-writable oracle offset must never be silently
 * unlabelled in the UI. Wire `stressedAssets` up to a poll of
 * `oracle.isDemoStressed` for each component once the oracle is deployed.
 */
export function DemoStressBanner({ stressedAssets }: { stressedAssets: string[] }) {
  if (stressedAssets.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-center text-sm font-semibold text-amber-200 backdrop-blur-xl">
      ⚠ DEMO PRICE STRESS ACTIVE — {stressedAssets.join(", ")} price is being manually offset for demonstration
      purposes and does not reflect the live oracle feed.
    </div>
  );
}
