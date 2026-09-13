import { useEffect, useState, useCallback } from "react";
import { formatEther, parseEther } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { individualStocks, individualStocksConfigured, type IndividualStock } from "../lib/individualStocks";
import { getErc20, getOracle, getPool } from "../lib/contracts";
import { readProvider } from "../lib/wallet";
import { fetchLivePrices } from "../lib/liveRedstonePrice";
import { PageHeader, TokenBadge, NotConfiguredNotice, StatusLine } from "../components/ui";

interface StockRow {
  stock: IndividualStock;
  price: bigint | null;
  walletBalance: bigint | null;
  aTokenBalance: bigint | null;
}

/** All 12 spot RWA reserves (Gold, S&P 500 Index, 10 stocks) — see
 * lib/individualStocks.ts. Each is deposited/borrowed against directly
 * in the pool (LendingPool.deposit), no wrapper token. */
export function IndividualStocks() {
  const { signer, address, connect } = useWallet();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(individualStocks[0]?.symbol ?? "");
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const runner = signer ?? readProvider;

    // Genuinely real-time — one batched StratusLivePriceReader call for
    // all 10 stocks, not the pool's cached oracle. Falls back to the cache
    // per-stock if the live gateway call fails.
    let livePrices: Record<string, bigint> | null = null;
    try {
      livePrices = await fetchLivePrices(individualStocks.map((s) => s.redstoneFeedId));
    } catch (liveErr) {
      console.error("fetchLivePrices failed:", liveErr);
    }
    const oracle = livePrices ? null : getOracle(runner);

    const results = await Promise.all(
      individualStocks.map(async (stock) => {
        let price: bigint | null = null;
        if (livePrices) {
          price = livePrices[stock.redstoneFeedId] ?? null;
        } else if (oracle) {
          try {
            price = await oracle.getAssetPrice(stock.tokenAddress);
          } catch {
            price = null;
          }
        }

        let walletBalance: bigint | null = null;
        let aTokenBalance: bigint | null = null;
        if (address) {
          const token = getErc20(stock.tokenAddress, runner);
          const aToken = getErc20(stock.aTokenAddress, runner);
          [walletBalance, aTokenBalance] = await Promise.all([token.balanceOf(address), aToken.balanceOf(address)]);
        }

        return { stock, price, walletBalance, aTokenBalance };
      })
    );
    setRows(results);
  }, [signer, address]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 6_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!individualStocksConfigured()) return <NotConfiguredNotice what="Individual stock addresses" />;

  const selected = individualStocks.find((s) => s.symbol === selectedSymbol);

  async function handleDeposit() {
    if (!signer || !selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const poolAddress = await getPool(signer).getAddress();
      const token = getErc20(selected.tokenAddress, signer);
      const pool = getPool(signer);
      const depositAmount = parseEther(amount);

      setStatus(`Approving ${selected.displayName}…`);
      await (await token.approve(poolAddress, depositAmount)).wait();
      setStatus(`Depositing ${amount} ${selected.displayName}…`);
      const tx = await pool.deposit(selected.tokenAddress, depositAmount, address, 0);
      await tx.wait();
      setStatus(`Deposited ${amount} ${selected.displayName}. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    if (!signer || !selected || !address) return;
    setBusy(true);
    setStatus(null);
    try {
      const pool = getPool(signer);
      const withdrawAmount = parseEther(amount);

      setStatus(`Withdrawing ${amount} ${selected.displayName}…`);
      const tx = await pool.withdraw(selected.tokenAddress, withdrawAmount, address);
      await tx.wait();
      setStatus(`Withdrew ${amount} ${selected.displayName}. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Markets"
        subtitle="12 real, individually-priced spot reserves — Gold, the S&P 500 Index, and 10 stocks. Deposit and borrow against each directly in the pool, no wrapper token required."
      />

      <div className="mb-4 flex items-center gap-2 text-xs font-medium text-emerald-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live prices — deposited value is informational; the pool enforces its own cached price
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Asset</th>
                <th className="px-5 py-3 text-right font-medium">Price</th>
                {address && <th className="px-5 py-3 text-right font-medium">Wallet</th>}
                {address && <th className="px-5 py-3 text-right font-medium">Deposited</th>}
                {address && <th className="px-5 py-3 text-right font-medium">Value</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ stock, price, walletBalance, aTokenBalance }) => {
                const valueUsd =
                  price !== null && aTokenBalance !== null ? (aTokenBalance * price) / 10n ** 18n : null;
                return (
                  <tr
                    key={stock.symbol}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <TokenBadge symbol={stock.symbol} size={30} />
                        <div>
                          <div className="font-medium text-slate-900">{stock.displayName}</div>
                          <div className="text-xs text-slate-400">{stock.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-900">
                      {price !== null ? `$${Number(formatEther(price)).toFixed(2)}` : "—"}
                    </td>
                    {address && (
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                        {walletBalance !== null ? Number(formatEther(walletBalance)).toFixed(2) : "—"}
                      </td>
                    )}
                    {address && (
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                        {aTokenBalance !== null ? Number(formatEther(aTokenBalance)).toFixed(2) : "—"}
                      </td>
                    )}
                    {address && (
                      <td className="px-5 py-3 text-right tabular-nums font-medium text-slate-900">
                        {valueUsd !== null ? `$${Number(formatEther(valueUsd)).toFixed(2)}` : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!address ? (
        <div className="mt-5">
          <button onClick={connect} className="btn-primary">
            Connect wallet to deposit
          </button>
        </div>
      ) : (
        <div className="card mt-5 p-5">
          <h2 className="section-title mb-3">Deposit / withdraw</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Stock</label>
              <div className="flex items-center gap-3">
                {selected && <TokenBadge symbol={selected.symbol} size={28} />}
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="select"
                >
                  {individualStocks.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">Amount (shares)</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button onClick={handleDeposit} disabled={busy || !amount} className="btn-primary flex-1">
              {busy ? "Working…" : "Approve & Deposit"}
            </button>
            <button onClick={handleWithdraw} disabled={busy || !amount} className="btn-secondary flex-1">
              {busy ? "Working…" : "Withdraw"}
            </button>
          </div>
          <StatusLine status={status} />
        </div>
      )}
    </div>
  );
}
