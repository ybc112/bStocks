import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { Icon, Logo, Modal, useI18n, useToast } from "./ui";
import { short } from "../data";
import type { K } from "../i18n";
import { detectWallets, connectWallet, silentCheck, getBrowserProvider, ensureBscChain } from "../web3";
import type { DetectedWallet } from "../web3";
import type { JsonRpcSigner } from "ethers";

/* ---------------- wallet context (real window.ethereum) ---------------- */
type WalletVal = {
  addr: string | null;
  isBsc: boolean;
  connecting: string | null;
  connect: (w: DetectedWallet) => Promise<void>;
  disconnect: () => void;
  getSigner: () => Promise<JsonRpcSigner | null>;
  wallets: DetectedWallet[];
};
const WalletCtx = createContext<WalletVal>({
  addr: null, isBsc: false, connecting: null,
  connect: async () => {}, disconnect: () => {}, getSigner: async () => null, wallets: [],
});
export const useWallet = () => useContext(WalletCtx);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const toast = useToast();
  const [addr, setAddr] = useState<string | null>(null);
  const [isBsc, setIsBsc] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const activeRef = useRef<DetectedWallet | null>(null);

  useEffect(() => {
    const ws = detectWallets();
    setWallets(ws);
    if (!ws.length) return;
    const primary = ws.find((w) => w.id !== "okx") ?? ws[0];
    activeRef.current = primary;
    void (async () => {
      const a = await silentCheck(primary);
      if (a) {
        setAddr(a);
        setIsBsc(await ensureBscChain(primary.provider).catch(() => false));
      }
    })();
    const onAccounts = (...args: never[]) => {
      const accs = args[0] as string[] | undefined;
      setAddr(accs?.[0] ?? null);
    };
    const onChain = () => {
      void (async () => {
        if (!activeRef.current) return;
        setIsBsc(await ensureBscChain(activeRef.current.provider).catch(() => false));
      })();
    };
    for (const w of ws) {
      w.provider.on?.("accountsChanged", onAccounts as never);
      w.provider.on?.("chainChanged", onChain as never);
    }
    return () => {
      for (const w of ws) {
        w.provider.removeListener?.("accountsChanged", onAccounts as never);
        w.provider.removeListener?.("chainChanged", onChain as never);
      }
    };
  }, []);

  const connect = useCallback(
    async (w: DetectedWallet) => {
      setConnecting(w.name);
      try {
        const { addr: a, chainOk } = await connectWallet(w);
        activeRef.current = w;
        setAddr(a);
        setIsBsc(chainOk);
        toast(`${w.name} · ${t("connected")}`);
      } catch (e) {
        const msg = (e as Error).message || "connect failed";
        toast(`${w.name}: ${msg.includes("no account") ? t("need_wallet") : msg}`, "warn");
      } finally {
        setConnecting(null);
      }
    },
    [t, toast]
  );

  const disconnect = useCallback(() => setAddr(null), []);

  const getSigner = useCallback(async () => {
    const w = activeRef.current;
    if (!w) return null;
    const bp = getBrowserProvider(w);
    return bp.getSigner();
  }, []);

  return (
    <WalletCtx.Provider value={{ addr, isBsc, connecting, connect, disconnect, getSigner, wallets }}>
      {children}
    </WalletCtx.Provider>
  );
}

const NAV: { k: K; to: string }[] = [
  { k: "nav_board", to: "/board" },
  { k: "nav_create", to: "/launchpad" },
  { k: "nav_mech", to: "/mechanics" },
  { k: "nav_ref", to: "/referral" },
  { k: "nav_assets", to: "/assets" },
];

const WALLET_ICON: Record<string, { c: string; icon: string }> = {
  metamask: { c: "#F6851B", icon: "M12 3 4 7l1.5 11L12 21l6.5-3L20 7l-8-4z" },
  okx: { c: "#E9EEFF", icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  trust: { c: "#3375BB", icon: "M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4z" },
  bitget: { c: "#00F0FF", icon: "M5 12h4l3-7 4 14 3-7h2" },
  browser: { c: "#9b6bff", icon: "M4 6h16v12H4zM4 10h16" },
};

export default function Header() {
  const { lang, setLang, t } = useI18n();
  const { addr, isBsc, connect, disconnect, connecting, wallets } = useWallet();
  const location = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);

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
                { n: "x", href: "https://x.com/bStocksLauchpad", label: "Twitter X" },
                { n: "tg", href: "https://t.me/bStocksLauchpad", label: "Telegram" },
                { n: "debox", href: "https://debox.pro/bstocks", label: "Debox" },
              ].map((s) => (
                <a key={s.n} href={s.href} target="_blank" rel="noreferrer" title={s.label}
                  className="rounded-lg border border-transparent p-2 text-fog transition hover:border-line2 hover:bg-raise hover:text-cy">
                  <Icon name={s.n} size={16} />
                </a>
              ))}
            </div>

            {addr ? (
              <div className="flex items-center gap-2">
                {!isBsc && (
                  <span className="chip !border-rosey/50 !text-rosey !text-[10px] !px-2" title="Wrong network">
                    <Icon name="info" size={11} /> {lang === "zh" ? "非 BSC 链" : "Wrong chain"}
                  </span>
                )}
                <button onClick={disconnect} className="group flex items-center gap-2 rounded-xl border border-mint/40 bg-mint/10 px-3 py-2 font-mono2 text-xs font-semibold text-mint transition hover:border-rosey/50 hover:bg-rosey/10 hover:text-rosey">
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />
                  {short(addr)}
                  <span className="hidden text-[10px] opacity-0 transition group-hover:opacity-70 sm:inline">{t("disconnect")}</span>
                </button>
              </div>
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
                { n: "x", href: "https://x.com/bStocksLauchpad" },
                { n: "tg", href: "https://t.me/bStocksLauchpad" },
                { n: "debox", href: "https://m.debox.pro/group?id=eoawrnur&code=y3o8dduj" },
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
              {wallets.length > 0 ? (
                wallets.map((w) => (
                  <button key={w.id} onClick={() => void connect(w)} disabled={!!connecting}
                    className="group flex w-full items-center justify-between rounded-xl border border-line bg-panel2 px-4 py-3.5 transition hover:border-gold/50 hover:bg-raise disabled:opacity-60">
                    <span className="flex items-center gap-3">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={WALLET_ICON[w.id]?.c ?? "#f0b90b"} strokeWidth="1.7" strokeLinejoin="round"><path d={WALLET_ICON[w.id]?.icon ?? WALLET_ICON.browser.icon} /></svg>
                      <span className="text-sm font-semibold text-snow">{w.name}</span>
                    </span>
                    {connecting === w.name ? (
                      <span className="flex items-center gap-2 text-xs text-gold2">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                        BSC…
                      </span>
                    ) : (
                      <Icon name="chevR" size={15} className="text-fog transition group-hover:translate-x-0.5 group-hover:text-gold" />
                    )}
                  </button>
                ))
              ) : (
                <>
                  <p className="rounded-xl border border-gold/30 bg-gold/6 px-4 py-3 text-center text-[12.5px] text-gold2">{t("wallet_not_detected")}</p>
                  {[
                    { n: "MetaMask", href: "https://metamask.io/download/", c: "#F6851B", icon: WALLET_ICON.metamask.icon },
                    { n: "OKX Wallet", href: "https://www.okx.com/web3", c: "#E9EEFF", icon: WALLET_ICON.okx.icon },
                    { n: "Trust Wallet", href: "https://trustwallet.com/download", c: "#3375BB", icon: WALLET_ICON.trust.icon },
                  ].map((w) => (
                    <a key={w.n} href={w.href} target="_blank" rel="noreferrer"
                      className="group flex w-full items-center justify-between rounded-xl border border-line bg-panel2 px-4 py-3.5 transition hover:border-gold/50 hover:bg-raise">
                      <span className="flex items-center gap-3">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={w.c} strokeWidth="1.7" strokeLinejoin="round"><path d={w.icon} /></svg>
                        <span className="text-sm font-semibold text-snow">{w.n}</span>
                        <span className="text-[10.5px] text-fog">{t("wallet_install")}</span>
                      </span>
                      <Icon name="external" size={15} className="text-fog transition group-hover:text-gold" />
                    </a>
                  ))}
                </>
              )}
            </div>
            <p className="mt-5 text-center font-mono2 text-[11px] text-fog/70">BSC Mainnet · ChainID 56</p>
          </div>
        </Modal>
      )}
    </>
  );
}
