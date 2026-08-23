import { createContext, useContext, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Icon, Logo, Modal, useI18n, useToast } from "./ui";
import { short } from "../data";
import type { K } from "../i18n";

/* ---------------- wallet context ---------------- */
type WalletVal = { addr: string | null; setAddr: (a: string | null) => void };
const WalletCtx = createContext<WalletVal>({ addr: null, setAddr: () => {} });
export const useWallet = () => useContext(WalletCtx);
export function WalletProvider({ children }: { children: ReactNode }) {
  const [addr, setAddr] = useState<string | null>(null);
  return <WalletCtx.Provider value={{ addr, setAddr }}>{children}</WalletCtx.Provider>;
}

const NAV: { k: K; to: string }[] = [
  { k: "nav_board", to: "/board" },
  { k: "nav_create", to: "/launchpad" },
  { k: "nav_mech", to: "/mechanics" },
  { k: "nav_ref", to: "/referral" },
  { k: "nav_assets", to: "/assets" },
];

export default function Header() {
  const { lang, setLang, t } = useI18n();
  const { addr, setAddr } = useWallet();
  const location = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  const pick = (name: string) => {
    setConnecting(name);
    setTimeout(() => {
      setAddr("0x8F3a91C2d4E6b7081A2c3D4e5F60718293A4b5c6");
      setConnecting(null);
      setOpen(false);
      toast(`${name} · ${t("connected")}`);
    }, 900);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <header className="sticky top-0 z-[90] border-b border-line/80 bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="transition-transform duration-300 hover:rotate-[18deg]"><Logo /></span>
            <span className="leading-none">
              <span className="font-disp block text-[17px] font-bold tracking-tight text-snow">bStocks</span>
              <span className="font-mono2 block text-[9px] tracking-[.4em] text-gold">LAUNCHPAD</span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-lg px-3.5 py-2 text-[13.5px] font-medium transition ${
                  isActive(n.to) ? "bg-gold/10 text-gold2" : "text-fog hover:bg-raise hover:text-gold2"
                }`}
              >
                {t(n.k)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="flex items-center gap-1.5 rounded-full border border-line2 bg-panel px-3 py-1.5 text-xs font-bold text-gold2 transition hover:border-gold/60 hover:shadow-[0_0_16px_-4px_rgba(240,185,11,.5)]"
              title="Language"
            >
              <Icon name="globe" size={13} />
              {t("lang_label")}
            </button>

            <div className="hidden items-center gap-1 md:flex">
              {[
                { n: "x", href: "https://x.com/bstocks_pad", label: "Twitter X" },
                { n: "tg", href: "https://t.me/bstocks_pad", label: "Telegram" },
                { n: "debox", href: "https://debox.pro/bstocks", label: "Debox" },
              ].map((s) => (
                <a key={s.n} href={s.href} target="_blank" rel="noreferrer" title={s.label}
                  className="rounded-lg border border-transparent p-2 text-fog transition hover:border-line2 hover:bg-raise hover:text-cy">
                  <Icon name={s.n} size={16} />
                </a>
              ))}
            </div>

            {addr ? (
              <button onClick={() => setAddr(null)} className="group flex items-center gap-2 rounded-xl border border-mint/40 bg-mint/10 px-3 py-2 font-mono2 text-xs font-semibold text-mint transition hover:border-rosey/50 hover:bg-rosey/10 hover:text-rosey">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />
                {short(addr)}
                <span className="hidden text-[10px] opacity-0 transition group-hover:opacity-70 sm:inline">{t("disconnect")}</span>
              </button>
            ) : (
              <button onClick={() => setOpen(true)} className="btn-gold flex items-center gap-2 px-4 py-2 text-[13px]">
                <Icon name="wallet" size={15} />
                {t("connect")}
              </button>
            )}

            <button onClick={() => setMenu(!menu)} className="rounded-lg border border-line p-2 text-fog lg:hidden" aria-label="menu">
              <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d={menu ? "M18 6 6 18M6 6l12 12" : "M4 7h16M4 12h16M4 17h10"} /></svg>
            </button>
          </div>
        </div>

        {menu && (
          <nav className="fade-in border-t border-line bg-panel px-4 py-3 lg:hidden">
            <Link to="/" onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-fog transition hover:bg-raise hover:text-gold2">
              首页
            </Link>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMenu(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-fog transition hover:bg-raise hover:text-gold2">
                {t(n.k)}
              </Link>
            ))}
            <div className="mt-2 flex gap-2 border-t border-line pt-3">
              {[
                { n: "x", href: "https://x.com/bstocks_pad" },
                { n: "tg", href: "https://t.me/bstocks_pad" },
                { n: "debox", href: "https://debox.pro/bstocks" },
              ].map((s) => (
                <a key={s.n} href={s.href} target="_blank" rel="noreferrer" className="rounded-lg border border-line p-2 text-fog">
                  <Icon name={s.n} size={15} />
                </a>
              ))}
            </div>
          </nav>
        )}
      </header>

      {open && (
        <Modal onClose={() => setOpen(false)} w="max-w-md">
          <div className="p-7">
            <div className="flex items-center gap-3">
              <span className="rounded-xl border border-gold/40 bg-gold/10 p-2.5 text-gold"><Icon name="wallet" size={20} /></span>
              <div>
                <h3 className="font-disp text-lg font-bold text-snow">{t("wallet_title")}</h3>
                <p className="text-xs text-fog">{t("wallet_sub")}</p>
              </div>
            </div>
            <div className="mt-6 space-y-2.5">
              {[
                { n: "MetaMask", c: "#F6851B", icon: "M12 3 4 7l1.5 11L12 21l6.5-3L20 7l-8-4z" },
                { n: "WalletConnect", c: "#3B99FC", icon: "M5 10c4-4 10-4 14 0M8 13c2.3-2.3 5.7-2.3 8 0m-6.5 3c1.4-1.4 3.6-1.4 5 0M12 19l.01-.01" },
                { n: "OKX Wallet", c: "#E9EEFF", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
              ].map((w) => (
                <button key={w.n} onClick={() => pick(w.n)} disabled={!!connecting}
                  className="group flex w-full items-center justify-between rounded-xl border border-line bg-panel2 px-4 py-3.5 transition hover:border-gold/50 hover:bg-raise disabled:opacity-60">
                  <span className="flex items-center gap-3">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={w.c} strokeWidth="1.7" strokeLinejoin="round"><path d={w.icon} /></svg>
                    <span className="text-sm font-semibold text-snow">{w.n}</span>
                  </span>
                  {connecting === w.n ? (
                    <span className="flex items-center gap-2 text-xs text-gold2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                      BSC…
                    </span>
                  ) : (
                    <Icon name="chevR" size={15} className="text-fog transition group-hover:translate-x-0.5 group-hover:text-gold" />
                  )}
                </button>
              ))}
            </div>
            <p className="mt-5 text-center font-mono2 text-[11px] text-fog/70">BSC Mainnet · ChainID 56</p>
          </div>
        </Modal>
      )}
    </>
  );
}