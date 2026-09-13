import { Contract, ZeroAddress, formatEther, formatUnits } from "ethers";
import { getDataProvider, getStaking } from "../contracts";
import { readProvider } from "../wallet";
import { individualStocks } from "../individualStocks";
import { stakingAssets } from "../stakingAssets";
import { PROTOCOL_DATA_PROVIDER_ABI } from "../abis";

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const RAY = 1e27;

export type RiskPreference = "conservative" | "balanced" | "aggressive";
export type SupplyProtocol = "Stratus" | "Bonzo Finance";

export interface SupplyCandidate {
  target: "supply";
  protocol: SupplyProtocol;
  symbol: string;
  displayName: string;
  apyPct: number;
  /** Set only for protocol !== "Stratus" — where to actually go act on it. */
  externalUrl?: string;
}

export interface StakeCandidate {
  target: "stake";
  symbol: string;
  displayName: string;
  poolId: number;
  stratPerTokenPerYear: number;
  totalStaked: number;
}

export type Candidate = SupplyCandidate | StakeCandidate;

/**
 * Bonzo Finance — Hedera's own Aave v2 fork, live on testnet — is a
 * genuinely different, independently-deployed lending protocol (not a
 * Stratus instance; Stratus's own lending core happens to *also* be a
 * Bonzo fork, but this is Bonzo's real deployment, a separate live
 * contract with its own liquidity and rates). Real testnet addresses,
 * sourced directly from Bonzo's own public repo
 * (github.com/Bonzo-Labs/bonzo-finance-contracts,
 * scripts/outputReserveData.json) — not guessed, not mocked.
 * Read-only: the advisor only reads Bonzo's real rates for comparison,
 * it never deposits into Bonzo on the user's behalf.
 */
const BONZO_DATA_PROVIDER = "0xf7330B06656DbC4cFaE0f5fE3FF5e5598c762AFa";
const BONZO_APP_URL = "https://testnet.bonzo.finance";
const BONZO_RESERVES = [
  { symbol: "USDC", displayName: "USDC", tokenAddress: "0x0000000000000000000000000000000000001549" },
  { symbol: "HBARX", displayName: "HBARX", tokenAddress: "0x0000000000000000000000000000000000220ced" },
  { symbol: "SAUCE", displayName: "SAUCE", tokenAddress: "0x0000000000000000000000000000000000120f46" },
  { symbol: "WHBAR", displayName: "WHBAR", tokenAddress: "0x0000000000000000000000000000000000003ad2" },
];

/**
 * Real on-chain reads, no mock data. Stratus supply candidates are the
 * 12 spot RWA reserves (Gold/S&P 500/10 stocks) — the ones with an
 * actual deposit UI (Markets page). Stratus's own crypto reserves
 * aren't included as supply candidates because there's no "supply
 * crypto as collateral" page to deep-link to yet, even though the pool
 * itself allows it. Bonzo Finance's real reserves are read the same way
 * (getUserReserveData against a plain zero address, since liquidityRate
 * is reserve-level data bundled into that per-user call) and merged
 * into the same "supply" bucket — a genuine cross-protocol comparison.
 *
 * Staking candidates are the 20 crypto reserves' StratusStaking pools.
 * stratPerTokenPerYear is a token-denominated rate (STRAT per staked
 * token per year), NOT a USD APY — STRAT has no price feed, so it isn't
 * comparable to apyPct. Keeping the two units separate rather than
 * faking a blended number is a deliberate choice, not an omission.
 */
export async function loadCandidates(): Promise<{ supply: SupplyCandidate[]; stake: StakeCandidate[] }> {
  const dataProvider = getDataProvider(readProvider);
  const staking = getStaking(readProvider);
  const bonzoDataProvider = new Contract(BONZO_DATA_PROVIDER, PROTOCOL_DATA_PROVIDER_ABI, readProvider);

  const stratusSupply = await Promise.all(
    individualStocks.map(async (a) => {
      const data = await dataProvider.getUserReserveData(a.tokenAddress, ZeroAddress);
      const apyPct = (Number(data.liquidityRate) / RAY) * 100;
      return { target: "supply" as const, protocol: "Stratus" as const, symbol: a.symbol, displayName: a.displayName, apyPct };
    })
  );

  const bonzoSupply = (
    await Promise.all(
      BONZO_RESERVES.map(async (a): Promise<SupplyCandidate | null> => {
        try {
          const data = await bonzoDataProvider.getUserReserveData(a.tokenAddress, ZeroAddress);
          const apyPct = (Number(data.liquidityRate) / RAY) * 100;
          return {
            target: "supply",
            protocol: "Bonzo Finance",
            symbol: a.symbol,
            displayName: a.displayName,
            apyPct,
            externalUrl: BONZO_APP_URL,
          };
        } catch {
          // Bonzo's testnet RPC hiccups or a reserve address is stale —
          // drop that one candidate rather than break the whole advisor.
          return null;
        }
      })
    )
  ).filter((c): c is SupplyCandidate => c !== null);

  const stake = await Promise.all(
    stakingAssets.map(async (a) => {
      const pool = await staking.pools(a.poolId);
      const totalStaked = pool.totalStaked as bigint;
      const rewardPerSecond = pool.rewardPerSecond as bigint;
      const rate =
        totalStaked > 0n
          ? (Number(formatEther(rewardPerSecond)) * SECONDS_PER_YEAR) / Number(formatEther(totalStaked))
          : 0;
      return {
        target: "stake" as const,
        symbol: a.symbol,
        displayName: a.displayName,
        poolId: a.poolId,
        stratPerTokenPerYear: rate,
        totalStaked: Number(formatUnits(totalStaked, a.decimals)),
      };
    })
  );

  return { supply: [...stratusSupply, ...bonzoSupply], stake };
}

/** Free tier: deterministic, transparent, zero external calls beyond
 * the plain RPC reads above. Two buckets ranked by their own unit — no
 * fake cross-unit blending, and Stratus/Bonzo supply candidates are
 * ranked together in the same bucket since apyPct is directly
 * comparable across the two protocols. */
export function rankCandidates(
  supply: SupplyCandidate[],
  stake: StakeCandidate[],
  risk: RiskPreference
): Candidate[] {
  const bySupply = [...supply].sort((a, b) => b.apyPct - a.apyPct);
  const byStake = [...stake].sort((a, b) => b.stratPerTokenPerYear - a.stratPerTokenPerYear);

  if (risk === "conservative") return bySupply.slice(0, 3);
  if (risk === "aggressive") return byStake.slice(0, 3);
  return [...bySupply.slice(0, 2), ...byStake.slice(0, 2)];
}

export function reasoningFor(c: Candidate): string {
  if (c.target === "supply") {
    const where = c.protocol === "Stratus" ? "the Stratus pool" : `${c.protocol} (external, real testnet deployment)`;
    return `Supplying ${c.displayName} on ${where} currently earns ${c.apyPct.toFixed(2)}% APY.`;
  }
  return `Staking ${c.displayName} currently emits ~${c.stratPerTokenPerYear.toFixed(4)} STRAT per token per year.`;
}
