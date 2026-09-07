import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as path from "path";

dotenv.config();

/**
 * PLAN.md Phase 0 spike #4: mint one ATS token and transfer it between two
 * EOAs, to test the control-list compliance gate.
 *
 * Pivoted away from `@hashgraph/asset-tokenization-sdk` (see
 * docs/phase-0-findings.md - its `Network.connect` only supports browser
 * wallets / WalletConnect / custodial KMS providers, no raw private-key
 * mode for headless scripts) to calling the ATS diamond contracts directly
 * via the officially-shipped deploy helper and typechain types from
 * `@hashgraph/asset-tokenization-contracts` (installed as a transitive dep
 * of the SDK) - avoids hand-reconstructing the deeply nested struct ABI,
 * which is exactly the kind of thing worth getting from the source of
 * truth rather than retyping.
 *
 * Deep imports below use filesystem-relative paths rather than the package
 * name, because the package's "exports" map blocks subpath imports by
 * name - this is a workaround, not the intended public API surface.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CONTRACTS_PKG = path.join(__dirname, "..", "..", "node_modules", "@hashgraph", "asset-tokenization-contracts");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deployEquityFromFactory } = require(path.join(CONTRACTS_PKG, "build/scripts/domain/factory/deployEquityToken.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { IFactory__factory } = require(path.join(CONTRACTS_PKG, "build/typechain-types/index.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ATS_ROLES, RegulationType, RegulationSubType } = require(path.join(CONTRACTS_PKG, "build/scripts/domain/constants.js"));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ADDRESS_ZERO } = require(path.join(CONTRACTS_PKG, "build/scripts/infrastructure/constants.js"));

const FACTORY_ADDRESS = "0xd1F118A40f3b02883D35909eF2517e7EDd78379d"; // Hedera testnet, id 0.0.6797955
const RESOLVER_ADDRESS = "0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a"; // Hedera testnet, id 0.0.6797832

// Facet ABIs for the post-deploy operations - small and stable enough to
// hand-write (unlike the factory's deploy struct), taken from
// node_modules/@hashgraph/asset-tokenization-contracts/contracts/facets/*/I*.sol
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

async function main() {
  const rpcUrl = process.env.RPC_NODE_URL ?? "https://testnet.hashio.io/api";
  const privateKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  if (!privateKey) throw new Error("HEDERA_OPERATOR_PRIVATE_KEY not set in tokenization/.env");

  const provider = new ethers.JsonRpcProvider(rpcUrl, 296, { staticNetwork: true });
  const admin = new ethers.Wallet(privateKey, provider);
  const recipient = ethers.Wallet.createRandom(); // second EOA, never funded - transfer target only

  console.log("Admin (issuer) address:", admin.address);
  console.log("Recipient address:     ", recipient.address);
  console.log("Admin balance:", ethers.formatEther(await provider.getBalance(admin.address)), "HBAR\n");

  // --- Step 1: deploy an Equity via the Factory, using the SDK's own helper ---
  const factory = IFactory__factory.connect(FACTORY_ADDRESS, admin);

  console.log("Step 1: deploying Equity via Factory (deployEquityFromFactory helper)...");
  const equity = await deployEquityFromFactory(
    {
      adminAccount: admin.address,
      factory,
      securityData: {
        arePartitionsProtected: false,
        isMultiPartition: false,
        resolver: RESOLVER_ADDRESS,
        isControllable: true,
        isWhiteList: true, // whitelist mode: only listed accounts can hold/receive
        maxSupply: ethers.parseUnits("1000000", 18),
        erc20MetadataInfo: { name: "Stratus Spike Gold", symbol: "SPIKE-GOLD", isin: "US0378331005", decimals: 18 },
        clearingActive: false,
        internalKycActivated: false,
        externalPauses: [],
        externalControlLists: [],
        externalKycLists: [],
        erc20VotesActivated: false,
        compliance: ADDRESS_ZERO,
        identityRegistry: ADDRESS_ZERO,
        rbacs: [
          { role: ATS_ROLES.ROLE_AGENT, members: [admin.address] }, // needed to mint
          { role: ATS_ROLES.ROLE_CONTROL_LIST, members: [admin.address] }, // needed to whitelist accounts
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
        currency: ethers.encodeBytes32String("USD").slice(0, 8), // bytes3
        nominalValue: 1,
        nominalValueDecimals: 2,
      },
    },
    {
      regulationType: RegulationType.REG_S,
      regulationSubType: RegulationSubType.NONE,
      additionalSecurityData: { countriesControlListType: 0, listOfCountries: "", info: "" },
    }
  );

  const diamondAddress: string = await equity.getAddress();
  console.log("  Diamond (token) address:", diamondAddress, "\n");

  const core = new ethers.Contract(diamondAddress, ICoreABI, provider);
  console.log("Token name/symbol/decimals:", await core.name(), await core.symbol(), await core.decimals());

  // --- Step 1b: whitelist mode blocks even the admin from HOLDING tokens
  // until it is itself on the control list (confirmed via AccountIsBlocked
  // revert) - add it before minting.
  const controlListEarly = new ethers.Contract(diamondAddress, IControlListABI, admin);
  console.log("Step 1b: adding admin to its own control list (required to hold tokens in whitelist mode)...");
  const adminWhitelistTx = await controlListEarly.addToControlList(admin.address, { gasLimit: 500_000 });
  await adminWhitelistTx.wait();
  console.log("  tx:", adminWhitelistTx.hash);

  // --- Step 2: mint to the admin account ---
  const mintable = new ethers.Contract(diamondAddress, IMintABI, admin);
  console.log("\nStep 2: minting 1000 tokens to admin...");
  const mintTx = await mintable.mint(admin.address, ethers.parseUnits("1000", 18), { gasLimit: 1_000_000 });
  const mintReceipt = await mintTx.wait();
  console.log("  tx:", mintTx.hash, "gas used:", mintReceipt.gasUsed.toString());

  const balanceTracker = new ethers.Contract(diamondAddress, IBalanceTrackerABI, provider);
  console.log("  Admin balance:", ethers.formatUnits(await balanceTracker.balanceOf(admin.address), 18));

  // --- Step 3: attempt transfer to recipient BEFORE whitelisting - expect revert ---
  const transferable = new ethers.Contract(diamondAddress, ITransferABI, admin);
  console.log("\nStep 3: attempting transfer to un-whitelisted recipient (expect revert)...");
  try {
    const tx = await transferable.transfer(recipient.address, ethers.parseUnits("10", 18), { gasLimit: 500_000 });
    await tx.wait();
    console.log("  UNEXPECTED: transfer succeeded without whitelisting:", tx.hash);
  } catch (e: any) {
    console.log("  Reverted as expected:", e.shortMessage || e.reason || e.message);
  }

  // --- Step 4: add recipient to control list, retry transfer - expect success ---
  const controlList = new ethers.Contract(diamondAddress, IControlListABI, admin);
  console.log("\nStep 4: adding recipient to control list...");
  const addTx = await controlList.addToControlList(recipient.address, { gasLimit: 500_000 });
  const addReceipt = await addTx.wait();
  console.log("  tx:", addTx.hash, "gas used:", addReceipt.gasUsed.toString());
  console.log("  isInControlList(recipient):", await controlList.isInControlList(recipient.address));

  console.log("\nStep 4b: retrying transfer now that recipient is whitelisted...");
  const transferTx = await transferable.transfer(recipient.address, ethers.parseUnits("10", 18), {
    gasLimit: 500_000,
  });
  const transferReceipt = await transferTx.wait();
  console.log("  tx:", transferTx.hash, "gas used:", transferReceipt.gasUsed.toString());
  console.log("  Recipient balance:", ethers.formatUnits(await balanceTracker.balanceOf(recipient.address), 18));
  console.log("  Admin balance:    ", ethers.formatUnits(await balanceTracker.balanceOf(admin.address), 18));

  console.log("\n=== SPIKE #4 RESULT: SUCCESS ===");
  console.log(
    JSON.stringify(
      {
        diamondAddress,
        mintTx: mintTx.hash,
        addToControlListTx: addTx.hash,
        transferTx: transferTx.hash,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error("SPIKE FAILED:", e.shortMessage || e.reason || e.message);
  process.exitCode = 1;
});
