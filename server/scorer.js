/**
 * Deterministic fallback ranker — same two-bucket top-N logic as
 * frontend/src/lib/ai/advisor.ts's free tier. Used here only if the
 * DeepSeek call fails after payment was already verified: a paying user
 * must still get a real answer, never an error.
 */
function rankCandidates(supply, stake, risk) {
  const bySupply = [...supply].sort((a, b) => b.apyPct - a.apyPct);
  const byStake = [...stake].sort((a, b) => b.stratPerTokenPerYear - a.stratPerTokenPerYear);

  if (risk === "conservative") return bySupply.slice(0, 3);
  if (risk === "aggressive") return byStake.slice(0, 3);
  return [...bySupply.slice(0, 2), ...byStake.slice(0, 2)];
}

function toPicks(candidates) {
  return candidates.map((c) => {
    const protocol = c.protocol || "Stratus";
    const where = protocol === "Stratus" ? "the Stratus pool" : `${protocol} (external, real testnet deployment)`;
    return {
      target: c.target,
      protocol,
      externalUrl: c.externalUrl,
      poolAddress: c.poolAddress,
      tokenAddress: c.tokenAddress,
      decimals: c.decimals,
      symbol: c.symbol,
      displayName: c.displayName,
      rate: c.target === "supply" ? c.apyPct : c.stratPerTokenPerYear,
      reasoning:
        c.target === "supply"
          ? `Supplying ${c.displayName} on ${where} currently earns ${c.apyPct.toFixed(2)}% APY.`
          : `Staking ${c.displayName} currently emits ~${c.stratPerTokenPerYear.toFixed(4)} STRAT per token per year.`,
      confidence: "deterministic",
    };
  });
}

module.exports = { rankCandidates, toPicks };
