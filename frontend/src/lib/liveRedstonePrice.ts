/**
 * Genuinely real-time price reads via StratusLivePriceReader — NOT the
 * pool's oracle (StratusRedstoneOracle), which is necessarily a cache
 * (see its contract docs / docs/phase-3-oracle-research.md). This talks
 * directly to RedStone's gateway from the browser and wraps the read
 * call with fresh signed data every time — no waiting on
 * script/update-redstone-prices.ts, but also not usable for anything
 * that goes through the pool internally (deposit/borrow/getUserRisk
 * still depend on the cache).
 *
 * Uses ethers v5 (aliased as "ethers-v5" in package.json) because
 * @redstone-finance/evm-connector@0.9.0's WrapperBuilder is built
 * against the v5 Contract/Provider API — every other part of this
 * frontend stays on ethers v6 throughout; only this module touches v5.
 */
import { providers, Contract } from "ethers-v5";
import { WrapperBuilder } from "@redstone-finance/evm-connector";
import { addresses } from "./addresses";
import { HEDERA_TESTNET_RPC_URL, HEDERA_TESTNET_CHAIN_ID } from "./wallet";

const READER_ABI = ["function getLivePrices(bytes32[] feedIds) view returns (uint256[])"];

// PrimaryProdDataServiceConsumerBase's 5 hardcoded authorised signers
// (from @redstone-finance/evm-connector@0.9.0's contract source) — the
// SDK needs this list explicitly; it is not auto-derived from the
// contract. Same list used by contracts/script/update-redstone-prices.ts.
const AUTHORIZED_SIGNERS = [
  "0x8BB8F32Df04c8b654987DAaeD53D6B6091e3B774",
  "0xdEB22f54738d54976C4c0fe5ce6d408E40d88499",
  "0x51Ce04Be4b3E32572C4Ec9135221d0691Ba7d202",
  "0xDD682daEC5A90dD295d14DA4b0bec9281017b5bE",
  "0x9c5AE89C4Af6aA32cE58588DBaF90d18a855B6de",
];

const REDSTONE_DECIMALS = 8;
const USD_DECIMALS = 18;

function toBytes32(feedId: string): string {
  const bytes = new TextEncoder().encode(feedId);
  if (bytes.length > 32) throw new Error(`feed id too long: ${feedId}`);
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return "0x" + Array.from(padded, (b) => b.toString(16).padStart(2, "0")).join("");
}

let readerContract: Contract | null = null;
function getReaderContract(): Contract {
  if (!readerContract) {
    const provider = new providers.JsonRpcProvider(HEDERA_TESTNET_RPC_URL, HEDERA_TESTNET_CHAIN_ID);
    readerContract = new Contract(addresses.stratusLivePriceReader, READER_ABI, provider);
  }
  return readerContract;
}

// In-flight request de-dup, keyed by the exact feed-id set. Without this,
// React 18 StrictMode's intentional double-invoke of mount effects (dev
// mode only) fires two near-simultaneous fetchLivePrices() calls against
// the same underlying ethers-v5 Contract/Provider instance, and one of
// the two can silently fail — the page then shows "—" until the next
// 15s poll quietly fixes it. Sharing one in-flight promise across both
// callers removes the race entirely rather than just tolerating it.
const inFlight = new Map<string, Promise<Record<string, bigint>>>();

/**
 * Fetches live prices for the given RedStone feed ids in one wrapped
 * call (one gateway round-trip). Returns a map keyed by feed id, scaled
 * to 18 decimals to match how the rest of the app formats USD amounts
 * (formatEther). Throws if the gateway or the contract call fails —
 * callers should catch and fall back to the cached oracle price, or
 * show "—", rather than crash the page.
 */
export async function fetchLivePrices(feedIds: string[]): Promise<Record<string, bigint>> {
  const key = [...feedIds].sort().join(",");
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = doFetchLivePrices(feedIds).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

async function doFetchLivePrices(feedIds: string[]): Promise<Record<string, bigint>> {
  const contract = getReaderContract();
  const wrapped = WrapperBuilder.wrap(contract as any).usingDataService({
    dataServiceId: "redstone-primary-prod",
    dataPackagesIds: feedIds,
    uniqueSignersCount: 3,
    authorizedSigners: AUTHORIZED_SIGNERS,
  });

  const raw: any[] = await wrapped.getLivePrices(feedIds.map(toBytes32));
  const scale = 10n ** BigInt(USD_DECIMALS - REDSTONE_DECIMALS);
  const result: Record<string, bigint> = {};
  feedIds.forEach((id, i) => {
    result[id] = BigInt(raw[i].toString()) * scale;
  });
  return result;
}
