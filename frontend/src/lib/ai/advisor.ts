import { ZeroAddress, formatEther, formatUnits } from "ethers";
import { getDataProvider, getStaking } from "../contracts";
import { readProvider } from "../wallet";
import { individualStocks } from "../individualStocks";
import { stakingAssets } from "../stakingAssets";

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const RAY = 1e27;

export type RiskPreference = "conservative" | "balanced" | "aggressive";

export interface SupplyCandidate {
  target: "supply";
  symbol: string;
  displayName: string;
  apyPct: number;
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
 * Real on-chain reads, no mock data. Supply candidates are the 12 spot
 * RWA reserves (Gold/S&P 500/10 stocks) — the ones with an actual
 * deposit UI (Markets page). Crypto reserves aren't included as supply
 * candidates because there's no "supply crypto as collateral" page to
 * deep-link to yet, even though the pool itself allows it.
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

  const supply = await Promise.all(
    individualStocks.map(async (a) => {
      const data = await dataProvider.getUserReserveData(a.tokenAddress, ZeroAddress);
      const apyPct = (Number(data.liquidityRate) / RAY) * 100;
      return { target: "supply" as const, symbol: a.symbol, displayName: a.displayName, apyPct };
    })
  );

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

  return { supply, stake };
}

/** Free tier: deterministic, transparent, zero external calls. Two
 * buckets ranked by their own unit — no fake cross-unit blending. */
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
  return c.target === "supply"
    ? `Supplying ${c.displayName} to the pool currently earns ${c.apyPct.toFixed(2)}% APY.`
    : `Staking ${c.displayName} currently emits ~${c.stratPerTokenPerYear.toFixed(4)} STRAT per token per year.`;
}
