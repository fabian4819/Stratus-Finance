import { useState } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../lib/WalletContext";
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

/** AI advisor — recommends across Stratus's own yield surfaces (lending
 * supply, StratusStaking) AND Bonzo Finance's real testnet deployment
 * (a genuinely different, independently-deployed lending protocol,
 * read-only) — a real cross-protocol comparison, not just internal
 * allocation. Advisor only, never an agent: it ranks and explains, the
 * user always clicks through and executes manually — Bonzo picks link
 * to Bonzo's own testnet app, never something Stratus executes on the
 * user's behalf. Free tier is a deterministic, zero-network scorer;
 * premium tier pays 1 USDC via x402 for a DeepSeek-reasoned pick — see
 * docs/phase-6-ai-advisor.md. */
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
          {free.map((c) => (
            <RecommendationCard
              key={`${c.target}-${c.target === "supply" ? c.protocol : ""}-${c.symbol}`}
              symbol={c.symbol}
              displayName={c.displayName}
              target={c.target}
              protocol={c.target === "supply" ? c.protocol : "Stratus"}
              externalUrl={c.target === "supply" ? c.externalUrl : undefined}
              reasoning={reasoningFor(c)}
              confidence="deterministic"
            />
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
            {premium.map((p) => (
              <RecommendationCard
                key={`${p.target}-${p.protocol}-${p.symbol}`}
                symbol={p.symbol}
                displayName={p.displayName}
                target={p.target}
                protocol={p.protocol}
                externalUrl={p.externalUrl}
                reasoning={p.reasoning}
                confidence={p.confidence}
              />
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
  reasoning,
  confidence,
}: {
  symbol: string;
  displayName: string;
  target: "supply" | "stake";
  protocol: string;
  externalUrl?: string;
  reasoning: string;
  confidence: string;
}) {
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
      {externalUrl ? (
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
