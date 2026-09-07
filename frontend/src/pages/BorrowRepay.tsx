import { addressesConfigured } from "../lib/addresses";

/**
 * Screen 3 (PLAN.md §Phase 5): borrow/repay USDC directly against the pool
 * (ILendingPool.borrow/repay — the vault is not in this path, see
 * StratusVault contract docs). Combined capacity is shown as the itemised
 * sum of each component's contribution, not a single blended number.
 *
 * TODO once contracts are deployed:
 *   - read pool.getUserAccountData for availableBorrows
 *   - read StratusRiskView for the per-component capacity breakdown
 *   - borrow(usdc, amount, variableRate=2, 0, user) / repay(...)
 */
export function BorrowRepay() {
  if (!addressesConfigured()) {
    return <NotConfiguredNotice />;
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Borrow / Repay USDC</h1>

      <div className="rounded-lg border border-slate-200 p-4 mb-6 text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-slate-500">From GOLD-x leg</span>
          <span>— USDC</span>
        </div>
        <div className="flex justify-between mb-1">
          <span className="text-slate-500">From STOCK-x leg</span>
          <span>— USDC</span>
        </div>
        <div className="flex justify-between font-medium border-t border-slate-200 pt-1 mt-1">
          <span>Combined available to borrow</span>
          <span>— USDC</span>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        Borrow/repay form — wire up once the pool is deployed (Phase 2)
      </div>
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
