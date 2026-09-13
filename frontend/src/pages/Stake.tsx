import { useEffect, useState, useCallback } from "react";
import { formatUnits, parseUnits } from "ethers";
import { useWallet } from "../lib/WalletContext";
import { stakingAssets } from "../lib/stakingAssets";
import { addresses, addressesConfigured } from "../lib/addresses";
import { getStaking, getErc20 } from "../lib/contracts";
import { PageHeader, TokenBadge, ConnectPrompt, NotConfiguredNotice, StatusLine } from "../components/ui";

// ethers' auto estimateGas under-reports for StratusStaking's calls on
// Hedera (same HashIO quirk documented for batchInitReserve elsewhere in
// this repo) — confirmed via staticCall succeeding while the real tx
// reverted with default gas. Explicit override avoids the false revert.
const STAKING_GAS_LIMIT = 500_000;

/** Stake any borrowable crypto reserve for STRAT rewards — a separate
 * mechanism from the lending pool (see StratusStaking.sol): staking a
 * token here doesn't touch its use as pool collateral, and vice versa.
 * MasterChef-style accumulator, rewards minted to the caller on
 * stake/unstake/claim. */
export function Stake() {
  const { signer, address, connect } = useWallet();
  const [selectedSymbol, setSelectedSymbol] = useState(stakingAssets[0]?.symbol ?? "");
  const [amount, setAmount] = useState("1");
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [stakedAmount, setStakedAmount] = useState<bigint | null>(null);
  const [pendingReward, setPendingReward] = useState<bigint | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = stakingAssets.find((a) => a.symbol === selectedSymbol);

  const refresh = useCallback(async () => {
    if (!signer || !address || !selected) return;
    const staking = getStaking(signer);
    const token = getErc20(selected.tokenAddress, signer);
    const [balance, user, pending] = await Promise.all([
      token.balanceOf(address),
      staking.userInfo(selected.poolId, address),
      staking.pendingReward(selected.poolId, address),
    ]);
    setWalletBalance(balance);
    setStakedAmount(user.amount);
    setPendingReward(pending);
  }, [signer, address, selected]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 6_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (!addressesConfigured() || !addresses.stratusStaking) return <NotConfiguredNotice what="Staking contract" />;

  async function handleStake() {
    if (!signer || !selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const stakingAddress = await getStaking(signer).getAddress();
      const token = getErc20(selected.tokenAddress, signer);
      const staking = getStaking(signer);
      const stakeAmount = parseUnits(amount, selected.decimals);

      setStatus(`Approving ${selected.symbol}…`);
      await (await token.approve(stakingAddress, stakeAmount)).wait();
      setStatus(`Staking ${amount} ${selected.symbol}…`);
      const tx = await staking.stake(selected.poolId, stakeAmount, { gasLimit: STAKING_GAS_LIMIT });
      await tx.wait();
      setStatus(`Staked ${amount} ${selected.symbol}. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Stake failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnstake() {
    if (!signer || !selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const staking = getStaking(signer);
      const unstakeAmount = parseUnits(amount, selected.decimals);
      setStatus(`Unstaking ${amount} ${selected.symbol}…`);
      const tx = await staking.unstake(selected.poolId, unstakeAmount, { gasLimit: STAKING_GAS_LIMIT });
      await tx.wait();
      setStatus(`Unstaked ${amount} ${selected.symbol}. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unstake failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleClaim() {
    if (!signer || !selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const staking = getStaking(signer);
      setStatus("Claiming STRAT…");
      const tx = await staking.claim(selected.poolId, { gasLimit: STAKING_GAS_LIMIT });
      await tx.wait();
      setStatus(`Claimed. Tx ${tx.hash.slice(0, 10)}…`);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Stake"
        subtitle="Stake any of the 20 crypto reserves to earn STRAT — independent of the lending pool. A staked token is not pool collateral, and pool collateral isn't staked."
      />

      {!address ? (
        <ConnectPrompt onConnect={connect} label="Connect your wallet to stake." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="card p-5">
            <label className="field-label">Asset</label>
            <div className="mb-3 flex items-center gap-3">
              {selected && <TokenBadge symbol={selected.symbol} />}
              <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)} className="select">
                {stakingAssets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.displayName}
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
              className="input mb-4 text-lg"
            />

            <div className="mb-4 flex gap-3">
              <button onClick={handleStake} disabled={busy || !amount} className="btn-primary flex-1">
                {busy ? "Working…" : "Approve & Stake"}
              </button>
              <button onClick={handleUnstake} disabled={busy || !amount} className="btn-secondary flex-1">
                {busy ? "Working…" : "Unstake"}
              </button>
            </div>
            <button onClick={handleClaim} disabled={busy} className="btn-secondary w-full">
              Claim STRAT
            </button>
            <StatusLine status={status} />
          </div>

          <div className="card h-fit p-5">
            <h2 className="section-title mb-3">Your position — {selected?.displayName ?? "—"}</h2>
            <div className="space-y-2 text-sm">
              <div className="row">
                <span className="row-label">Wallet balance</span>
                <span className="row-value">
                  {walletBalance !== null && selected ? Number(formatUnits(walletBalance, selected.decimals)).toFixed(4) : "—"}
                </span>
              </div>
              <div className="row">
                <span className="row-label">Staked</span>
                <span className="row-value">
                  {stakedAmount !== null && selected ? Number(formatUnits(stakedAmount, selected.decimals)).toFixed(4) : "—"}
                </span>
              </div>
              <div className="row border-t border-[var(--border)] pt-2 font-semibold">
                <span>Pending STRAT reward</span>
                <span className="tabular-nums text-emerald-600">
                  {pendingReward !== null ? Number(formatUnits(pendingReward, 18)).toFixed(6) : "—"}
                </span>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Rewards are minted on stake/unstake/claim, split pro-rata across everyone staked in the same pool.
              Demo emission rate — not tuned to a real yield target.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
