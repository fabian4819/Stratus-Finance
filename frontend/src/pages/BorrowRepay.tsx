import { useEffect, useState, useCallback } from "react";
import { formatEther, formatUnits, parseUnits, MaxUint256 } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { addresses, addressesConfigured } from "../lib/addresses";
import { getPool, getUsdc, getRiskView } from "../lib/contracts";

const VARIABLE_RATE_MODE = 2;
const USDC_DECIMALS = 6;

/** PLAN.md §Phase 5, Screen 3: borrow/repay USDC directly against the
 * pool (StratusVault is not in this path — see its contract docs).
 * Combined capacity is shown itemised per component, not as one blended
 * number, via StratusRiskView. */
export function BorrowRepay() {
  const { signer, address, connect } = useWallet();
  const [borrowAmount, setBorrowAmount] = useState("1");
  const [repayAmount, setRepayAmount] = useState("1");
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [accountData, setAccountData] = useState<{
    totalDebtUsd: bigint;
    availableBorrowsUsd: bigint;
    healthFactor: bigint;
  } | null>(null);
  const [componentCapacity, setComponentCapacity] = useState<{ gold: bigint; stock: bigint } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!signer || !address) return;
    const pool = getPool(signer);
    const usdc = getUsdc(signer);
    const riskView = getRiskView(signer);

    const [balance, data, risk] = await Promise.all([
      usdc.balanceOf(address),
      pool.getUserAccountData(address),
      riskView.getUserRisk(address, addresses.goldToken, addresses.stockIndexToken),
    ]);

    setUsdcBalance(balance);
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
  }, [signer, address]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleBorrow() {
    if (!signer || !address) return;
    setBusy(true);
    setStatus(null);
    try {
      const pool = getPool(signer);
      const tx = await pool.borrow(addresses.usdc, parseUnits(borrowAmount, USDC_DECIMALS), VARIABLE_RATE_MODE, 0, address);
      await tx.wait();
      setStatus(`Borrowed ${borrowAmount} USDC. Tx: ${tx.hash.slice(0, 10)}...`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Borrow failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRepay() {
    if (!signer || !address) return;
    setBusy(true);
    setStatus(null);
    try {
      const pool = getPool(signer);
      const usdc = getUsdc(signer);
      const poolAddress = await pool.getAddress();
      const amount = parseUnits(repayAmount, USDC_DECIMALS);

      setStatus("Approving USDC...");
      await (await usdc.approve(poolAddress, amount)).wait();
      setStatus("Repaying...");
      const tx = await pool.repay(addresses.usdc, amount, VARIABLE_RATE_MODE, address);
      await tx.wait();
      setStatus(`Repaid ${repayAmount} USDC. Tx: ${tx.hash.slice(0, 10)}...`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Repay failed");
    } finally {
      setBusy(false);
    }
  }

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Borrow / Repay USDC</h1>

      {!address ? (
        <button onClick={connect} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Connect wallet to continue
        </button>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 p-4 mb-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-slate-500">From GOLD-x leg</span>
              <span>{componentCapacity ? `$${Number(formatEther(componentCapacity.gold)).toFixed(2)}` : "—"} collateral</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-500">From STOCK-x leg</span>
              <span>{componentCapacity ? `$${Number(formatEther(componentCapacity.stock)).toFixed(2)}` : "—"} collateral</span>
            </div>
            <div className="flex justify-between font-medium border-t border-slate-200 pt-1 mt-1">
              <span>Combined available to borrow</span>
              <span>{accountData ? `$${Number(formatEther(accountData.availableBorrowsUsd)).toFixed(2)}` : "—"}</span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-4 mb-6 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Current debt</span>
              <span>{accountData ? `$${Number(formatEther(accountData.totalDebtUsd)).toFixed(2)}` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Health factor</span>
              <span>
                {accountData
                  ? accountData.healthFactor >= MaxUint256 / 2n
                    ? "MAX (no debt)"
                    : Number(formatEther(accountData.healthFactor)).toFixed(2)
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Your USDC balance</span>
              <span>{usdcBalance !== null ? formatUnits(usdcBalance, USDC_DECIMALS) : "—"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Borrow (USDC)</label>
              <input
                type="number"
                min="0"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-2"
              />
              <button
                onClick={handleBorrow}
                disabled={busy || !borrowAmount}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "..." : "Borrow"}
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Repay (USDC)</label>
              <input
                type="number"
                min="0"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-2"
              />
              <button
                onClick={handleRepay}
                disabled={busy || !repayAmount}
                className="w-full rounded-lg border border-slate-900 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
              >
                {busy ? "..." : "Approve + Repay"}
              </button>
            </div>
          </div>
          {status && <p className="mt-3 text-xs text-slate-600 break-all">{status}</p>}
        </>
      )}
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
