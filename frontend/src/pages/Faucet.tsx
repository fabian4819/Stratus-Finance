import { useEffect, useState, useCallback } from "react";
import { formatUnits, parseUnits } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { borrowableAssets } from "../lib/borrowableAssets";
import { getMintableErc20 } from "../lib/contracts";
import { addressesConfigured } from "../lib/addresses";
import { PageHeader, TokenBadge, ConnectPrompt, NotConfiguredNotice, StatusLine } from "../components/ui";

/**
 * Testnet faucet. MockUSDC and the 20 MockCrypto reserves each expose an
 * open `mint(to, amount)` (see contracts/src/mocks/*.sol) — this page just
 * calls it for the connected wallet. The tokenized RWAs (Gold, S&P 500,
 * individual stocks) are ATS-issued and NOT user-mintable — get those on
 * the Buy page instead.
 */
const DEFAULT_AMOUNT: Record<string, string> = { USDC: "10000" };

export function Faucet() {
  const { signer, address, connect } = useWallet();
  const [symbol, setSymbol] = useState(borrowableAssets[0]?.symbol ?? "USDC");
  const [amount, setAmount] = useState(DEFAULT_AMOUNT.USDC);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const asset = borrowableAssets.find((a) => a.symbol === symbol);

  const refresh = useCallback(async () => {
    if (!signer || !address || !asset) return;
    const token = getMintableErc20(asset.tokenAddress, signer);
    setBalance(await token.balanceOf(address));
  }, [signer, address, asset]);

  useEffect(() => {
    setBalance(null);
    refresh();
  }, [refresh]);

  function onPickAsset(next: string) {
    setSymbol(next);
    setAmount(DEFAULT_AMOUNT[next] ?? "1000");
  }

  async function handleClaim() {
    if (!signer || !address || !asset) return;
    setBusy(true);
    setStatus(null);
    try {
      const token = getMintableErc20(asset.tokenAddress, signer);
      setStatus(`Minting ${amount} ${asset.symbol}…`);
      const tx = await token.mint(address, parseUnits(amount, asset.decimals));
      await tx.wait();
      setStatus(`Claimed ${amount} ${asset.symbol}. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  if (!addressesConfigured()) return <NotConfiguredNotice />;

  return (
    <div>
      <PageHeader
        title="Faucet"
        subtitle="Claim test USDC to start, or any of the 20 mock crypto reserves to repay a borrow. Testnet tokens with no value."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="card p-5">
          {!address ? (
            <ConnectPrompt onConnect={connect} label="Connect your wallet to claim." />
          ) : (
            <>
              <label className="field-label">Token</label>
              <div className="mb-3 flex items-center gap-3">
                {asset && <TokenBadge symbol={asset.symbol} />}
                <select value={symbol} onChange={(e) => onPickAsset(e.target.value)} className="select">
                  {borrowableAssets.map((a) => (
                    <option key={a.symbol} value={a.symbol}>
                      {a.displayName} ({a.symbol})
                    </option>
                  ))}
                </select>
              </div>

              <label className="field-label">Amount</label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input mb-3 text-lg"
              />

              <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
                <span className="text-slate-500">Your balance</span>
                <span className="tabular-nums font-medium">
                  {balance !== null && asset
                    ? Number(formatUnits(balance, asset.decimals)).toLocaleString()
                    : "—"}{" "}
                  {asset?.symbol}
                </span>
              </div>

              <button onClick={handleClaim} disabled={busy || !amount} className="btn-primary w-full">
                {busy ? "Claiming…" : `Claim ${asset?.symbol ?? ""}`}
              </button>
              <StatusLine status={status} />
            </>
          )}
        </div>

        <div className="card h-fit p-5 text-sm text-slate-600">
          <h2 className="section-title mb-3">Notes</h2>
          <ul className="space-y-2">
            <li>
              <span className="font-medium text-slate-900">USDC</span> is what you spend on the{" "}
              <span className="font-medium text-slate-900">Buy</span> page to acquire tokenized Gold, the S&P 500
              Index, and individual stocks.
            </li>
            <li>
              The <span className="font-medium text-slate-900">mock crypto</span> tokens are the borrowable assets —
              you normally get them by borrowing, but the faucet lets you top up to repay.
            </li>
            <li>
              Gold, S&P 500 and the stocks are compliance-gated ATS tokens and can't be minted here — buy them with
              USDC instead.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
