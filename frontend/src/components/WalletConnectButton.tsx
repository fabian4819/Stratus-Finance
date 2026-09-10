import { useWallet } from "../lib/WalletContext";

export function WalletConnectButton() {
  const { address, connecting, error, connect } = useWallet();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        disabled={connecting}
        className={
          address
            ? "rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 font-mono text-sm text-slate-100 backdrop-blur-xl hover:bg-white/[0.1] disabled:opacity-50"
            : "btn-primary disabled:opacity-50"
        }
      >
        {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : connecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  );
}
