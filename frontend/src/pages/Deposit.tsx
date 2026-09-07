import { addressesConfigured } from "../lib/addresses";

/**
 * Screen 2 (PLAN.md §Phase 5) — the pitch screen. One deposit action
 * (StratusVault.depositBasket), then show the decomposition result as two
 * reserve cards, each with its own LTV, liquidation threshold, live price,
 * and per-component health factor (from StratusRiskView.getUserRisk).
 *
 * TODO once contracts are deployed:
 *   - approve StratusBasketToken for the vault, call depositBasket(amount)
 *   - after the tx, read StratusRiskView.getUserRisk(user, gold, stock)
 *     and render both ComponentRisk cards + the combined health factor
 */
export function Deposit() {
  if (!addressesConfigured()) {
    return <NotConfiguredNotice />;
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Deposit &amp; Decompose</h1>
      <p className="text-sm text-slate-600 mb-6">
        Depositing your basket token splits it into two isolated reserve positions — each with independent risk
        parameters. A price move in one leg never forces liquidation of the other.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <ReserveCardPlaceholder label="GOLD-x reserve" ltv="70%" threshold="75%" />
        <ReserveCardPlaceholder label="STOCK-x reserve" ltv="55%" threshold="65%" />
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        Deposit form — wire up once StratusVault + StratusRiskView are deployed
        (contracts/script/04-deploy-vault.ts)
      </div>
    </div>
  );
}

function ReserveCardPlaceholder({ label, ltv, threshold }: { label: string; ltv: string; threshold: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-sm font-medium mb-2">{label}</div>
      <dl className="text-xs text-slate-500 space-y-1">
        <div className="flex justify-between">
          <dt>LTV</dt>
          <dd>{ltv}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Liquidation threshold</dt>
          <dd>{threshold}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Component health factor</dt>
          <dd>—</dd>
        </div>
      </dl>
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
