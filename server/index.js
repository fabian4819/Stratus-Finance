require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { buildChallenge, decodePaymentHeader, verifyPayment } = require("./x402");
const { rankCandidates, toPicks } = require("./scorer");

const PORT = process.env.PORT || 8787;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;
const USDC_ADDRESS = process.env.USDC_ADDRESS;
const PREMIUM_PRICE_USDC = process.env.PREMIUM_PRICE_USDC || "1000000";
const MIRROR_NODE_URL = process.env.MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

/**
 * x402-gated premium AI yield advisor. First call with no X-PAYMENT
 * header gets a 402 challenge; pay USDC to the treasury address it
 * names, then retry with X-PAYMENT: base64(JSON.stringify({ txHash })).
 * See x402.js for exactly what "verified" means here.
 *
 * Body: { riskPreference: "conservative"|"balanced"|"aggressive",
 *   candidates: { supply: [...], stake: [...] }, portfolio?: {...} }
 * — the server has no chain RPC of its own; the client sends the
 * on-chain-derived candidate numbers it already computed for the free
 * tier, and this endpoint only adds DeepSeek's reasoning on top.
 */
app.post("/api/advisor/premium", async (req, res) => {
  const resource = "/api/advisor/premium";
  const challenge = buildChallenge({
    resource,
    treasury: TREASURY_ADDRESS,
    usdcAddress: USDC_ADDRESS,
    priceUsdc: PREMIUM_PRICE_USDC,
  });

  const paymentHeader = req.header("X-PAYMENT");
  if (!paymentHeader) {
    return res.status(402).json(challenge);
  }

  const payment = decodePaymentHeader(paymentHeader);
  const verification = await verifyPayment({
    txHash: payment?.txHash,
    mirrorNodeUrl: MIRROR_NODE_URL,
    usdcAddress: USDC_ADDRESS,
    treasury: TREASURY_ADDRESS,
    minAmount: PREMIUM_PRICE_USDC,
  }).catch((e) => ({ ok: false, reason: e.message }));

  if (!verification.ok) {
    return res.status(402).json({ ...challenge, error: verification.reason });
  }

  const { riskPreference, candidates, portfolio } = req.body || {};
  // Tag target authoritatively from which bucket a candidate came in on
  // — never rely on the caller having set it correctly.
  const supply = (candidates?.supply || []).map((c) => ({ ...c, target: "supply" }));
  const stake = (candidates?.stake || []).map((c) => ({ ...c, target: "stake" }));

  try {
    const deepseekPicks = await getDeepSeekPicks({ riskPreference, supply, stake, portfolio });
    return res.json({ source: "deepseek", picks: deepseekPicks });
  } catch (e) {
    // Payment is already verified — a paying user must still get a real
    // answer, so fall back to the same deterministic ranker the free
    // tier uses rather than returning an error.
    console.error("DeepSeek call failed, falling back to deterministic ranker:", e.message);
    const fallback = toPicks(rankCandidates(supply, stake, riskPreference || "balanced"));
    return res.json({ source: "fallback", picks: fallback, deepseekError: e.message });
  }
});

async function getDeepSeekPicks({ riskPreference, supply, stake, portfolio }) {
  if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY not configured");

  const candidateList = [
    ...supply.map((c) => ({
      target: "supply",
      protocol: c.protocol || "Stratus",
      externalUrl: c.externalUrl,
      poolAddress: c.poolAddress,
      tokenAddress: c.tokenAddress,
      decimals: c.decimals,
      symbol: c.symbol,
      displayName: c.displayName,
      apyPct: c.apyPct,
    })),
    ...stake.map((c) => ({
      target: "stake",
      protocol: "Stratus",
      symbol: c.symbol,
      displayName: c.displayName,
      stratPerTokenPerYear: c.stratPerTokenPerYear,
    })),
  ];

  const systemPrompt = [
    "You are a DeFi yield allocation advisor for Stratus Finance, a lending protocol on Hedera testnet.",
    "You will be given: a risk preference, a list of candidate yield options, and the user's current portfolio.",
    "Each candidate has a 'protocol' field — most are 'Stratus' (this app's own pool/staking), but some 'supply'",
    "candidates are 'Bonzo Finance', a genuinely different, independently-deployed lending protocol on Hedera",
    "testnet (read-only real rates, not a Stratus product) — a real cross-protocol comparison, treat it as such",
    "in your reasoning when relevant (e.g. note it requires the user to act on a different app).",
    "Each candidate is either target='supply' (lend the asset, apyPct = real USD-denominated APY)",
    "or target='stake' (stake the asset in Stratus's rewards pool, stratPerTokenPerYear = STRAT reward tokens",
    "per staked token per year — STRAT has no price feed, so this is NOT a USD APY, treat it as a distinct,",
    "unpriced signal, not directly comparable to apyPct).",
    "Pick 2-4 candidates from the given list, ranked best-first for the stated risk preference.",
    "You MUST only use symbol+target+protocol triples that appear in the candidate list — never invent one.",
    "Respond with ONLY a JSON object: {\"picks\":[{\"symbol\":string,\"target\":\"supply\"|\"stake\",\"protocol\":string,\"reasoning\":string,\"confidence\":\"low\"|\"medium\"|\"high\"}]}.",
  ].join(" ");

  const userPrompt = JSON.stringify({ riskPreference, candidates: candidateList, portfolio: portfolio || null });

  const resp = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!resp.ok) throw new Error(`DeepSeek API error ${resp.status}`);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned no content");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek response was not valid JSON");
  }
  if (!Array.isArray(parsed.picks)) throw new Error("DeepSeek response missing picks array");

  // Never trust the model's own numbers or invented symbols — re-attach
  // the real candidate data by looking each pick up in the list we sent.
  const validated = [];
  for (const pick of parsed.picks) {
    const match = candidateList.find(
      (c) => c.symbol === pick.symbol && c.target === pick.target && c.protocol === (pick.protocol || "Stratus")
    );
    if (!match) continue; // silently drop anything not in the real candidate list
    validated.push({
      target: match.target,
      protocol: match.protocol,
      externalUrl: match.externalUrl,
      poolAddress: match.poolAddress,
      tokenAddress: match.tokenAddress,
      decimals: match.decimals,
      symbol: match.symbol,
      displayName: match.displayName,
      rate: match.target === "supply" ? match.apyPct : match.stratPerTokenPerYear,
      reasoning: typeof pick.reasoning === "string" ? pick.reasoning : "",
      confidence: ["low", "medium", "high"].includes(pick.confidence) ? pick.confidence : "medium",
    });
  }
  if (validated.length === 0) throw new Error("DeepSeek picks did not match any real candidate");
  return validated;
}

// Vercel deploys this as a Node backend (introspects the exported app,
// wraps it as a Lambda) — it never calls .listen() itself, so only do
// that for local/`npm run advisor-server` use.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Stratus advisor server listening on :${PORT}`);
  });
}

module.exports = app;
