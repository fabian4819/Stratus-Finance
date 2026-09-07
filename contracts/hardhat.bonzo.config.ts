import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * SPIKE-ONLY config (PLAN.md Phase 0, spike: deploy an unmodified Aave v2
 * LendingPool to Hedera testnet). Points sources at the vendored Bonzo
 * contracts tree in isolation from contracts/src, so this one-off compile
 * doesn't disturb the main hardhat.config.ts / artifacts layout. Not part
 * of the regular build — see contracts/lib/bonzo/SETUP.md for how this
 * tree got here (vendored tarball, not a git submodule — see that file for
 * why) and what happens to this config once Phase 2 properly starts.
 */
const HEDERA_TESTNET_RPC = process.env.HEDERA_TESTNET_RPC_URL ?? "https://testnet.hashio.io/api";
const DEPLOYER_KEY = process.env.HEDERA_TESTNET_OPERATOR_PRIVATE_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.6.12",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "istanbul", // matches Bonzo's own hardhat.config.ts exactly
    },
  },
  networks: {
    hederaTestnet: {
      url: HEDERA_TESTNET_RPC,
      chainId: 296,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
  paths: {
    sources: "./lib/bonzo/contracts",
    tests: "./lib/bonzo/spike-test",
    cache: "./cache-bonzo-spike",
    artifacts: "./artifacts-bonzo-spike",
  },
};

export default config;
