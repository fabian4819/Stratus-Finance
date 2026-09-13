import { useState, type ReactNode, type ComponentType } from "react";
import { formatEther, MaxUint256 } from "ethers";
import { motion } from "framer-motion";
import type { LucideProps } from "lucide-react";
import { assetLogo } from "../lib/assetLogos";

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

/** Real asset logo, with a deterministic colored initials chip as the
 * fallback (unmapped asset, or the logo URL fails to load). */
export function TokenBadge({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const logo = assetLogo(symbol);
  const initials = symbol.replace(/-x$/i, "").slice(0, 4);

  if (logo && !failed) {
    return (
      <img
        src={logo.url}
        alt={initials}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-contain ${
          logo.fitted ? "border border-slate-200 bg-white p-[3px]" : ""
        }`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight uppercase ${paletteFor(symbol)}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
    >
      {initials}
    </span>
  );
}

/** Icon-chip section header — a small tinted icon box next to an
 * uppercase eyebrow + title, with an optional trailing value on the
 * right (e.g. a running total). */
export function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  trailing,
}: {
  icon: ComponentType<LucideProps>;
  eyebrow: string;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="icon-chip">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <div className="text-sm font-semibold tracking-tight text-slate-900">{title}</div>
        </div>
      </div>
      {trailing && <div className="text-right">{trailing}</div>}
    </div>
  );
}

/** Small rounded-full secondary action, e.g. a per-row Withdraw/Claim
 * button — tactile press feedback via .pill-btn. */
export function Pill({
  children,
  onClick,
  disabled,
  icon: Icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ComponentType<LucideProps>;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="pill-btn">
      {Icon && <Icon className="h-3 w-3" aria-hidden />}
      {children}
    </button>
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

/** Gradient hero stat — the one headline number a page is really about
 * (e.g. Portfolio's collateral value), styled with more visual weight
 * than a plain white StatCard. `sub` is a row of small secondary
 * figures under the headline. */
export function HeroStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: { label: string; value: ReactNode }[];
}) {
  return (
    <div className="hero-card">
      <div className="hero-blur -right-10 -top-10 h-40 w-40" />
      <div className="hero-blur -bottom-12 left-10 h-28 w-28" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 px-6 py-7 sm:px-8 sm:py-9"
      >
        <div className="text-xs font-medium text-indigo-100">{label}</div>
        <div className="mt-1.5 text-4xl font-bold tabular-nums tracking-tight text-white sm:text-[42px]">{value}</div>
        {sub && sub.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-indigo-100/85">
            {sub.map((s) => (
              <span key={s.label}>
                {s.label} <span className="font-medium text-white">{s.value}</span>
              </span>
            ))}
          </div>
        )}
      </motion.div>
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
    <div className="card card-hover p-4">
      <div className="stat-label">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${toneCls}`}>{value}</div>
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
  return <span className={`font-semibold tabular-nums tracking-tight ${cls} ${size === "lg" ? "text-2xl" : ""}`}>{text}</span>;
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
