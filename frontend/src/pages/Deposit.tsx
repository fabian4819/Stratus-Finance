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

  const labels = ["Gold reserve", "S&P 500 Index reserve"];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-white">Deposit &amp; Decompose</h1>
      <p className="mb-6 text-sm text-slate-400">
        Depositing your basket token splits it into two isolated reserve positions — each with independent risk
        parameters. A price move in one leg never forces liquidation of the other.
      </p>

      {!address ? (
        <button onClick={connect} className="btn-primary">
          Connect wallet to continue
        </button>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="glass-panel mb-6 flex justify-between p-4 text-sm">
              <span className="stat-label">Combined health factor (real, enforced by the pool)</span>
              <span className="stat-value font-medium">{formatHealthFactor(risk.combinedHealthFactor)}</span>
            </div>
          )}

          <div className="glass-panel mb-4 flex justify-between p-4 text-sm">
            <span className="stat-label">Your sETF balance</span>
            <span className="stat-value">{basketBalance !== null ? formatEther(basketBalance) : "—"}</span>
          </div>

          <label className="field-label">Amount to deposit (sETF)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="glass-input mb-4"
          />
          <button onClick={handleDeposit} disabled={busy || !amount} className="btn-primary w-full">
            {busy ? "Depositing..." : "Approve + Deposit"}
          </button>
          {status && <p className="mt-3 break-all text-xs text-slate-400">{status}</p>}
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
    <div className="glass-panel p-4">
      <div className="mb-2 text-sm font-medium text-white">{label}</div>
      <dl className="space-y-1 text-xs text-slate-400">
        <div className="flex justify-between">
          <dt>LTV</dt>
          <dd className="tabular-nums text-slate-200">{ltvBps !== undefined ? `${Number(ltvBps) / 100}%` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Liquidation threshold</dt>
          <dd className="tabular-nums text-slate-200">
            {thresholdBps !== undefined ? `${Number(thresholdBps) / 100}%` : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Collateral value</dt>
          <dd className="tabular-nums text-slate-200">
            {collateralValueUsd !== undefined ? `$${Number(formatEther(collateralValueUsd)).toFixed(2)}` : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Component health factor*</dt>
          <dd className="tabular-nums text-slate-200">
            {healthFactor !== undefined ? formatHealthFactor(healthFactor) : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] text-slate-500">
        *Heuristic — see combined health factor for the real, enforced number.
      </p>
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
