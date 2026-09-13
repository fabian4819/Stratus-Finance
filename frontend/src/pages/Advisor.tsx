import { useState } from "react";
import { Contract, parseUnits } from "ethers";
import { Link } from "react-router-dom";
import { useWallet } from "../lib/WalletContext";
import { getErc20 } from "../lib/contracts";
import { LENDING_POOL_ABI } from "../lib/abis";
import {
  loadCandidates,
  rankCandidates,
  reasoningFor,
  type Candidate,
  type RiskPreference,
} from "../lib/ai/advisor";
import { fetchPremiumAdvice, type PremiumPick } from "../lib/ai/x402Client";
import { PageHeader, TokenBadge, ConnectPrompt, StatusLine } from "../components/ui";

const RISK_OPTIONS: { value: RiskPreference; label: string }[] = [
  { value: "conservative", label: "Conservative" },
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Aggressive" },
];

interface CardData {
  symbol: string;
  displayName: string;
  target: "supply" | "stake";
  protocol: string;
  externalUrl?: string;
  poolAddress?: string;
  tokenAddress?: string;
  decimals?: number;
  reasoning: string;
  confidence: string;
}

/** AI advisor — recommends across Stratus's own yield surfaces (lending
 * supply, StratusStaking) AND Bonzo Finance's real testnet deployment
 * (a genuinely different, independently-deployed lending protocol) — a
 * real cross-protocol comparison, not just internal allocation. Advisor
 * only, never an agent: it ranks and explains, the user always clicks
 * "Supply" and signs the transaction themselves — a Bonzo pick executes
 * a real approve+deposit straight into Bonzo's own public LendingPool
 * contract from this page (same wallet, no redirect needed — Bonzo's
 * pool has the same Aave v2 interface Stratus's own pool uses), it just
 * never happens without the user's own click. Free tier is a
 * deterministic, zero-network scorer; premium tier pays 1 USDC via
 * x402 for a DeepSeek-reasoned pick — see docs/phase-6-ai-advisor.md. */
export function Advisor() {
  const { signer, address, connect } = useWallet();
  const [risk, setRisk] = useState<RiskPreference>("balanced");
  const [free, setFree] = useState<Candidate[] | null>(null);
  const [premium, setPremium] = useState<PremiumPick[] | null>(null);
  const [premiumSource, setPremiumSource] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFree() {
    setBusy(true);
    setStatus(null);
    setPremium(null);
    try {
      const { supply, stake } = await loadCandidates();
      setFree(rankCandidates(supply, stake, risk));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load candidates");
    } finally {
      setBusy(false);
    }
  }

  async function handlePremium() {
    if (!signer) return;
    setBusy(true);
    setStatus(null);
    setFree(null);
    try {
      const { supply, stake } = await loadCandidates();
      const result = await fetchPremiumAdvice(signer, setStatus, { riskPreference: risk, supply, stake });
      setPremium(result.picks);
      setPremiumSource(result.source);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Premium request failed");
    } finally {
      setBusy(false);
    }
  }

  const freeCards: CardData[] = (free ?? []).map((c) => ({
    symbol: c.symbol,
    displayName: c.displayName,
    target: c.target,
    protocol: c.target === "supply" ? c.protocol : "Stratus",
    externalUrl: c.target === "supply" ? c.externalUrl : undefined,
    poolAddress: c.target === "supply" ? c.poolAddress : undefined,
    tokenAddress: c.target === "supply" ? c.tokenAddress : undefined,
    decimals: c.target === "supply" ? c.decimals : undefined,
    reasoning: reasoningFor(c),
    confidence: "deterministic",
  }));

  const premiumCards: CardData[] = (premium ?? []).map((p) => ({
    symbol: p.symbol,
    displayName: p.displayName,
    target: p.target,
    protocol: p.protocol,
    externalUrl: p.externalUrl,
    poolAddress: p.poolAddress,
    tokenAddress: p.tokenAddress,
    decimals: p.decimals,
    reasoning: p.reasoning,
    confidence: p.confidence,
  }));

  return (
    <div>
      <PageHeader
        title="Advisor"
        subtitle="Recommends where to put idle assets — across Stratus's own supply/staking and Bonzo Finance's real testnet lending rates. It only ranks and explains; you always execute the move yourself."
      />

      <div className="card mb-5 p-5">
        <label className="field-label">Risk preference</label>
        <div className="mb-4 flex gap-2">
          {RISK_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setRisk(o.value)}
              className={
                risk === o.value
                  ? "rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              }
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button onClick={handleFree} disabled={busy} className="btn-secondary flex-1">
            {busy ? "Working…" : "Get free recommendation"}
          </button>
          {!address ? (
            <button onClick={connect} className="btn-primary flex-1">
              Connect wallet for premium
            </button>
          ) : (
            <button onClick={handlePremium} disabled={busy} className="btn-primary flex-1">
              {busy ? "Working…" : "Get premium AI recommendation — pay 1 USDC (x402)"}
            </button>
          )}
        </div>
        <StatusLine status={status} />
      </div>

      {!address && !free && (
        <ConnectPrompt
          onConnect={connect}
          label="Connect your wallet to use the premium advisor, or try the free tier above without connecting."
        />
      )}

      {free && (
        <div className="grid gap-4 sm:grid-cols-2">
          {freeCards.map((c) => (
            <RecommendationCard key={`${c.target}-${c.protocol}-${c.symbol}`} {...c} />
          ))}
        </div>
      )}

      {premium && (
        <>
          <div className="mb-3 text-xs font-medium text-slate-500">
            Source:{" "}
            {premiumSource === "deepseek"
              ? "DeepSeek (paid)"
              : "deterministic fallback (DeepSeek call failed, payment still honored)"}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {premiumCards.map((c) => (
              <RecommendationCard key={`${c.target}-${c.protocol}-${c.symbol}`} {...c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RecommendationCard({
  symbol,
  displayName,
  target,
  protocol,
  externalUrl,
  poolAddress,
  tokenAddress,
  decimals,
  reasoning,
  confidence,
}: CardData) {
  const isExternalSupply = target === "supply" && protocol !== "Stratus";

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-3">
        <TokenBadge symbol={symbol} />
        <div>
          <div className="text-sm font-semibold text-slate-900">{displayName}</div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            {target === "supply" ? `Supply · ${protocol}` : "Stake for STRAT"} · {confidence}
          </div>
        </div>
      </div>
      <p className="mb-3 text-sm text-slate-600">{reasoning}</p>

      {isExternalSupply && poolAddress && tokenAddress && decimals !== undefined ? (
        <ExternalSupplyAction
          protocol={protocol}
          symbol={symbol}
          poolAddress={poolAddress}
          tokenAddress={tokenAddress}
          decimals={decimals}
          externalUrl={externalUrl}
        />
      ) : externalUrl ? (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          Go to {protocol} ↗
        </a>
      ) : (
        <Link
          to={target === "supply" ? "/stocks" : "/stake"}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          {target === "supply" ? "Go to Markets →" : "Go to Stake →"}
        </Link>
      )}
    </div>
  );
}

/** Executes a real approve+deposit straight into an external protocol's
 * own LendingPool (Bonzo Finance today) — same Aave v2 interface
 * Stratus's own pool uses, called directly with the already-connected
 * wallet. No redirect: this signs a transaction against a contract
 * Stratus doesn't own or control, same as clicking "Supply" anywhere
 * else in this app, just pointed at someone else's pool. The user needs
 * that protocol's own reserve token (not a Stratus one) in their wallet. */
function ExternalSupplyAction({
  protocol,
  symbol,
  poolAddress,
  tokenAddress,
  decimals,
  externalUrl,
}: {
  protocol: string;
  symbol: string;
  poolAddress: string;
  tokenAddress: string;
  decimals: number;
  externalUrl?: string;
}) {
  const { signer, address, connect } = useWallet();
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSupply() {
    if (!signer || !address) return;
    setBusy(true);
    setStatus(null);
    try {
      const token = getErc20(tokenAddress, signer);
      const pool = new Contract(poolAddress, LENDING_POOL_ABI, signer);
      const supplyAmount = parseUnits(amount, decimals);

      setStatus(`Approving ${symbol} for ${protocol}…`);
      await (await token.approve(poolAddress, supplyAmount)).wait();
      setStatus(`Supplying ${amount} ${symbol} on ${protocol}…`);
      const tx = await pool.deposit(tokenAddress, supplyAmount, address, 0);
      await tx.wait();
      setStatus(`Supplied ${amount} ${symbol} on ${protocol}. Tx ${tx.hash.slice(0, 10)}…`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Supply failed");
    } finally {
      setBusy(false);
    }
  }

  if (!address) {
    return (
      <button onClick={connect} className="btn-secondary w-full text-sm">
        Connect wallet to supply on {protocol}
      </button>
    );
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input text-sm"
        />
        <button onClick={handleSupply} disabled={busy || !amount} className="btn-primary whitespace-nowrap text-sm">
          {busy ? "Working…" : `Supply on ${protocol}`}
        </button>
      </div>
      <p className="text-[11px] text-slate-400">
        Requires your own {symbol} on {protocol}'s testnet — not a Stratus token.{" "}
        {externalUrl && (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
            Open {protocol} ↗
          </a>
        )}
      </p>
      <StatusLine status={status} />
    </div>
  );
}
