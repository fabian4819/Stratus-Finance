import { NavLink, Route, Routes } from "react-router-dom";
import { WalletProvider } from "./lib/WalletContext";
import { WalletConnectButton } from "./components/WalletConnectButton";
import { Buy } from "./pages/Buy";
import { MintBasket } from "./pages/MintBasket";
import { Deposit } from "./pages/Deposit";
import { BorrowRepay } from "./pages/BorrowRepay";
import { RiskPanel } from "./pages/RiskPanel";
import { IndividualStocks } from "./pages/IndividualStocks";

const NAV_ITEMS = [
  { to: "/buy", label: "Buy" },
  { to: "/mint", label: "Mint Basket" },
  { to: "/deposit", label: "Deposit" },
  { to: "/borrow", label: "Borrow / Repay" },
  { to: "/risk", label: "Risk Panel" },
  { to: "/stocks", label: "Individual Stocks" },
];

function CloudMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-sky-400" fill="currentColor" aria-hidden="true">
      <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1-.5 8.5H7Z" />
    </svg>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3.5">
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-white">
                <CloudMark />
                Stratus Finance
              </span>
              <nav className="flex gap-1 overflow-x-auto">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        isActive
                          ? "bg-white/10 font-medium text-white"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
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
        </header>

        <main className="mx-auto max-w-5xl px-4 py-10 md:px-6">
          <Routes>
            <Route path="/" element={<Buy />} />
            <Route path="/buy" element={<Buy />} />
            <Route path="/mint" element={<MintBasket />} />
            <Route path="/deposit" element={<Deposit />} />
            <Route path="/borrow" element={<BorrowRepay />} />
            <Route path="/risk" element={<RiskPanel />} />
            <Route path="/stocks" element={<IndividualStocks />} />
          </Routes>
        </main>
      </div>
    </WalletProvider>
  );
}
