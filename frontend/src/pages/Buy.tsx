import { useEffect, useState, useCallback } from "react";
import { formatUnits, parseEther } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { sellableAssets } from "../lib/sellableAssets";
import { getUsdc, getMarketplace } from "../lib/contracts";
import { addresses, addressesConfigured } from "../lib/addresses";
import { PageHeader, TokenBadge, ConnectPrompt, NotConfiguredNotice, StatusLine } from "../components/ui";

const USDC_DECIMALS = 6;

/** Self-serve "buy tokenized assets with USDC" — see
 * StratusMarketplace.sol. Any wallet can buy GOLD-x/STOCK-x/individual
 * stocks directly with USDC at the live protocol price; the marketplace
 * contract whitelists a first-time buyer on the ATS control list
 * automatically as part of the same transaction — no admin step. */
export function Buy() {
  const { signer, address, connect } = useWallet();
  const [selectedSymbol, setSelectedSymbol] = useState(sellableAssets[0]?.symbol ?? "");
  const [amount, setAmount] = useState("1");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = sellableAssets.find((a) => a.symbol === selectedSymbol);

  const refreshBalance = useCallback(async () => {
    if (!signer || !address) return;
    const usdc = getUsdc(signer);
    setUsdcBalance(await usdc.balanceOf(address));
  }, [signer, address]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    if (!amount || !selected || !signer) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const marketplace = getMarketplace(signer);
        const q = await marketplace.quote(selected.tokenAddress, parseEther(amount));
        if (!cancelled) setQuote(q);
      } catch {
        if (!cancelled) setQuote(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signer, selected, amount]);

  if (!addressesConfigured() || !addresses.stratusMarketplace) return <NotConfiguredNotice />;

  async function handleBuy() {
    if (!signer || !address || !selected || !quote) return;
    setBusy(true);
    setStatus(null);
    try {
      const marketplaceAddress = await getMarketplace(signer).getAddress();
      const usdc = getUsdc(signer);
      const marketplace = getMarketplace(signer);
      const tokenAmount = parseEther(amount);

      setStatus("Approving USDC…");
      await (await usdc.approve(marketplaceAddress, quote)).wait();
      setStatus(`Buying ${amount} ${selected.displayName}…`);
      const tx = await marketplace.buy(selected.tokenAddress, tokenAmount);
      await tx.wait();
      setStatus(`Bought ${amount} ${selected.displayName}. Tx ${tx.hash.slice(0, 10)}…`);
      await refreshBalance();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Buy failed");
    } finally {
      setBusy(false);
    }
  }

  const totalUsdc = quote !== null ? Number(formatUnits(quote, USDC_DECIMALS)) : null;
  const unitPrice = totalUsdc !== null && Number(amount) > 0 ? totalUsdc / Number(amount) : null;

  return (
    <div>
      <PageHeader
        title="Buy tokenized assets"
        subtitle="Buy Gold, the S&P 500 Index, or any of 10 individual stocks with USDC at the live protocol price. First-time buyers are whitelisted automatically."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="card p-5">
          {!address ? (
            <ConnectPrompt onConnect={connect} label="Connect your wallet to buy." />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
                <span className="text-slate-500">USDC balance</span>
                <span className="tabular-nums font-medium">
                  {usdcBalance !== null ? Number(formatUnits(usdcBalance, USDC_DECIMALS)).toLocaleString() : "—"}
                </span>
              </div>

              <label className="field-label">Asset</label>
              <div className="mb-3 flex items-center gap-3">
                {selected && <TokenBadge symbol={selected.symbol} />}
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="select"
                >
                  {sellableAssets.map((a) => (
                    <option key={a.symbol} value={a.symbol}>
                      {a.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <label className="field-label">Amount (shares)</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input mb-4 text-lg"
              />

              <div className="mb-4 space-y-1.5 rounded-xl border border-[var(--border)] p-3.5 text-sm">
                <div className="row">
                  <span className="row-label">Price per share</span>
                  <span className="row-value">{unitPrice !== null ? `$${unitPrice.toFixed(2)}` : "—"}</span>
                </div>
                <div className="row border-t border-[var(--border)] pt-1.5 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{totalUsdc !== null ? `${totalUsdc.toFixed(2)} USDC` : "—"}</span>
                </div>
              </div>

              <button
                onClick={handleBuy}
                disabled={busy || !amount || quote === null}
                className="btn-primary w-full"
              >
                {busy ? "Working…" : "Approve & Buy"}
              </button>
              <StatusLine status={status} />
            </>
          )}
        </div>

        <div className="card h-fit p-5">
          <h2 className="section-title mb-3">How it works</h2>
          <ol className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-3">
              <Step n={1} />
              <span>Pay in USDC. The price comes straight from the protocol's live RedStone oracle.</span>
            </li>
            <li className="flex gap-3">
              <Step n={2} />
              <span>
                The marketplace holds ATS control-list rights, so a brand-new wallet is whitelisted in the same
                transaction — no admin step, no waiting.
              </span>
            </li>
            <li className="flex gap-3">
              <Step n={3} />
              <span>
                Deposit what you bought on <span className="font-medium text-slate-900">Deposit</span> or{" "}
                <span className="font-medium text-slate-900">Markets</span> to borrow against it.
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
      {n}
    </span>
  );
}
