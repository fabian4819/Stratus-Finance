import { useEffect, useState, useCallback } from "react";
import { formatEther, formatUnits, parseUnits } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { addresses, addressesConfigured } from "../lib/addresses";
import { getPool, getRiskView, getErc20, getOracle } from "../lib/contracts";
import { individualStocks } from "../lib/individualStocks";
import { borrowableAssets } from "../lib/borrowableAssets";
import {
  PageHeader,
  TokenBadge,
  ConnectPrompt,
  NotConfiguredNotice,
  StatusLine,
  HealthFactor,
} from "../components/ui";

const VARIABLE_RATE_MODE = 2;

interface StockCollateral {
  displayName: string;
  collateralValueUsd: bigint;
}

/** PLAN.md §Phase 5, Screen 3: borrow/repay directly against the pool
 * (StratusVault is not in this path — see its contract docs). Any of 21
 * assets (USDC + 20 top-market-cap crypto reserves, see
 * docs/phase-5-crypto-borrow.md) can be borrowed — Aave v2's borrow() is
 * account-level, not tied to one collateral asset, so whichever
 * combination of Gold/S&P 500 Index/individual stocks a user has
 * deposited all contribute to the same capacity. */
export function BorrowRepay() {
  const { signer, address, connect } = useWallet();
  const [borrowSymbol, setBorrowSymbol] = useState(borrowableAssets[0]?.symbol ?? "USDC");
  const [repaySymbol, setRepaySymbol] = useState(borrowableAssets[0]?.symbol ?? "USDC");
  const [borrowAmount, setBorrowAmount] = useState("1");
  const [repayAmount, setRepayAmount] = useState("1");
  const [selectedBalance, setSelectedBalance] = useState<bigint | null>(null);
  const [accountData, setAccountData] = useState<{
    totalDebtUsd: bigint;
    availableBorrowsUsd: bigint;
    healthFactor: bigint;
  } | null>(null);
  const [componentCapacity, setComponentCapacity] = useState<{ gold: bigint; stock: bigint } | null>(null);
  const [stockCollateral, setStockCollateral] = useState<StockCollateral[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const repayAsset = borrowableAssets.find((a) => a.symbol === repaySymbol);
  const borrowAsset = borrowableAssets.find((a) => a.symbol === borrowSymbol);

  const refresh = useCallback(async () => {
    if (!signer || !address) return;
    const pool = getPool(signer);
    const riskView = getRiskView(signer);
    const oracle = getOracle(signer);

    const [data, risk] = await Promise.all([
      pool.getUserAccountData(address),
      riskView.getUserRisk(address, addresses.goldToken, addresses.stockIndexToken),
    ]);

    if (repayAsset) {
      const token = getErc20(repayAsset.tokenAddress, signer);
      setSelectedBalance(await token.balanceOf(address));
    }

    setAccountData({
      totalDebtUsd: data.totalDebtETH,
      availableBorrowsUsd: data.availableBorrowsETH,
      healthFactor: data.healthFactor,
    });

    const gold = risk.components[0];
    const stock = risk.components[1];
    setComponentCapacity({ gold: gold.collateralValueUsd, stock: stock.collateralValueUsd });

    // StratusRiskView is a fixed 2-slot view (Gold + S&P 500 Index only,
    // shown above as componentCapacity) — everything else in
    // individualStocks isn't in it, but DOES contribute to "Available to
    // borrow" (pool-level, asset-agnostic). Compute each one's own
    // collateral value client-side (aToken balance × oracle price) so a
    // depositor can see where their capacity comes from. Gold/S&P 500 are
    // excluded here since componentCapacity already covers them — listing
    // both would double-count the same two reserves.
    const perStock = await Promise.all(
      individualStocks
        .filter((s) => s.symbol !== "GOLD-x" && s.symbol !== "STOCK-x")
        .map(async (s) => {
        const aToken = getErc20(s.aTokenAddress, signer);
        const [balance, price]: [bigint, bigint] = await Promise.all([
          aToken.balanceOf(address),
          oracle.getAssetPrice(s.tokenAddress),
        ]);
        const collateralValueUsd = (balance * price) / 10n ** 18n;
        return { displayName: s.displayName, collateralValueUsd };
      })
    );
    setStockCollateral(perStock.filter((s) => s.collateralValueUsd > 0n));
  }, [signer, address, repayAsset]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleBorrow() {
    if (!signer || !address || !borrowAsset) return;
    setBusy(true);
    setStatus(null);
    try {
      const pool = getPool(signer);
      const tx = await pool.borrow(
        borrowAsset.tokenAddress,
        parseUnits(borrowAmount, borrowAsset.decimals),
        VARIABLE_RATE_MODE,
        0,
        address
      );
      await tx.wait();
      setStatus(`Borrowed ${borrowAmount} ${borrowAsset.symbol}. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Borrow failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRepay() {
    if (!signer || !address || !repayAsset) return;
    setBusy(true);
    setStatus(null);
    try {
      const pool = getPool(signer);
      const token = getErc20(repayAsset.tokenAddress, signer);
      const poolAddress = await pool.getAddress();
      const amount = parseUnits(repayAmount, repayAsset.decimals);

      setStatus(`Approving ${repayAsset.symbol}…`);
      await (await token.approve(poolAddress, amount)).wait();
      setStatus("Repaying…");
      const tx = await pool.repay(repayAsset.tokenAddress, amount, VARIABLE_RATE_MODE, address);
      await tx.wait();
      setStatus(`Repaid ${repayAmount} ${repayAsset.symbol}. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Repay failed");
    } finally {
      setBusy(false);
    }
  }

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  const usd = (v: bigint | undefined) => (v !== undefined ? `$${Number(formatEther(v)).toFixed(2)}` : "—");

  return (
    <div>
      <PageHeader
        title="Borrow"
        subtitle="Borrow any of 21 assets — USDC or 20 top-market-cap crypto — against whatever collateral you've deposited."
      />

      {!address ? (
        <ConnectPrompt onConnect={connect} label="Connect your wallet to borrow." />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-4">
              <div className="stat-label">Available to borrow</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {usd(accountData?.availableBorrowsUsd)}
              </div>
            </div>
            <div className="card p-4">
              <div className="stat-label">Current debt</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-rose-600">
                {usd(accountData?.totalDebtUsd)}
              </div>
            </div>
            <div className="card p-4">
              <div className="stat-label">Health factor</div>
              <div className="mt-1 text-xl">
                <HealthFactor hf={accountData?.healthFactor} />
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,320px)]">
            <div className="grid gap-5 sm:grid-cols-2">
              <ActionCard
                title="Borrow"
                symbol={borrowSymbol}
                assetOptions={borrowableAssets}
                onAsset={setBorrowSymbol}
                amount={borrowAmount}
                onAmount={setBorrowAmount}
                buttonLabel={busy ? "Working…" : "Borrow"}
                buttonClass="btn-primary"
                onSubmit={handleBorrow}
                disabled={busy || !borrowAmount}
              />
              <ActionCard
                title="Repay"
                symbol={repaySymbol}
                assetOptions={borrowableAssets}
                onAsset={setRepaySymbol}
                amount={repayAmount}
                onAmount={setRepayAmount}
                buttonLabel={busy ? "Working…" : "Approve & Repay"}
                buttonClass="btn-secondary"
                onSubmit={handleRepay}
                disabled={busy || !repayAmount}
                footer={
                  <span className="text-xs text-slate-500">
                    Balance:{" "}
                    {selectedBalance !== null && repayAsset
                      ? Number(formatUnits(selectedBalance, repayAsset.decimals)).toFixed(4)
                      : "—"}{" "}
                    {repayAsset?.symbol}
                  </span>
                }
              />
            </div>

            <div className="card h-fit p-5">
              <h2 className="section-title mb-3">Collateral by source</h2>
              <div className="space-y-2 text-sm">
                <div className="row">
                  <span className="row-label">Gold leg</span>
                  <span className="row-value">{usd(componentCapacity?.gold)}</span>
                </div>
                <div className="row">
                  <span className="row-label">S&P 500 Index leg</span>
                  <span className="row-value">{usd(componentCapacity?.stock)}</span>
                </div>
                {stockCollateral.map((s) => (
                  <div key={s.displayName} className="row">
                    <span className="row-label">{s.displayName}</span>
                    <span className="row-value">{usd(s.collateralValueUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <StatusLine status={status} />
        </div>
      )}
    </div>
  );
}

function ActionCard({
  title,
  symbol,
  assetOptions,
  onAsset,
  amount,
  onAmount,
  buttonLabel,
  buttonClass,
  onSubmit,
  disabled,
  footer,
}: {
  title: string;
  symbol: string;
  assetOptions: { symbol: string; displayName: string }[];
  onAsset: (s: string) => void;
  amount: string;
  onAmount: (s: string) => void;
  buttonLabel: string;
  buttonClass: string;
  onSubmit: () => void;
  disabled: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <h2 className="section-title mb-3">{title}</h2>
      <label className="field-label">Asset</label>
      <div className="mb-3 flex items-center gap-3">
        <TokenBadge symbol={symbol} size={28} />
        <select value={symbol} onChange={(e) => onAsset(e.target.value)} className="select">
          {assetOptions.map((a) => (
            <option key={a.symbol} value={a.symbol}>
              {a.displayName}
            </option>
          ))}
        </select>
      </div>
      <label className="field-label">Amount</label>
      <input
        type="number"
        min="0"
        value={amount}
        onChange={(e) => onAmount(e.target.value)}
        className="input mb-4 text-lg"
      />
      <button onClick={onSubmit} disabled={disabled} className={`${buttonClass} w-full`}>
        {buttonLabel}
      </button>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}
