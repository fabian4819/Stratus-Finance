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
    <div className="mx-auto max-w-lg">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-white">Buy</h1>
      <p className="mb-6 text-sm text-slate-400">
        Buy Gold, the S&amp;P 500 Index, or any of 10 individual stocks directly with USDC, at the live protocol
        price. First-time buyers are whitelisted automatically — no waiting on anyone.
      </p>

      {!address ? (
        <button onClick={connect} className="btn-primary">
          Connect wallet to continue
        </button>
      ) : (
        <>
          <div className="glass-panel mb-4 flex justify-between p-4 text-sm">
            <span className="stat-label">Your USDC balance</span>
            <span className="stat-value">{usdcBalance !== null ? formatUnits(usdcBalance, USDC_DECIMALS) : "—"}</span>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Asset</label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="glass-select"
              >
                {sellableAssets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Amount (shares, not USD)</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="glass-input"
              />
            </div>
          </div>

          <p className="mb-4 text-xs text-slate-400">
            Cost: {quote !== null ? `${Number(formatUnits(quote, USDC_DECIMALS)).toFixed(2)} USDC` : "—"}
          </p>

          <button onClick={handleBuy} disabled={busy || !amount || quote === null} className="btn-primary w-full">
            {busy ? "Working..." : "Approve + Buy"}
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
