import { useEffect, useState, useCallback } from "react";
import { formatUnits, parseEther } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { sellableAssets } from "../lib/sellableAssets";
import { getUsdc, getMarketplace } from "../lib/contracts";
import { addresses, addressesConfigured } from "../lib/addresses";

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

      setStatus("Approving USDC...");
      await (await usdc.approve(marketplaceAddress, quote)).wait();
      setStatus(`Buying ${amount} ${selected.displayName}...`);
      const tx = await marketplace.buy(selected.tokenAddress, tokenAmount);
      await tx.wait();
      setStatus(`Bought ${amount} ${selected.displayName}. Tx: ${tx.hash.slice(0, 10)}...`);
      await refreshBalance();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Buy failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Buy</h1>
      <p className="text-sm text-slate-600 mb-6">
        Buy Gold, the S&amp;P 500 Index, or any of 10 individual stocks directly with USDC, at the live protocol
        price. First-time buyers are whitelisted automatically — no waiting on anyone.
      </p>

      {!address ? (
        <button onClick={connect} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Connect wallet to continue
        </button>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 p-4 mb-4 text-sm flex justify-between">
            <span className="text-slate-500">Your USDC balance</span>
            <span>{usdcBalance !== null ? formatUnits(usdcBalance, USDC_DECIMALS) : "—"}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className="block text-sm font-medium mb-1">Asset</label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {sellableAssets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.displayName}
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

          <p className="text-xs text-slate-500 mb-4">
            Cost: {quote !== null ? `${Number(formatUnits(quote, USDC_DECIMALS)).toFixed(2)} USDC` : "—"}
          </p>

          <button
            onClick={handleBuy}
            disabled={busy || !amount || quote === null}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Working..." : "Approve + Buy"}
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
