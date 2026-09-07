import { useState } from "react";
import { connectMetaMask } from "../lib/wallet";

export function WalletConnectButton({ onConnected }: { onConnected: (address: string) => void }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function handleClick() {
    setError(null);
    setConnecting(true);
    try {
      const { address } = await connectMetaMask();
      setAddress(address);
      onConnected(address);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={connecting}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : connecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
