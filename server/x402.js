/**
 * A minimal, self-hosted x402 "facilitator" for one resource:
 * POST /api/advisor/premium. Real x402 wire shape (402 challenge body,
 * X-PAYMENT retry header) — but settlement is verified directly against
 * the Hedera mirror node (an ERC20 Transfer log lookup) instead of the
 * spec's EIP-3009 "exact" facilitator flow. That's a disclosed
 * simplification, not an oversight: no official Hedera facilitator
 * exists yet (only early community ones, e.g. Blocky402, with unverified
 * uptime/API stability), and MockUSDC doesn't implement
 * transferWithAuthorization. This keeps the protocol's request/response
 * shape and CAIP-2 network id ("hedera:testnet") real while making the
 * payment check something this project can actually run and verify
 * itself. See docs/phase-6-ai-advisor.md.
 */
const { ethers } = require("ethers");

const TRANSFER_ABI = ["event Transfer(address indexed from, address indexed to, uint256 value)"];
const transferInterface = new ethers.Interface(TRANSFER_ABI);

// Demo-only replay guard — in-memory, resets on restart. Fine for a
// single-process testnet demo; a real deployment would persist this.
const usedTxHashes = new Set();

function buildChallenge({ resource, treasury, usdcAddress, priceUsdc }) {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "hedera:testnet",
        maxAmountRequired: String(priceUsdc),
        resource,
        description: "Premium AI yield recommendation (DeepSeek-powered)",
        mimeType: "application/json",
        payTo: treasury,
        asset: usdcAddress,
        extra: {
          note: "Settlement verified via Hedera mirror-node log lookup, not the EIP-3009 facilitator flow — see server/x402.js.",
        },
      },
    ],
  };
}

function decodePaymentHeader(headerValue) {
  if (!headerValue) return null;
  try {
    const json = Buffer.from(headerValue, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function verifyPayment({ txHash, mirrorNodeUrl, usdcAddress, treasury, minAmount }) {
  if (!txHash || typeof txHash !== "string") {
    return { ok: false, reason: "missing txHash in X-PAYMENT" };
  }
  const key = txHash.toLowerCase();
  if (usedTxHashes.has(key)) {
    return { ok: false, reason: "txHash already used" };
  }

  // Logs come embedded in the same /contracts/results/{hash} response —
  // the separate /logs sub-endpoint 404s for a plain single-call tx.
  const resultRes = await fetch(`${mirrorNodeUrl}/api/v1/contracts/results/${txHash}`);
  if (!resultRes.ok) return { ok: false, reason: `mirror node lookup failed (${resultRes.status})` };
  const result = await resultRes.json();
  if (result.result !== "SUCCESS") {
    return { ok: false, reason: `tx not successful: ${result.result}` };
  }
  const logs = result.logs || [];

  const targetAddress = usdcAddress.toLowerCase();
  const targetTreasury = treasury.toLowerCase();

  for (const log of logs) {
    if ((log.address || "").toLowerCase() !== targetAddress) continue;
    let parsed;
    try {
      parsed = transferInterface.parseLog({ topics: log.topics, data: log.data });
    } catch {
      continue;
    }
    if (!parsed || parsed.name !== "Transfer") continue;
    if (parsed.args.to.toLowerCase() !== targetTreasury) continue;
    if (parsed.args.value >= BigInt(minAmount)) {
      usedTxHashes.add(key);
      return { ok: true, amount: parsed.args.value.toString(), from: parsed.args.from };
    }
  }
  return { ok: false, reason: "no matching USDC transfer to treasury found in tx logs" };
}

module.exports = { buildChallenge, decodePaymentHeader, verifyPayment };
