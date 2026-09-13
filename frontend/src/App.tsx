import { NavLink, Route, Routes } from "react-router-dom";
import { WalletProvider } from "./lib/WalletContext";
import { WalletConnectButton } from "./components/WalletConnectButton";
import { Buy } from "./pages/Buy";
import { Faucet } from "./pages/Faucet";
import { BorrowRepay } from "./pages/BorrowRepay";
import { RiskPanel } from "./pages/RiskPanel";
import { IndividualStocks } from "./pages/IndividualStocks";
import { Stake } from "./pages/Stake";

const NAV_ITEMS = [
  { to: "/faucet", label: "Faucet" },
  { to: "/buy", label: "Buy" },
  { to: "/borrow", label: "Borrow" },
  { to: "/stake", label: "Stake" },
  { to: "/risk", label: "Portfolio" },
  { to: "/stocks", label: "Markets" },
];

function Logo() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900">
      <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden="true">
        <rect width="28" height="28" rx="8" fill="#4f46e5" />
        <path d="M8 17.5a3 3 0 0 1-.4-5.98A4.2 4.2 0 0 1 16 10.8a2.8 2.8 0 0 1-.4 5.7H8Z" fill="#fff" />
      </svg>
      Stratus
    </span>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-7">
              <Logo />
              <nav className="hidden items-center gap-1 md:flex">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <WalletConnectButton />
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto border-t border-[var(--border)] px-3 py-1.5 md:hidden">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-500"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <Routes>
            <Route path="/" element={<Buy />} />
            <Route path="/faucet" element={<Faucet />} />
            <Route path="/buy" element={<Buy />} />
            <Route path="/borrow" element={<BorrowRepay />} />
            <Route path="/stake" element={<Stake />} />
            <Route path="/risk" element={<RiskPanel />} />
            <Route path="/stocks" element={<IndividualStocks />} />
          </Routes>
        </main>
      </div>
    </WalletProvider>
  );
}
