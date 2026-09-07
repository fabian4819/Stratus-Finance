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
    <div className="w-full bg-amber-500 text-amber-950 px-4 py-2 text-sm font-semibold text-center">
      ⚠ DEMO PRICE STRESS ACTIVE — {stressedAssets.join(", ")} price is being manually offset for demonstration
      purposes and does not reflect the live oracle feed.
    </div>
  );
}
