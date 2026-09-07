import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const HEDERA_TESTNET_RPC =
  process.env.HEDERA_TESTNET_RPC_URL ?? "https://testnet.hashio.io/api";
const DEPLOYER_KEY = process.env.HEDERA_TESTNET_OPERATOR_PRIVATE_KEY ?? "";

// Aave v2's LendingPool and its supporting logic libraries are large.
// Hedera's per-transaction gas ceiling can be tighter than mainnet Ethereum's
// block gas limit, so `optimizer.runs` is kept low to favour smaller bytecode
// over runtime gas efficiency. Library-linked deployment (ReserveLogic,
// GenericLogic, ValidationLogic as external libraries — already the upstream
// Aave v2 layout) is the primary mitigation; see PLAN.md Phase 0 / risk #1.
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.6.12", // Aave v2 / Bonzo fork compiler version
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
      {
        version: "0.8.19", // Stratus original contracts
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      // Local sandbox for unit/integration tests with a mock Pyth feed.
    },
    hederaTestnet: {
      url: HEDERA_TESTNET_RPC,
      chainId: 296,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 120_000, // testnet integration tests can be slow
  },
};

export default config;
