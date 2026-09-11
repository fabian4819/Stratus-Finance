import { BrowserProvider, JsonRpcProvider } from "ethers";

// Hedera testnet, EVM side — see PLAN.md §2 (Technology Stack: MetaMask via
// Hedera EVM compatibility). HashPack support is Phase 5 stretch scope.
export const HEDERA_TESTNET_CHAIN_ID = 296;
export const HEDERA_TESTNET_CHAIN_ID_HEX = "0x128"; // 296 in hex
export const HEDERA_TESTNET_RPC_URL = "https://testnet.hashio.io/api";

/** Read-only fallback so public data (prices, previews) is visible before
 * a wallet is ever connected — writes still require `connectMetaMask`. */
export const readProvider = new JsonRpcProvider(HEDERA_TESTNET_RPC_URL, HEDERA_TESTNET_CHAIN_ID, {
  staticNetwork: true,
});

export async function connectMetaMask(): Promise<{ provider: BrowserProvider; address: string }> {
  const ethereum = (window as unknown as { ethereum?: any }).ethereum;
  if (!ethereum) {
    throw new Error("MetaMask not detected. Install it or switch to a browser that has it.");
  }

  const provider = new BrowserProvider(ethereum);

  // eth_requestAccounts alone silently returns whatever account this site
  // was already authorized for last time — it does NOT re-prompt, even if
  // the user has since switched their active account in the MetaMask
  // extension. Requesting permissions first forces MetaMask's account
  // picker to show every time, so switching wallets actually takes effect.
  try {
    await provider.send("wallet_requestPermissions", [{ eth_accounts: {} }]);
  } catch {
    // Some non-MetaMask injected wallets don't support this RPC method —
    // fall back to the plain request below, just without the forced picker.
  }
  await provider.send("eth_requestAccounts", []);

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== HEDERA_TESTNET_CHAIN_ID) {
    await switchToHederaTestnet(ethereum);
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, address };
}

/** Restores a session on page load without ever prompting. Unlike
 * eth_requestAccounts, eth_accounts just returns whichever accounts this
 * site is already authorized for (or an empty array if none) — safe to
 * call on every mount. */
export async function getAuthorizedAccount(): Promise<{ provider: BrowserProvider; address: string } | null> {
  const ethereum = (window as unknown as { ethereum?: any }).ethereum;
  if (!ethereum) return null;
  const accounts: string[] = await ethereum.request({ method: "eth_accounts" }).catch(() => []);
  if (!accounts.length) return null;
  return { provider: new BrowserProvider(ethereum), address: accounts[0] };
}

async function switchToHederaTestnet(ethereum: any): Promise<void> {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HEDERA_TESTNET_CHAIN_ID_HEX }],
    });
  } catch (switchError: any) {
    // 4902 = chain not added to the wallet yet
    if (switchError?.code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HEDERA_TESTNET_CHAIN_ID_HEX,
            chainName: "Hedera Testnet",
            nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
            rpcUrls: ["https://testnet.hashio.io/api"],
            blockExplorerUrls: ["https://hashscan.io/testnet"],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}
