import { useEffect, useState, useCallback } from "react";
import { formatEther, formatUnits, parseUnits, MaxUint256 } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { addresses, addressesConfigured } from "../lib/addresses";
import { getPool, getRiskView, getErc20, getOracle } from "../lib/contracts";
import { individualStocks } from "../lib/individualStocks";
import { borrowableAssets } from "../lib/borrowableAssets";

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
 * deposited all contribute to the same capacity. Combined capacity is
 * itemised per collateral source: Gold/S&P 500 Index via StratusRiskView
 * (fixed 2-slot view), plus any individual stock reserve the user has
 * actually deposited into. */
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

    // Itemise combined capacity as each component's collateral value ×
    // its own LTV — not a single blended number. Mirrors StratusRiskView's
    // per-component figures, computed here from the same underlying data.
    const gold = risk.components[0];
    const stock = risk.components[1];
    setComponentCapacity({ gold: gold.collateralValueUsd, stock: stock.collateralValueUsd });

    // StratusRiskView is a fixed 2-slot view (Gold + S&P 500 Index only) —
    // individual stock collateral isn't in it, but it DOES contribute to
    // "Combined available to borrow" above (pool-level, asset-agnostic).
    // Compute each stock's own collateral value client-side (aToken
    // balance × oracle price, same math StratusRiskView does internally)
    // so a user who deposited one can see where their capacity is coming
    // from, without needing a contract change.
    const perStock = await Promise.all(
      individualStocks.map(async (s) => {
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
      setStatus(`Borrowed ${borrowAmount} ${borrowAsset.symbol}. Tx: ${tx.hash.slice(0, 10)}...`);
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

      setStatus(`Approving ${repayAsset.symbol}...`);
      await (await token.approve(poolAddress, amount)).wait();
      setStatus("Repaying...");
      const tx = await pool.repay(repayAsset.tokenAddress, amount, VARIABLE_RATE_MODE, address);
      await tx.wait();
      setStatus(`Repaid ${repayAmount} ${repayAsset.symbol}. Tx: ${tx.hash.slice(0, 10)}...`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Repay failed");
    } finally {
      setBusy(false);
    }
  }

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-white">Borrow / Repay</h1>
      <p className="mb-6 text-sm text-slate-400">
        Borrow any of 21 assets (USDC or 20 top-market-cap crypto) against your deposited collateral.
      </p>

      {!address ? (
        <button onClick={connect} className="btn-primary">
          Connect wallet to continue
        </button>
      ) : (
        <>
          <div className="glass-panel mb-4 p-4 text-sm">
            <div className="stat-row mb-1">
              <span className="stat-label">From Gold leg</span>
              <span className="stat-value">
                {componentCapacity ? `$${Number(formatEther(componentCapacity.gold)).toFixed(2)}` : "—"} collateral
              </span>
            </div>
            <div className="stat-row mb-1">
              <span className="stat-label">From S&amp;P 500 Index leg</span>
              <span className="stat-value">
                {componentCapacity ? `$${Number(formatEther(componentCapacity.stock)).toFixed(2)}` : "—"} collateral
              </span>
            </div>
            {stockCollateral.map((s) => (
              <div key={s.displayName} className="stat-row mb-1">
                <span className="stat-label">From {s.displayName}</span>
                <span className="stat-value">${Number(formatEther(s.collateralValueUsd)).toFixed(2)} collateral</span>
              </div>
            ))}
            <div className="stat-row mt-1 border-t border-white/10 pt-1 font-medium">
              <span className="text-slate-200">Combined available to borrow</span>
              <span className="stat-value">
                {accountData ? `$${Number(formatEther(accountData.availableBorrowsUsd)).toFixed(2)}` : "—"}
              </span>
            </div>
          </div>

          <div className="glass-panel mb-6 space-y-1 p-4 text-sm">
            <div className="stat-row">
              <span className="stat-label">Current debt (all assets)</span>
              <span className="stat-value">
                {accountData ? `$${Number(formatEther(accountData.totalDebtUsd)).toFixed(2)}` : "—"}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Health factor</span>
              <span className="stat-value">
                {accountData
                  ? accountData.healthFactor >= MaxUint256 / 2n
                    ? "MAX (no debt)"
                    : Number(formatEther(accountData.healthFactor)).toFixed(2)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Borrow</label>
              <select
                value={borrowSymbol}
                onChange={(e) => setBorrowSymbol(e.target.value)}
                className="glass-select mb-2"
              >
                {borrowableAssets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.displayName}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
                className="glass-input mb-2"
              />
              <button onClick={handleBorrow} disabled={busy || !borrowAmount} className="btn-primary w-full">
                {busy ? "..." : "Borrow"}
              </button>
            </div>
            <div>
              <label className="field-label">Repay</label>
              <select
                value={repaySymbol}
                onChange={(e) => setRepaySymbol(e.target.value)}
                className="glass-select mb-2"
              >
                {borrowableAssets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.displayName}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                className="glass-input mb-2"
              />
              <button onClick={handleRepay} disabled={busy || !repayAmount} className="btn-ghost w-full">
                {busy ? "..." : "Approve + Repay"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Your {repayAsset?.symbol ?? "—"} balance:{" "}
            {selectedBalance !== null && repayAsset ? formatUnits(selectedBalance, repayAsset.decimals) : "—"}
          </p>
          {status && <p className="mt-3 break-all text-xs text-slate-400">{status}</p>}
        </>
      )}
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
