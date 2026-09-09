import { useEffect, useState, useCallback } from "react";
import { formatEther, parseEther } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { addressesConfigured } from "../lib/addresses";
import { getBasketToken, getGoldToken, getStockToken } from "../lib/contracts";
import { readProvider } from "../lib/wallet";

/** PLAN.md §Phase 5, Screen 1: acquire/mint GOLD-x + STOCK-x into one
 * Stratus ETF basket token, via StratusBasketToken.mint(). */
export function MintBasket() {
  const { signer, address, connect } = useWallet();
  const [amount, setAmount] = useState("10");
  const [balances, setBalances] = useState<{ gold: bigint; stock: bigint; basket: bigint } | null>(null);
  const [preview, setPreview] = useState<{ amountA: bigint; amountB: bigint } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshBalances = useCallback(async () => {
    if (!signer || !address) return;
    const gold = getGoldToken(signer);
    const stock = getStockToken(signer);
    const basket = getBasketToken(signer);
    const [g, s, b] = await Promise.all([gold.balanceOf(address), stock.balanceOf(address), basket.balanceOf(address)]);
    setBalances({ gold: g, stock: s, basket: b });
  }, [signer, address]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    if (!amount) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const basket = getBasketToken(signer ?? readProvider);
        const [amountA, amountB] = await basket.previewComponents(parseEther(amount));
        if (!cancelled) setPreview({ amountA, amountB });
      } catch {
        if (!cancelled) setPreview(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signer, amount]);

  async function handleMint() {
    if (!signer) return;
    setBusy(true);
    setStatus(null);
    try {
      const basketAddress = await getBasketToken(signer).getAddress();
      const gold = getGoldToken(signer);
      const stock = getStockToken(signer);
      const basket = getBasketToken(signer);
      const basketAmount = parseEther(amount);
      const [amountA, amountB] = await basket.previewComponents(basketAmount);

      setStatus("Approving Gold...");
      await (await gold.approve(basketAddress, amountA)).wait();
      setStatus("Approving S&P 500 Index...");
      await (await stock.approve(basketAddress, amountB)).wait();
      setStatus("Minting basket tokens...");
      const tx = await basket.mint(basketAmount);
      await tx.wait();
      setStatus(`Minted ${amount} sETF. Tx: ${tx.hash.slice(0, 10)}...`);
      await refreshBalances();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setBusy(false);
    }
  }

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Mint Stratus ETF</h1>
      <p className="text-sm text-slate-600 mb-6">
        Mint Gold and S&amp;P 500 Index (50/50 by token count) into one Stratus ETF basket token.
      </p>

      {!address ? (
        <button onClick={connect} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Connect wallet to continue
        </button>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 p-4 mb-4 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Gold balance</span>
              <span>{balances ? formatEther(balances.gold) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">S&amp;P 500 Index balance</span>
              <span>{balances ? formatEther(balances.stock) : "—"}</span>
            </div>
            <div className="flex justify-between font-medium border-t border-slate-200 pt-1 mt-1">
              <span>Stratus ETF (sETF) balance</span>
              <span>{balances ? formatEther(balances.basket) : "—"}</span>
            </div>
          </div>

          <label className="block text-sm font-medium mb-1">Amount to mint (sETF)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-2"
          />
          {preview && (
            <p className="text-xs text-slate-500 mb-4">
              Requires {formatEther(preview.amountA)} Gold + {formatEther(preview.amountB)} S&amp;P 500 Index
            </p>
          )}

          <button
            onClick={handleMint}
            disabled={busy || !amount}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Minting..." : "Approve + Mint"}
          </button>
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
