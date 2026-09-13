import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { WalletProvider } from "./lib/WalletContext";
import { WalletConnectButton } from "./components/WalletConnectButton";
import { Buy } from "./pages/Buy";
import { Faucet } from "./pages/Faucet";
import { MintBasket } from "./pages/MintBasket";
import { Deposit } from "./pages/Deposit";
import { BorrowRepay } from "./pages/BorrowRepay";
import { RiskPanel } from "./pages/RiskPanel";
import { IndividualStocks } from "./pages/IndividualStocks";

const NAV_ITEMS = [
  { to: "/faucet", label: "Faucet" },
  { to: "/buy", label: "Buy" },
  { to: "/mint", label: "Mint Basket" },
  { to: "/deposit", label: "Deposit" },
  { to: "/borrow", label: "Borrow" },
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

function isNavActive(pathname: string, to: string): boolean {
  return pathname === to || (to === "/buy" && pathname === "/");
}

function DesktopNav() {
  const { pathname } = useLocation();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(pathname, item.to);
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "text-indigo-700" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 rounded-lg bg-indigo-50"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
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
              <DesktopNav />
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
          <PageTransition>
            <Routes>
              <Route path="/" element={<Buy />} />
              <Route path="/faucet" element={<Faucet />} />
              <Route path="/buy" element={<Buy />} />
              <Route path="/mint" element={<MintBasket />} />
              <Route path="/deposit" element={<Deposit />} />
              <Route path="/borrow" element={<BorrowRepay />} />
              <Route path="/risk" element={<RiskPanel />} />
              <Route path="/stocks" element={<IndividualStocks />} />
            </Routes>
          </PageTransition>
        </main>
      </div>
    </WalletProvider>
  );
}
