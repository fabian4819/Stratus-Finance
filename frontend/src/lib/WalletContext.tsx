import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { connectMetaMask, getAuthorizedAccount } from "./wallet";

interface WalletState {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
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

  // MetaMask has no reliable programmatic "revoke this site" call — the
  // conventional dApp pattern (Uniswap, Aave, ...) is to just clear local
  // session state. The wallet extension itself stays connected; the next
  // "Connect Wallet" click re-requests accounts.
  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setError(null);
  }, []);

  // Reconnect silently on page load — a reload used to always drop back to
  // the "Connect Wallet" button even though MetaMask still had this site
  // authorized. eth_accounts never prompts, so this is safe to run on
  // every mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await getAuthorizedAccount();
      if (!restored || cancelled) return;
      const signer = await restored.provider.getSigner();
      if (cancelled) return;
      setProvider(restored.provider);
      setSigner(signer);
      setAddress(restored.address);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the app in sync when the account is changed or unlinked from
  // inside the MetaMask extension itself, instead of showing a stale
  // address until the next manual reconnect.
  useEffect(() => {
    const ethereum = (window as unknown as { ethereum?: any }).ethereum;
    if (!ethereum?.on) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (!accounts.length) {
        disconnect();
        return;
      }
      const nextProvider = new BrowserProvider(ethereum);
      const signer = await nextProvider.getSigner();
      setProvider(nextProvider);
      setSigner(signer);
      setAddress(accounts[0]);
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    return () => ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
  }, [disconnect]);

  return (
    <WalletContext.Provider value={{ provider, signer, address, connecting, error, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
