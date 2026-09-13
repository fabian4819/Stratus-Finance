import { useEffect, useState, useCallback } from "react";
import { formatEther, parseEther } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { addresses, addressesConfigured } from "../lib/addresses";
import { getBasketToken, getVault, getRiskView, getDataProvider } from "../lib/contracts";
import {
  PageHeader,
  TokenBadge,
  ConnectPrompt,
  NotConfiguredNotice,
  StatusLine,
  HealthFactor,
} from "../components/ui";

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

      setStatus("Approving vault…");
      await (await basket.approve(vaultAddress, basketAmount)).wait();
      setStatus("Depositing (decomposing into isolated reserves)…");
      const tx = await vault.depositBasket(basketAmount);
      await tx.wait();
      setStatus(`Deposited ${amount} sETF. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  const legs = [
    { symbol: "GOLD", label: "Gold reserve" },
    { symbol: "SPX", label: "S&P 500 Index reserve" },
  ];

  return (
    <div>
      <PageHeader
        title="Deposit & decompose"
        subtitle="Depositing your basket token splits it into two isolated reserve positions, each with independent risk parameters. A price move in one leg never forces liquidation of the other."
      />

      {!address ? (
        <ConnectPrompt onConnect={connect} label="Connect your wallet to deposit." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
          <div className="card h-fit p-5">
            <label className="field-label">Amount to deposit (sETF)</label>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input mb-2 text-lg"
            />
            <div className="mb-4 flex items-center justify-between text-xs text-slate-500">
              <span>Wallet balance</span>
              <button
                type="button"
                onClick={() => basketBalance !== null && setAmount(formatEther(basketBalance))}
                className="tabular-nums font-medium text-indigo-600 hover:underline"
              >
                {basketBalance !== null ? `${Number(formatEther(basketBalance)).toFixed(4)} sETF` : "—"}
              </button>
            </div>
            <button onClick={handleDeposit} disabled={busy || !amount} className="btn-primary w-full">
              {busy ? "Depositing…" : "Approve & Deposit"}
            </button>
            <StatusLine status={status} />
          </div>

          <div className="space-y-5">
            <div className="card flex items-center justify-between p-5">
              <div>
                <div className="stat-label">Combined health factor</div>
                <div className="mt-0.5 text-xs text-slate-400">Real, enforced by the pool</div>
              </div>
              <HealthFactor hf={risk?.combinedHealthFactor} size="lg" />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {legs.map((leg, i) => (
                <ReserveCard
                  key={leg.symbol}
                  symbol={leg.symbol}
                  label={leg.label}
                  ltvBps={configs?.[i]?.ltvBps}
                  thresholdBps={configs?.[i]?.liquidationThresholdBps}
                  collateralValueUsd={risk?.components[i]?.collateralValueUsd}
                  healthFactor={risk?.components[i]?.componentHealthFactor}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReserveCard({
  symbol,
  label,
  ltvBps,
  thresholdBps,
  collateralValueUsd,
  healthFactor,
}: {
  symbol: string;
  label: string;
  ltvBps?: bigint;
  thresholdBps?: bigint;
  collateralValueUsd?: bigint;
  healthFactor?: bigint;
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <TokenBadge symbol={symbol} size={28} />
        <span className="text-sm font-semibold text-slate-900">{label}</span>
      </div>
      <dl className="space-y-2 text-sm">
        <Row label="Collateral value">
          {collateralValueUsd !== undefined ? `$${Number(formatEther(collateralValueUsd)).toFixed(2)}` : "—"}
        </Row>
        <Row label="Max LTV">{ltvBps !== undefined ? `${Number(ltvBps) / 100}%` : "—"}</Row>
        <Row label="Liquidation threshold">
          {thresholdBps !== undefined ? `${Number(thresholdBps) / 100}%` : "—"}
        </Row>
        <div className="row border-t border-[var(--border)] pt-2">
          <span className="row-label">Component health factor*</span>
          <HealthFactor hf={healthFactor} />
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-slate-400">
        *Heuristic — the combined health factor above is the real, enforced number.
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{children}</span>
    </div>
  );
}
