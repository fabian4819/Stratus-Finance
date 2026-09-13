import type { JsonRpcSigner } from "ethers";
import { getUsdc } from "../contracts";
import type { RiskPreference, SupplyCandidate, StakeCandidate } from "./advisor";

function importEnv(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

const ADVISOR_SERVER_URL = importEnv("VITE_ADVISOR_SERVER_URL") || "http://localhost:8787";

interface X402Challenge {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    payTo: string;
    asset: string;
  }>;
  error?: string;
}

export interface PremiumPick {
  target: "supply" | "stake";
  symbol: string;
  displayName: string;
  rate: number;
  reasoning: string;
  confidence: string;
}

/**
 * The real x402 request/response shape (402 challenge, X-PAYMENT retry
 * header) against a self-hosted facilitator — see server/x402.js for
 * exactly what "verified" means here and why it isn't the spec's
 * EIP-3009 flow. Pays with a plain USDC transfer via the already-
 * connected wallet, same as every other tx in this app.
 */
export async function fetchPremiumAdvice(
  signer: JsonRpcSigner,
  onStatus: (status: string) => void,
  args: {
    riskPreference: RiskPreference;
    supply: SupplyCandidate[];
    stake: StakeCandidate[];
    portfolio?: unknown;
  }
): Promise<{ source: string; picks: PremiumPick[] }> {
  const body = JSON.stringify({
    riskPreference: args.riskPreference,
    candidates: { supply: args.supply, stake: args.stake },
    portfolio: args.portfolio ?? null,
  });

  onStatus("Requesting premium advice…");
  const first = await fetch(`${ADVISOR_SERVER_URL}/api/advisor/premium`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (first.status !== 402) {
    if (!first.ok) throw new Error(`Advisor server error ${first.status}`);
    return first.json();
  }

  const challenge: X402Challenge = await first.json();
  const accept = challenge.accepts[0];
  if (!accept) throw new Error("No payment option offered");

  onStatus(`Paying ${(Number(accept.maxAmountRequired) / 1e6).toFixed(2)} USDC (x402)…`);
  const usdc = getUsdc(signer);
  const tx = await usdc.transfer(accept.payTo, BigInt(accept.maxAmountRequired));
  await tx.wait();

  onStatus("Payment confirmed — retrying with proof…");
  const paymentHeader = btoa(JSON.stringify({ txHash: tx.hash }));
  const second = await fetch(`${ADVISOR_SERVER_URL}${accept.resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-PAYMENT": paymentHeader },
    body,
  });

  if (!second.ok) {
    const errBody = await second.json().catch(() => ({}));
    throw new Error(errBody.error || `Advisor server rejected payment (${second.status})`);
  }
  return second.json();
}
