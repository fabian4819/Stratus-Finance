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
    <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span aria-hidden="true">⚠</span>
      <p>
        <span className="font-semibold">Demo price stress active</span> — {stressedAssets.join(", ")} price is being
        manually offset for demonstration and does not reflect the live oracle feed.
      </p>
    </div>
  );
}
