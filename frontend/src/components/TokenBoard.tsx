import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtBnb, fmtNum } from "../data";
import type { Cat, Token } from "../data";
import { Bar, CoinIcon, Icon, Reveal, SectionHead, Spark, useI18n } from "./ui";
import TokenDetail from "./TokenDetail";
import { Contract } from "ethers";
import { loadProjects, resolveFactoryAddress, FACTORY_ABI, avatarUrl } from "../contracts";
import { readOnlyProvider } from "../web3";

const TABS: { k: Cat; icon: string }[] = [
  { k: "new", icon: "sparkle" },
  { k: "grad", icon: "rocket" },
  { k: "listed", icon: "external" },
  { k: "hot", icon: "flame" },
];

const MODE_COLOR: Record<string, string> = { public: "#38e1ff", wl: "#9b6bff", time: "#f0b90b", cap: "#ff5c7a" };

export default function TokenBoard() {
  const { lang, t } = useI18n();
  const [tab, setTab] = useState<Cat>("hot");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [sel, setSel] = useState<Token | null>(null);
  const [loading, setLoading] = useState(true);
  const [noFactory, setNoFactory] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [refreshAt, setRefreshAt] = useState(0);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const factoryRef = useRef("");
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const fa = factoryRef.current || (await resolveFactoryAddress());
    factoryRef.current = fa;
    if (!fa) { setNoFactory(true); setLoading(false); return; }
    const r = await loadProjects(fa);
    setTokens(r.tokens);
    setLoadErr(r.error || "");
    setLoading(false);
    setRefreshAt(Date.now());
  }, []);

  /* initial load + 30s polling */
  useEffect(() => {
    void refresh();
    timerRef.current = window.setInterval(() => void refresh(), 30000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refresh]);

  /* live event listeners: ProjectLaunched / ProjectLaunched2 */
  useEffect(() => {
    let fac: Contract | null = null;
    let dead = false;
    void (async () => {
      const fa = factoryRef.current || (await resolveFactoryAddress());
      factoryRef.current = fa;
      if (!fa) return;
      fac = new Contract(fa, FACTORY_ABI, readOnlyProvider());
      const bump = () => { if (!dead) void refresh(); };
      fac.on("ProjectLaunched", bump);
      fac.on("ProjectLaunched2", bump);
    })();
    return () => {
      dead = true;
      if (fac) { fac.removeAllListeners("ProjectLaunched"); fac.removeAllListeners("ProjectLaunched2"); }
    };
  }, [refresh]);

  const list = useMemo(() => {
    const f = tokens.filter((x) => x.cat === tab);
    if (tab === "hot") return [...f].sort((a, b) => b.vol - a.vol);
    if (tab === "grad") return [...f].sort((a, b) => b.raised / b.goal - a.raised / a.goal);
    return f;
  }, [tokens, tab]);

  const counts = useMemo(() => {
    const m: Record<Cat, number> = { new: 0, grad: 0, listed: 0, hot: 0 };
    tokens.forEach((x) => m[x.cat]++);
    return m;
  }, [tokens]);

  const onMint = (id: number, amt: number) => {
    setTokens((ts) => ts.map((x) => (x.id === id ? { ...x, raised: Math.min(x.goal, x.raised + amt) } : x)));
    setSel((s) => (s && s.id === id ? { ...s, raised: Math.min(s.goal, s.raised + amt) } : s));
    window.setTimeout(() => void refresh(), 4000);
  };

  const volUnit = (tk: Token) => (tk.mcapSym ? ` ${tk.mcapSym}` : "");

  return (
    <section id="board" className="relative mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHead kicker="Token Board" title={t("board_title")} sub={t("board_sub")} />

      <div className="mb-4 flex items-center gap-2 font-mono2 text-[10.5px] text-fog/70">
        <span className={`pulse-dot h-1.5 w-1.5 rounded-full ${loadErr ? "bg-rosey" : loading ? "bg-gold" : "bg-mint"}`} />
        {loadErr ? `RPC error: ${loadErr.slice(0, 60)}` : noFactory ? t("board_no_factory") : `${t("board_chain")} · ${refreshAt ? new Date(refreshAt).toTimeString().slice(0, 8) : "…"}`}
        <button onClick={() => { setLoading(true); void refresh(); }} className="ml-1 rounded border border-line px-1.5 py-0.5 transition hover:border-gold/50 hover:text-gold2" title="refresh">
          <Icon name="refresh" size={10} className="inline" />
        </button>
      </div>

      <Reveal delay={80}>
        <div className="mb-8 flex flex-wrap items-center gap-2 border-b border-line pb-px">
          {TABS.map((tb) => {
            const on = tab === tb.k;
            return (
              <button key={tb.k} onClick={() => setTab(tb.k)}
                className={`tab-ink flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-bold transition sm:px-5 ${on ? "on text-gold2" : "text-fog hover:text-snow"}`}>
                <Icon name={tb.icon} size={15} className={on ? "text-gold" : ""} />
                {t(`tab_${tb.k}` as never)}
                <span className={`font-mono2 rounded-full px-1.5 py-0.5 text-[10px] ${on ? "bg-gold/15 text-gold2" : "bg-raise text-fog"}`}>{counts[tb.k]}</span>
              </button>
            );
          })}
          {tab === "hot" && (
            <span className="chip ml-auto hidden sm:inline-flex !border-gold/30 !text-gold2/80">
              <Icon name="flame" size={12} /> {t("tab_hot_sub")}
            </span>
          )}
        </div>
      </Reveal>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[300px] animate-pulse rounded-2xl border border-line bg-panel/50" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel/60 px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/8 text-gold"><Icon name="sparkle" size={24} /></span>
          <p className="mt-4 text-sm font-bold text-snow">{noFactory ? t("board_no_factory") : t("board_empty")}</p>
          <p className="mt-1.5 text-xs text-fog">{noFactory ? "VITE_FACTORY_ADDRESS / backend /api/config" : t("board_empty_sub")}</p>
        </div>
      ) : (
      <div key={tab} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((tk, i) => {
          const pct = (tk.raised / tk.goal) * 100;
          const listed = tk.cat === "listed";
          const avUrl = tk.avatar ? avatarUrl(tk.ca) : null;
          return (
            <Reveal key={tk.id} delay={i * 60}>
              <button onClick={() => setSel(tk)}
                className="card-lift group flex w-full flex-col rounded-2xl border border-line bg-panel/85 p-4 text-left">
                <div className="flex items-start gap-3">
                  {avUrl && !failedAvatars.has(tk.ca.toLowerCase()) ? (
                    <img src={avUrl} alt={tk.sym}
                      onError={() => setFailedAvatars((s) => new Set(s).add(tk.ca.toLowerCase()))}
                      className="flex-none rounded-full border-2 border-gold/40 object-cover shadow-[0_0_18px_-4px_rgba(240,185,11,.5)]"
                      style={{ width: 42, height: 42 }} />
                  ) : (
                    <CoinIcon sym={tk.sym} color={tk.color} size={42} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[15px] font-bold text-snow">{lang === "zh" ? tk.nameZh : tk.nameEn}</h3>
                      {tab === "hot" && (
                        <span className="flex items-center gap-0.5 font-mono2 text-[11px] font-bold text-gold2"><Icon name="flame" size={11} />#{i + 1}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono2 text-[11px] text-fog">
                      ${tk.sym}
                      <span className="rounded border border-line2 px-1 py-px text-[9.5px]" style={{ color: tk.color }}>{tk.pool}</span>
                    </div>
                    {(lang === "zh" ? tk.descZh : tk.descEn) && (
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-fog/80">{lang === "zh" ? tk.descZh : tk.descEn}</p>
                    )}
                  </div>
                  <span className="chip flex-none !px-2 !py-0.5 !text-[10px]" style={{ borderColor: `${MODE_COLOR[tk.mode]}55`, color: MODE_COLOR[tk.mode] }}>
                    {t(`mode_${tk.mode}` as never)}
                  </span>
                </div>

                <div className="mt-3 -mx-1 opacity-90 transition group-hover:opacity-100">
                  <Spark data={tk.spark.length ? tk.spark : [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]} color={tk.chg >= 0 ? "#2ee6a8" : "#ff5c7a"} w={252} h={40} />
                </div>

                <div className="mt-3.5">
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-fog">{t("card_goal")}</span>
                    <span className="font-mono2 font-bold text-gold2">{pct.toFixed(1)}%</span>
                  </div>
                  <Bar pct={pct} color={pct >= 100 ? "#2ee6a8" : "#f0b90b"} />
                  <div className="font-mono2 mt-1.5 flex justify-between text-[10.5px] text-fog">
                    <span>{fmtBnb(tk.raised)} / {fmtBnb(tk.goal)} BNB</span>
                    {tk.chg !== 0 && <span className={tk.chg > 0 ? "text-mint" : "text-rosey"}>{tk.chg > 0 ? "+" : ""}{tk.chg}%</span>}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  <div><div className="font-mono2 text-[12.5px] font-bold text-snow">{tk.mcap > 0 ? `${fmtNum(tk.mcap)}${volUnit(tk)}` : "—"}</div><div className="text-[10px] text-fog">{t("card_mcap")}</div></div>
                  <div><div className="font-mono2 text-[12.5px] font-bold text-snow">{fmtNum(tk.vol)}{volUnit(tk)}</div><div className="text-[10px] text-fog">{t("card_vol")}</div></div>
                  <div><div className="font-mono2 text-[12.5px] font-bold text-snow">{tk.holders > 0 ? fmtNum(tk.holders) : "—"}</div><div className="text-[10px] text-fog">{t("card_holders")}</div></div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  {listed ? (
                    <span className="chip !border-mint/40 !text-mint !text-[10px]"><Icon name="external" size={11} />{tk.listAt}</span>
                  ) : tk.deadlineH > 0 && tk.raised < tk.goal ? (
                    <span className="chip !border-cy/40 !text-cy !text-[10px]"><Icon name="clock" size={11} />{tk.deadlineH}h</span>
                  ) : (
                    <span className="chip !text-[10px]"><Icon name="shield" size={11} />{t("refund_badge")}</span>
                  )}
                  <span className="flex items-center gap-1 text-[11.5px] font-bold text-gold2 opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100">
                    {t("card_view")} <Icon name="arrowR" size={12} />
                  </span>
                </div>
              </button>
            </Reveal>
          );
        })}
      </div>
      )}

      {sel && <TokenDetail token={sel} onClose={() => setSel(null)} onMint={onMint} />}
    </section>
  );
}
