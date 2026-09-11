import { useState } from "react";
import { useWallet } from "../lib/WalletContext";

export function WalletConnectButton() {
  const { address, connecting, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  if (!address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button onClick={connect} disabled={connecting} className="btn-primary disabled:opacity-50">
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3.5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-mono">{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>
        <svg viewBox="0 0 12 8" className={`h-2.5 w-2.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" aria-hidden="true">
          <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <>
          {/* Click-outside backdrop — simplest way to close without a ref/effect. */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg">
            <div className="border-b border-[var(--border)] px-3.5 py-2.5 font-mono text-xs text-slate-500">
              {address}
            </div>
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
