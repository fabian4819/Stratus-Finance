import { borrowableAssets } from "./borrowableAssets";

/**
 * Assets with an open StratusStaking pool — every borrowable crypto
 * reserve except USDC (see contracts/script/14-deploy-staking.ts, which
 * opens pools in contracts/config/borrowable-crypto.json's order — the
 * same order borrowableAssets.ts lists them in after USDC). `poolId`
 * here is that same 0-indexed order, matching the on-chain pool array.
 */
export interface StakingAsset {
  symbol: string;
  displayName: string;
  tokenAddress: string;
  decimals: number;
  poolId: number;
}

export const stakingAssets: StakingAsset[] = borrowableAssets
  .filter((a) => a.symbol !== "USDC")
  .map((a, poolId) => ({ ...a, poolId }));
