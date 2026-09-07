import { addressesConfigured } from "../lib/addresses";

/**
 * Screen 1 (PLAN.md §Phase 5): acquire/mint GOLD-x + STOCK-x, then mint the
 * basket token via StratusBasketToken.mint(amount).
 *
 * TODO once contracts are deployed:
 *   - read previewComponents(amount) to show the exact GOLD-x/STOCK-x split
 *   - approve() both components for the basket token, then call mint()
 *   - surface balances via ethers.Contract reads
 */
export function MintBasket() {
  if (!addressesConfigured()) {
    return <NotConfiguredNotice />;
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Mint Stratus ETF</h1>
      <p className="text-sm text-slate-600 mb-6">
        Acquire GOLD-x and STOCK-x (50/50) and mint them into one Stratus ETF basket token.
      </p>
      {/* TODO: amount input, previewComponents() readout, approve+mint flow */}
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
        Mint form — wire up once StratusBasketToken is deployed (contracts/script/01-deploy-basket-token.ts)
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
