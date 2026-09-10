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
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-white">Mint Stratus ETF</h1>
      <p className="mb-6 text-sm text-slate-400">
        Mint Gold and S&amp;P 500 Index (50/50 by token count) into one Stratus ETF basket token.
      </p>

      {!address ? (
        <button onClick={connect} className="btn-primary">
          Connect wallet to continue
        </button>
      ) : (
        <>
          <div className="glass-panel mb-4 space-y-1 p-4 text-sm">
            <div className="stat-row">
              <span className="stat-label">Gold balance</span>
              <span className="stat-value">{balances ? formatEther(balances.gold) : "—"}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">S&amp;P 500 Index balance</span>
              <span className="stat-value">{balances ? formatEther(balances.stock) : "—"}</span>
            </div>
            <div className="stat-row mt-1 border-t border-white/10 pt-1 font-medium">
              <span className="text-slate-200">Stratus ETF (sETF) balance</span>
              <span className="stat-value">{balances ? formatEther(balances.basket) : "—"}</span>
            </div>
          </div>

          <label className="field-label">Amount to mint (sETF)</label>
          <input
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="glass-input mb-2"
          />
          {preview && (
            <p className="mb-4 text-xs text-slate-400">
              Requires {formatEther(preview.amountA)} Gold + {formatEther(preview.amountB)} S&amp;P 500 Index
            </p>
          )}

          <button onClick={handleMint} disabled={busy || !amount} className="btn-primary w-full">
            {busy ? "Minting..." : "Approve + Mint"}
          </button>
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
