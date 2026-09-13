import { useEffect, useState, useCallback } from "react";
import { formatEther, parseEther } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { addressesConfigured } from "../lib/addresses";
import { getBasketToken, getGoldToken, getStockToken } from "../lib/contracts";
import { readProvider } from "../lib/wallet";
import { PageHeader, TokenBadge, ConnectPrompt, NotConfiguredNotice, StatusLine } from "../components/ui";

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

      setStatus("Approving Gold…");
      await (await gold.approve(basketAddress, amountA)).wait();
      setStatus("Approving S&P 500 Index…");
      await (await stock.approve(basketAddress, amountB)).wait();
      setStatus("Minting basket tokens…");
      const tx = await basket.mint(basketAmount);
      await tx.wait();
      setStatus(`Minted ${amount} sETF. Tx ${tx.hash.slice(0, 10)}…`);
      await refreshBalances();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setBusy(false);
    }
  }

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  return (
    <div>
      <PageHeader
        title="Mint Stratus ETF"
        subtitle="Combine Gold and the S&P 500 Index (50/50 by token count) into one sETF basket token."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="card p-5">
          {!address ? (
            <ConnectPrompt onConnect={connect} label="Connect your wallet to mint." />
          ) : (
            <>
              <div className="mb-4 space-y-2 rounded-xl bg-slate-50 p-3.5 text-sm">
                <BalanceRow symbol="GOLD" name="Gold" value={balances ? formatEther(balances.gold) : "—"} />
                <BalanceRow symbol="SPX" name="S&P 500 Index" value={balances ? formatEther(balances.stock) : "—"} />
                <div className="row border-t border-[var(--border)] pt-2 font-semibold">
                  <span>sETF balance</span>
                  <span className="tabular-nums">{balances ? formatEther(balances.basket) : "—"}</span>
                </div>
              </div>

              <label className="field-label">Amount to mint (sETF)</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input mb-2 text-lg"
              />
              {preview && (
                <p className="mb-4 text-xs text-slate-500">
                  Requires {Number(formatEther(preview.amountA)).toFixed(4)} Gold +{" "}
                  {Number(formatEther(preview.amountB)).toFixed(4)} S&P 500 Index
                </p>
              )}

              <button onClick={handleMint} disabled={busy || !amount} className="btn-primary mt-2 w-full">
                {busy ? "Minting…" : "Approve & Mint"}
              </button>
              <StatusLine status={status} />
            </>
          )}
        </div>

        <div className="card h-fit p-5 text-sm text-slate-600">
          <h2 className="section-title mb-3">Why a basket</h2>
          <p className="mb-3">
            The sETF is one ERC-20 backed by a fixed ratio of GOLD-x and STOCK-x. Deposit it and the vault{" "}
            <span className="font-medium text-slate-900">decomposes</span> it into two isolated pool reserves, each
            with its own risk parameters — a crash in one leg can't liquidate the other.
          </p>
          <p>Redeeming recomposes the two legs back into the basket token.</p>
        </div>
      </div>
    </div>
  );
}

function BalanceRow({ symbol, name, value }: { symbol: string; name: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-600">
        <TokenBadge symbol={symbol} size={22} />
        {name}
      </span>
      <span className="tabular-nums font-medium text-slate-900">{value}</span>
    </div>
  );
}
