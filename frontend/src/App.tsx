import { BrowserRouter, Routes, Route } from "react-router-dom";
import { I18nProvider, ToastProvider } from "./components/ui";
import Header, { WalletProvider } from "./components/Header";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Board from "./pages/Board";
import Launchpad from "./pages/Launchpad";
import MechanicsPage from "./pages/MechanicsPage";
import ReferralPage from "./pages/ReferralPage";
import Assets from "./pages/Assets";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-ink text-snow">
      {/* ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="bg-grid absolute inset-0" />
        <div className="absolute left-1/2 top-[-320px] h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-gold/7 blur-[150px]" />
        <div className="absolute bottom-[-200px] right-[-120px] h-[500px] w-[500px] rounded-full bg-cy/5 blur-[130px]" />
      </div>
      <div className="noise" />

      <div className="relative z-10">
        <Header />
        {children}
        <Footer />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <WalletProvider>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/board" element={<Board />} />
                <Route path="/launchpad" element={<Launchpad />} />
                <Route path="/mechanics" element={<MechanicsPage />} />
                <Route path="/referral" element={<ReferralPage />} />
                <Route path="/assets" element={<Assets />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </WalletProvider>
      </ToastProvider>
    </I18nProvider>
  );
}