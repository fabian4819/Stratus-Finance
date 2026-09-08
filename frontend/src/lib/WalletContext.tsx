import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { connectMetaMask } from "./wallet";

interface WalletState {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

/** Shared wallet state so every screen reads the same connected account
 * instead of each re-deriving its own — connect once in the header, use
 * everywhere. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    setConnecting(true);
    try {
      const { provider, address } = await connectMetaMask();
      const signer = await provider.getSigner();
      setProvider(provider);
      setSigner(signer);
      setAddress(address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  return (
    <WalletContext.Provider value={{ provider, signer, address, connecting, error, connect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
