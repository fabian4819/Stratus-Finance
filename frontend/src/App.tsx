import { NavLink, Route, Routes } from "react-router-dom";
import { WalletProvider } from "./lib/WalletContext";
import { WalletConnectButton } from "./components/WalletConnectButton";
import { MintBasket } from "./pages/MintBasket";
import { Deposit } from "./pages/Deposit";
import { BorrowRepay } from "./pages/BorrowRepay";
import { RiskPanel } from "./pages/RiskPanel";

const NAV_ITEMS = [
  { to: "/mint", label: "Mint Basket" },
  { to: "/deposit", label: "Deposit" },
  { to: "/borrow", label: "Borrow / Repay" },
  { to: "/risk", label: "Risk Panel" },
];

export default function App() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-white text-slate-900">
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-lg font-bold">Stratus Finance</span>
            <nav className="flex gap-4 text-sm">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "font-medium text-slate-900" : "text-slate-500 hover:text-slate-800"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <WalletConnectButton />
        </header>

        <main>
          <Routes>
            <Route path="/" element={<MintBasket />} />
            <Route path="/mint" element={<MintBasket />} />
            <Route path="/deposit" element={<Deposit />} />
            <Route path="/borrow" element={<BorrowRepay />} />
            <Route path="/risk" element={<RiskPanel />} />
          </Routes>
        </main>
      </div>
    </WalletProvider>
  );
}
