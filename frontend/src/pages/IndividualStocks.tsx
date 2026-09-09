import { useEffect, useState, useCallback } from "react";
import { formatEther, parseEther } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { individualStocks, individualStocksConfigured, type IndividualStock } from "../lib/individualStocks";
import { getErc20, getOracle, getPool } from "../lib/contracts";
import { readProvider } from "../lib/wallet";
import { fetchLivePrices } from "../lib/liveRedstonePrice";

interface StockRow {
  stock: IndividualStock;
  price: bigint | null;
  walletBalance: bigint | null;
  aTokenBalance: bigint | null;
}

/** 10 individual real-stock reserves, added alongside (not replacing) the
 * GOLD-x/STOCK-x basket — see docs/phase-4-individual-stocks.md. Each is
 * deposited/borrowed against directly in the pool (LendingPool.deposit),
 * not wrapped by StratusBasketToken — same mechanism the basket's own
 * two reserves use under the hood, just without the decompose/recompose
 * step since there's only one asset per reserve here. */
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
    // all 10 stocks, not the pool's cached oracle (see liveRedstonePrice.ts).
    // Falls back to the cache per-stock if the live gateway call fails.
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
            price = null; // stale/not-yet-refreshed cache — show "—" rather than crash the whole page
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
    // Poll — prices are genuinely real-time (StratusLivePriceReader, a
    // fresh wrapped read every call); wallet/deposited balances are
    // re-read too. Deposited value below is informational — the pool's
    // own math for deposit/borrow/liquidation uses its cached oracle,
    // which can differ slightly from this live number.
    const interval = setInterval(refresh, 6_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!individualStocksConfigured()) return <NotConfiguredNotice />;

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

      setStatus(`Approving ${selected.displayName}...`);
      await (await token.approve(poolAddress, depositAmount)).wait();
      setStatus(`Depositing ${amount} ${selected.displayName}...`);
      const tx = await pool.deposit(selected.tokenAddress, depositAmount, address, 0);
      await tx.wait();
      setStatus(`Deposited ${amount} ${selected.displayName}. Tx: ${tx.hash.slice(0, 10)}...`);
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

      setStatus(`Withdrawing ${amount} ${selected.displayName}...`);
      const tx = await pool.withdraw(selected.tokenAddress, withdrawAmount, address);
      await tx.wait();
      setStatus(`Withdrew ${amount} ${selected.displayName}. Tx: ${tx.hash.slice(0, 10)}...`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Withdraw failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Individual Stocks</h1>
      <p className="text-sm text-slate-600 mb-4">
        10 real, individually-priced stock reserves — deposited and borrowed against directly in the pool, alongside
        (not replacing) the Gold + S&amp;P 500 Index basket.
      </p>

      {!address && (
        <button onClick={connect} className="mb-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Connect wallet for balances &amp; deposits
        </button>
      )}

      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live market prices — Deposited value is informational; deposit/borrow/liquidation use the protocol's cached price
      </div>

      <div className="rounded-lg border border-slate-200 mb-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-2 font-medium">Stock</th>
              <th className="px-4 py-2 font-medium text-right">Price (per share)</th>
              {address && <th className="px-4 py-2 font-medium text-right">Wallet (shares)</th>}
              {address && <th className="px-4 py-2 font-medium text-right">Deposited (shares)</th>}
              {address && <th className="px-4 py-2 font-medium text-right">Deposited value</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ stock, price, walletBalance, aTokenBalance }) => {
              const depositedValueUsd = price !== null && aTokenBalance !== null ? (aTokenBalance * price) / 10n ** 18n : null;
              return (
                <tr key={stock.symbol} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2">{stock.displayName}</td>
                  <td className="px-4 py-2 text-right">{price !== null ? `$${Number(formatEther(price)).toFixed(2)}` : "—"}</td>
                  {address && (
                    <td className="px-4 py-2 text-right">{walletBalance !== null ? Number(formatEther(walletBalance)).toFixed(2) : "—"}</td>
                  )}
                  {address && (
                    <td className="px-4 py-2 text-right">{aTokenBalance !== null ? Number(formatEther(aTokenBalance)).toFixed(2) : "—"}</td>
                  )}
                  {address && (
                    <td className="px-4 py-2 text-right font-medium">
                      {depositedValueUsd !== null ? `$${Number(formatEther(depositedValueUsd)).toFixed(2)}` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {address && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-sm font-medium mb-1">Stock</label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {individualStocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Amount (shares, not USD)</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-3 mb-2">
            <button
              onClick={handleDeposit}
              disabled={busy || !amount}
              className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Working..." : "Approve + Deposit"}
            </button>
            <button
              onClick={handleWithdraw}
              disabled={busy || !amount}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            >
              {busy ? "Working..." : "Withdraw"}
            </button>
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
      Individual stock addresses not configured — copy <code>deployments/hederaTestnet.json</code> values into{" "}
      <code>frontend/.env</code> (see <code>.env.example</code>).
    </div>
  );
}
