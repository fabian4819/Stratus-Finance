import { useWallet } from "../lib/WalletContext";

export function WalletConnectButton() {
  const { address, connecting, error, connect } = useWallet();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        disabled={connecting}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : connecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
