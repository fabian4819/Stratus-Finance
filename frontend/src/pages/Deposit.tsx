import { useEffect, useState, useCallback } from "react";
import { formatEther, parseEther, MaxUint256 } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { addresses, addressesConfigured } from "../lib/addresses";
import { getBasketToken, getVault, getRiskView, getDataProvider } from "../lib/contracts";

interface ReserveConfig {
  ltvBps: bigint;
  liquidationThresholdBps: bigint;
}

interface ComponentRisk {
  asset: string;
  aTokenBalance: bigint;
  collateralValueUsd: bigint;
  liquidationThresholdBps: bigint;
  debtShareUsd: bigint;
  componentHealthFactor: bigint;
}

/** PLAN.md §Phase 5, Screen 2 — the pitch screen. One depositBasket()
 * action, then the two decomposed reserve positions shown side by side
 * with their own risk parameters and live health factor, read from
 * StratusRiskView.getUserRisk. */
export function Deposit() {
  const { signer, address, connect } = useWallet();
  const [amount, setAmount] = useState("10");
  const [basketBalance, setBasketBalance] = useState<bigint | null>(null);
  const [risk, setRisk] = useState<{ components: ComponentRisk[]; combinedHealthFactor: bigint } | null>(null);
  const [configs, setConfigs] = useState<[ReserveConfig, ReserveConfig] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!signer || !address) return;
    const basket = getBasketToken(signer);
    const riskView = getRiskView(signer);
    const dataProvider = getDataProvider(signer);

    const [balance, userRisk, goldConfig, stockConfig] = await Promise.all([
      basket.balanceOf(address),
      riskView.getUserRisk(address, addresses.goldToken, addresses.stockIndexToken),
      dataProvider.getReserveConfigurationData(addresses.goldToken),
      dataProvider.getReserveConfigurationData(addresses.stockIndexToken),
    ]);

    setBasketBalance(balance);
    setRisk({ components: userRisk.components, combinedHealthFactor: userRisk.combinedHealthFactor });
    setConfigs([
      { ltvBps: goldConfig.ltv, liquidationThresholdBps: goldConfig.liquidationThreshold },
      { ltvBps: stockConfig.ltv, liquidationThresholdBps: stockConfig.liquidationThreshold },
    ]);
  }, [signer, address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDeposit() {
    if (!signer) return;
    setBusy(true);
    setStatus(null);
    try {
      const vaultAddress = await getVault(signer).getAddress();
      const basket = getBasketToken(signer);
      const vault = getVault(signer);
      const basketAmount = parseEther(amount);

      setStatus("Approving vault...");
      await (await basket.approve(vaultAddress, basketAmount)).wait();
      setStatus("Depositing (decomposing into isolated reserves)...");
      const tx = await vault.depositBasket(basketAmount);
      await tx.wait();
      setStatus(`Deposited ${amount} sETF. Tx: ${tx.hash.slice(0, 10)}...`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  const labels = ["GOLD-x reserve", "STOCK-x reserve"];

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Deposit &amp; Decompose</h1>
      <p className="text-sm text-slate-600 mb-6">
        Depositing your basket token splits it into two isolated reserve positions — each with independent risk
        parameters. A price move in one leg never forces liquidation of the other.
      </p>

      {!address ? (
        <button onClick={connect} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Connect wallet to continue
        </button>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {labels.map((label, i) => {
              const c = risk?.components[i];
              const cfg = configs?.[i];
              return (
                <ReserveCard
                  key={label}
                  label={label}
                  ltvBps={cfg?.ltvBps}
                  thresholdBps={cfg?.liquidationThresholdBps}
                  collateralValueUsd={c?.collateralValueUsd}
                  healthFactor={c?.componentHealthFactor}
                />
              );
            })}
          </div>

          {risk && (
            <div className="rounded-lg border border-slate-200 p-4 mb-6 text-sm flex justify-between">
              <span className="text-slate-500">Combined health factor (real, enforced by the pool)</span>
              <span className="font-medium">{formatHealthFactor(risk.combinedHealthFactor)}</span>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-4 mb-4 text-sm flex justify-between">
            <span className="text-slate-500">Your sETF balance</span>
            <span>{basketBalance !== null ? formatEther(basketBalance) : "—"}</span>
          </div>

          <label className="block text-sm font-medium mb-1">Amount to deposit (sETF)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4"
          />
          <button
            onClick={handleDeposit}
            disabled={busy || !amount}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Depositing..." : "Approve + Deposit"}
          </button>
          {status && <p className="mt-3 text-xs text-slate-600 break-all">{status}</p>}
        </>
      )}
    </div>
  );
}

function formatHealthFactor(hf: bigint): string {
  if (hf >= MaxUint256 / 2n) return "MAX (no debt)";
  return Number(formatEther(hf)).toFixed(2);
}

function ReserveCard({
  label,
  ltvBps,
  thresholdBps,
  collateralValueUsd,
  healthFactor,
}: {
  label: string;
  ltvBps?: bigint;
  thresholdBps?: bigint;
  collateralValueUsd?: bigint;
  healthFactor?: bigint;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="text-sm font-medium mb-2">{label}</div>
      <dl className="text-xs text-slate-500 space-y-1">
        <div className="flex justify-between">
          <dt>LTV</dt>
          <dd>{ltvBps !== undefined ? `${Number(ltvBps) / 100}%` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Liquidation threshold</dt>
          <dd>{thresholdBps !== undefined ? `${Number(thresholdBps) / 100}%` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Collateral value</dt>
          <dd>{collateralValueUsd !== undefined ? `$${Number(formatEther(collateralValueUsd)).toFixed(2)}` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Component health factor*</dt>
          <dd>{healthFactor !== undefined ? formatHealthFactor(healthFactor) : "—"}</dd>
        </div>
      </dl>
      <p className="text-[10px] text-slate-400 mt-2">*Heuristic — see combined health factor for the real, enforced number.</p>
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
