import type { ReactNode } from "react";
import { formatEther, MaxUint256 } from "ethers";

/** Shared presentational bits used across the pages — no chain logic, no state. */

const BADGE_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

function paletteFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BADGE_PALETTE[h % BADGE_PALETTE.length];
}

/** Deterministic colored initials chip — stands in for a token logo. */
export function TokenBadge({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const initials = symbol.replace(/-x$/i, "").slice(0, 4);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${paletteFor(symbol)}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
    >
      {initials}
    </span>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle max-w-2xl">{subtitle}</p>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "positive" | "negative";
  hint?: string;
}) {
  const toneCls =
    tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-rose-600" : "text-slate-900";
  return (
    <div className="card p-4">
      <div className="stat-label">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

/** Health-factor: colored number + word, the way every lending UI shows it. */
export function healthFactorParts(hf: bigint | undefined): { text: string; cls: string } {
  if (hf === undefined) return { text: "—", cls: "text-slate-400" };
  if (hf >= MaxUint256 / 2n) return { text: "∞", cls: "text-emerald-600" };
  const n = Number(formatEther(hf));
  const cls = n >= 1.5 ? "text-emerald-600" : n >= 1.05 ? "text-amber-600" : "text-rose-600";
  return { text: n.toFixed(2), cls };
}

export function HealthFactor({ hf, size = "md" }: { hf: bigint | undefined; size?: "md" | "lg" }) {
  const { text, cls } = healthFactorParts(hf);
  return <span className={`font-semibold tabular-nums ${cls} ${size === "lg" ? "text-2xl" : ""}`}>{text}</span>;
}

export function ConnectPrompt({ onConnect, label }: { onConnect: () => void; label: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-sm text-slate-500">{label}</p>
      <button onClick={onConnect} className="btn-primary">
        Connect wallet
      </button>
    </div>
  );
}

export function NotConfiguredNotice({ what = "Contract addresses" }: { what?: string }) {
  return (
    <div className="card mx-auto max-w-lg p-6 text-sm text-slate-500">
      {what} not configured — copy <code className="inline-code">deployments/hederaTestnet.json</code> values into{" "}
      <code className="inline-code">frontend/.env</code> (see <code className="inline-code">.env.example</code>).
    </div>
  );
}

export function StatusLine({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 break-all">{status}</div>
  );
}
