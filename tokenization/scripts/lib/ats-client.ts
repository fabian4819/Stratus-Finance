import { ethers } from "ethers";
import * as path from "path";

/**
 * Shared helper for calling ATS diamond contracts directly, bypassing
 * `@hashgraph/asset-tokenization-sdk` — its `Network.connect` has no
 * headless/private-key signing mode (browser/WalletConnect/custodial KMS
 * only), confirmed in the Phase 0 spike. See docs/phase-0-findings.md
 * Finding 1 and docs/ats-friction.md.
 *
 * Extracted from `spike-ats-mint-transfer.ts` (which proved this pattern
 * end-to-end on testnet: deploy, mint, control-list-gated transfer) so
 * `issue-assets.ts` and `whitelist-protocol-addresses.ts` don't duplicate
 * it. Deep imports below use filesystem-relative paths because the
 * package's "exports" map blocks subpath imports by name.
 */

const CONTRACTS_PKG = path.join(__dirname, "..", "..", "..", "node_modules", "@hashgraph", "asset-tokenization-contracts");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deployEquityFromFactory } = require(path.join(CONTRACTS_PKG, "build/scripts/domain/factory/deployEquityToken.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { IFactory__factory } = require(path.join(CONTRACTS_PKG, "build/typechain-types/index.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const { ATS_ROLES, RegulationType, RegulationSubType } = require(path.join(
  CONTRACTS_PKG,
  "build/scripts/domain/constants.js"
));
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const { ADDRESS_ZERO } = require(path.join(CONTRACTS_PKG, "build/scripts/infrastructure/constants.js"));

/**
 * Live Hedera testnet coordinates. The SDK README's addresses
 * (Resolver 0.0.6797832 / Factory 0.0.6797955) are STALE — confirmed dead
 * in the Phase 0 spike. These were confirmed live 2026-09-07 from
 * hashgraph/asset-tokenization-studio's
 * packages/ats/contracts/deployments/hedera-testnet/ (latest file at the
 * time: newBlr-2026-06-12T11-19-42-198.json). Re-check that directory for
 * anything newer before relying on these long-term.
 */
export const FACTORY_ADDRESS = "0xd1F118A40f3b02883D35909eF2517e7EDd78379d";
export const RESOLVER_ADDRESS = "0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a";

const IMintABI = ["function mint(address _to, uint256 _amount) external"];
const ITransferABI = ["function transfer(address to, uint256 amount) external returns (bool)"];
const IControlListABI = [
  "function addToControlList(address _account) external returns (bool)",
  "function isInControlList(address _account) external view returns (bool)",
];
const ICoreABI = [
  "function decimals() external view returns (uint8)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
];
const IBalanceTrackerABI = ["function balanceOf(address _tokenHolder) external view returns (uint256)"];

export interface EquityParams {
  name: string;
  symbol: string;
  isin: string;
  decimals: number;
  maxSupply: bigint;
  currencyIso3: string; // e.g. "USD"
  /** Additional addresses (beyond the deployer) to grant ROLE_AGENT (mint) and ROLE_CONTROL_LIST (whitelist management). */
  extraAgents?: string[];
  extraControlListManagers?: string[];
}

/** Deploys an ATS Equity in whitelist mode. Returns the diamond (token) address. */
export async function deployEquity(admin: ethers.Wallet, params: EquityParams): Promise<string> {
  const factory = IFactory__factory.connect(FACTORY_ADDRESS, admin);

  const equity = await deployEquityFromFactory(
    {
      adminAccount: admin.address,
      factory,
      securityData: {
        arePartitionsProtected: false,
        isMultiPartition: false,
        resolver: RESOLVER_ADDRESS,
        isControllable: true,
        isWhiteList: true,
        maxSupply: params.maxSupply,
        erc20MetadataInfo: { name: params.name, symbol: params.symbol, isin: params.isin, decimals: params.decimals },
        clearingActive: false,
        internalKycActivated: false,
        externalPauses: [],
        externalControlLists: [],
        externalKycLists: [],
        erc20VotesActivated: false,
        compliance: ADDRESS_ZERO,
        identityRegistry: ADDRESS_ZERO,
        rbacs: [
          { role: ATS_ROLES.ROLE_AGENT, members: [admin.address, ...(params.extraAgents ?? [])] },
          { role: ATS_ROLES.ROLE_CONTROL_LIST, members: [admin.address, ...(params.extraControlListManagers ?? [])] },
        ],
      },
      equityDetails: {
        votingRight: false,
        informationRight: false,
        liquidationRight: false,
        subscriptionRight: false,
        conversionRight: false,
        redemptionRight: false,
        putRight: false,
        dividendRight: 0, // NONE
        currency: ethers.encodeBytes32String(params.currencyIso3).slice(0, 8), // bytes3
        nominalValue: 1,
        nominalValueDecimals: 2,
      },
    },
    {
      // RegulationType.NONE + RegulationSubType.NONE is explicitly
      // forbidden on-chain (RegulationTypeAndSubTypeForbidden) - see
      // docs/phase-0-findings.md Finding 3.
      regulationType: RegulationType.REG_S,
      regulationSubType: RegulationSubType.NONE,
      additionalSecurityData: { countriesControlListType: 0, listOfCountries: "", info: "" },
    }
  );

  return equity.getAddress();
}

/** Adds `account` to `diamondAddress`'s control list. Caller must hold ROLE_CONTROL_LIST. */
export async function whitelist(diamondAddress: string, signer: ethers.Wallet, account: string): Promise<void> {
  const controlList = new ethers.Contract(diamondAddress, IControlListABI, signer);
  const alreadyIn: boolean = await controlList.isInControlList(account);
  if (alreadyIn) return;
  const tx = await controlList.addToControlList(account, { gasLimit: 500_000 });
  await tx.wait();
}

/** Mints `amount` (base units, decimals already applied) to `to`. Caller must hold ROLE_AGENT. */
export async function mint(diamondAddress: string, signer: ethers.Wallet, to: string, amount: bigint): Promise<void> {
  const mintable = new ethers.Contract(diamondAddress, IMintABI, signer);
  const tx = await mintable.mint(to, amount, { gasLimit: 1_000_000 });
  await tx.wait();
}

export function tokenReader(diamondAddress: string, provider: ethers.Provider) {
  const core = new ethers.Contract(diamondAddress, ICoreABI, provider);
  const balanceTracker = new ethers.Contract(diamondAddress, IBalanceTrackerABI, provider);
  return {
    name: () => core.name(),
    symbol: () => core.symbol(),
    decimals: () => core.decimals(),
    balanceOf: (account: string) => balanceTracker.balanceOf(account),
  };
}

export function transferContract(diamondAddress: string, signer: ethers.Wallet) {
  return new ethers.Contract(diamondAddress, ITransferABI, signer);
}
