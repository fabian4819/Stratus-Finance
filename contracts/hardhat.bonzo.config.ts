import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Config for the vendored Bonzo/Aave v2 core (`contracts/lib/bonzo/contracts`).
 * Points sources there in isolation from `contracts/src`, so its separate
 * solc version (0.6.12, matching Bonzo's own config exactly, including
 * `evmVersion: istanbul`) and artifact layout don't collide with the main
 * `hardhat.config.ts` — including avoiding artifact name clashes (Bonzo's
 * own `ILendingPool` vs. our consumer-side `contracts/src/interfaces/ILendingPool.sol`).
 *
 * Started as a Phase 0 spike-only config (see `contracts/lib/bonzo/SETUP.md`
 * for how this source tree got here); now the permanent way to compile and
 * deploy/interact with the Bonzo core for Phase 2 onward. All scripts that
 * touch these contracts directly (deploy, initReserve, etc.) run under
 * `--config hardhat.bonzo.config.ts`; scripts under `contracts/script/`
 * that only need to know *addresses* (not full ABIs) of Bonzo contracts —
 * like `StratusVault`'s deploy — keep using the main config.
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
    cache: "./cache-bonzo",
    artifacts: "./artifacts-bonzo",
  },
};

export default config;
