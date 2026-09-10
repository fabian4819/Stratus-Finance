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
            ? "inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            : "btn-primary disabled:opacity-50"
        }
      >
        {address && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
        <span className={address ? "font-mono" : ""}>
          {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : connecting ? "Connecting…" : "Connect Wallet"}
        </span>
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}
