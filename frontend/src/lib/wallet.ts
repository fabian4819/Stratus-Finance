import { BrowserProvider } from "ethers";

// Hedera testnet, EVM side — see PLAN.md §2 (Technology Stack: MetaMask via
// Hedera EVM compatibility). HashPack support is Phase 5 stretch scope.
export const HEDERA_TESTNET_CHAIN_ID = 296;
export const HEDERA_TESTNET_CHAIN_ID_HEX = "0x128"; // 296 in hex

export async function connectMetaMask(): Promise<{ provider: BrowserProvider; address: string }> {
  const ethereum = (window as unknown as { ethereum?: any }).ethereum;
  if (!ethereum) {
    throw new Error("MetaMask not detected. Install it or switch to a browser that has it.");
  }

  const provider = new BrowserProvider(ethereum);
  await provider.send("eth_requestAccounts", []);

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== HEDERA_TESTNET_CHAIN_ID) {
    await switchToHederaTestnet(ethereum);
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, address };
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
