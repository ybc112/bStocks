import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { POOL_ASSETS, assetOf } from "../data";
import type { MintMode } from "../data";
import { CoinIcon, CopyBtn, Icon, Reveal, SectionHead, useI18n, useToast } from "./ui";

type W = {
  name: string; sym: string; desc: string; x: string; tg: string;
  mode: MintMode; wlN: number; durH: number;
  mintRate: number; minMint: number; maxMint: number; walletCap: number;
  capBNB: number; poolPercent: number; lpTokenRatio: number; dev: string;
  buy: number; sell: number;
  burnOn: boolean; burnPct: number;
  mktOn: boolean; mktWallet: string; mktPct: number;
  holderOn: boolean; holderToken: string; holderMin: number; customCa: string;
  buybackOn: boolean; buybackPct: number;
  lpOn: boolean; lpToken: string; lpMin: number;
  bdOn: boolean;
};

const INIT: W = {
  name: "", sym: "", desc: "", x: "", tg: "",
  mode: "public", wlN: 500, durH: 48,
  mintRate: 100000, minMint: 0.001, maxMint: 0.1, walletCap: 0.5,
  capBNB: 10, poolPercent: 80, lpTokenRatio: 100, dev: "",
  buy: 5, sell: 5,
  burnOn: true, burnPct: 2,
  mktOn: true, mktWallet: "", mktPct: 1,
  holderOn: true, holderToken: "USDT", holderMin: 100000, customCa: "",
  buybackOn: true, buybackPct: 1,
  lpOn: false, lpToken: "BNB", lpMin: 1,
  bdOn: false,
};

const MODES: { m: MintMode; icon: string }[] = [
  { m: "public", icon: "users" }, { m: "wl", icon: "shield" }, { m: "time", icon: "clock" }, { m: "cap", icon: "target" },
];
const MODE_DESC: Record<MintMode, { zh: string; en: string }> = {
  public: { zh: "任何人可参与,先到先得", en: "Open to everyone, first come first served" },
  wl: { zh: "仅白名单地址可铸造", en: "Whitelisted addresses only" },
  time: { zh: "限定时间窗口内可铸造", en: "Only within a time window" },
  cap: { zh: "限制单钱包铸造上限", en: "Per-wallet cap enforced" },
};

function Lbl({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold text-fog">{children}</label>;
}

function Tgl({ on, set, icon, label, children }: { on: boolean; set: (v: boolean) => void; icon: string; label: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 transition ${on ? "border-gold/40 bg-gold/6" : "border-line bg-panel2/60"}`}>
      <button type="button" onClick={() => set(!on)} className="flex w-full items-center gap-3">
        <span className={`rounded-lg border p-1.5 ${on ? "border-gold/50 text-gold" : "border-line text-fog"}`}><Icon name={icon} size={15} /></span>
        <span className={`text-[13.5px] font-bold ${on ? "text-snow" : "text-fog"}`}>{label}</span>
        <span className={`toggle ml-auto ${on ? "on" : ""}`}><span className="knob block" /></span>
      </button>
      {on && children && <div className="fade-in mt-3.5 border-t border-line/70 pt-3.5">{children}</div>}
    </div>
  );
}

export default function CreateWizard() {
  const { lang, t } = useI18n();
  const toast = useToast();
  const [w, setW] = useState<W>(INIT);
  const [step, setStep] = useState(0);
  const [launched, setLaunched] = useState(false);
  const set = (patch: Partial<W>) => setW((v) => ({ ...v, ...patch }));

  const newCa = useMemo(() => {
    const hex = "0123456789abcdef";
    let s = "0x";
    for (let i = 0; i < 40; i++) s += hex[Math.floor(Math.random() * 16)];
    return s;
  }, [launched]);

  const optLabel = (o: string) =>
    o === "native" ? t("opt_native") : o === "pool" ? `${t("opt_pool")}(${w.pool})` : o === "custom" ? t("opt_custom") : o;

  const steps = [t("wz_s1"), t("wz_s2"), t("wz_s3"), t("wz_s4"), t("wz_s5")];
  const canNext = step !== 0 || (w.name.trim() && w.sym.trim());
  const poolAsset = assetOf(w.pool);

  const launch = () => {
    setLaunched(true);
    toast(`${t("wz_success")} ${w.sym.toUpperCase()}`);
  };

  const supplyDisplay = "10^30 (30 decimals)";

  if (launched) {
    return (
      <section id="create" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-mint/30 bg-panel p-10 text-center">
          <div className="confetti pointer-events-none absolute inset-x-0 top-0 h-0">
            {Array.from({ length: 16 }).map((_, i) => (
              <i key={i} style={{ left: `${6 + i * 6}%`, background: ["#f0b90b", "#2ee6a8", "#38e1ff", "#ff5c7a", "#ffd75e"][i % 5], animationDelay: `${(i % 8) * 0.09}s` }} />
            ))}
          </div>
          <svg width="92" height="92" viewBox="0 0 60 60" className="mx-auto">
            <circle cx="30" cy="30" r="25" fill="none" stroke="#2ee6a8" strokeWidth="3" className="ring-check" strokeLinecap="round" transform="rotate(-90 30 30)" />
            <path d="M20 31l7 7 13-15" fill="none" stroke="#2ee6a8" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="ring-check" />
          </svg>
          <h2 className="font-disp mt-5 text-3xl font-bold text-snow">{t("wz_success")}</h2>
          <p className="mt-2 text-sm text-fog">{t("wz_success_sub")}</p>
          <div className="mx-auto mt-6 flex max-w-md items-center justify-between gap-3 rounded-xl border border-line bg-abyss/60 px-4 py-3">
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-wider text-fog">{t("wz_ca_new")}</div>
              <CopyBtn text={newCa} shortText={`${newCa.slice(0, 10)}…${newCa.slice(-6)}`} />
            </div>
            <CoinIcon sym={w.sym || "NEW"} color="#f0b90b" size={44} />
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/board" className="btn-gold px-6 py-3 text-sm">{t("wz_view_board")}</Link>
            <button onClick={() => { setLaunched(false); setW(INIT); setStep(0); }} className="btn-ghost px-6 py-3 text-sm font-semibold">{t("wz_again")}</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="create" className="relative mx-auto max-w-5xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHead kicker="Launch Console" title={t("wz_title")} sub="平台管理员创建项目，配置 Mint 规则、交易税与官方机制" />

      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-line2 bg-panel/80 backdrop-blur">
          {/* step rail */}
          <div className="flex items-center gap-0 overflow-x-auto border-b border-line px-5 py-4 sm:px-8">
            {steps.map((s, i) => (
              <div key={s} className="flex flex-none items-center">
                <button onClick={() => i < step && setStep(i)} className={`flex items-center gap-2.5 ${i <= step ? "" : "opacity-45"}`}>
                  <span className={`font-mono2 flex h-7 w-7 flex-none items-center justify-center rounded-full border text-xs font-bold transition ${i < step ? "border-mint/60 bg-mint/15 text-mint" : i === step ? "border-gold bg-gold/15 text-gold2 shadow-[0_0_14px_-2px_rgba(240,185,11,.5)]" : "border-line2 text-fog"}`}>
                    {i < step ? <Icon name="check" size={12} /> : i + 1}
                  </span>
                  <span className={`hidden text-[12.5px] font-bold sm:block ${i === step ? "text-gold2" : "text-fog"}`}>{s}</span>
                </button>
                {i < steps.length - 1 && <span className={`mx-3 h-px w-6 sm:w-10 ${i < step ? "bg-mint/50" : "bg-line2"}`} />}
              </div>
            ))}
          </div>

          <div className="p-5 sm:p-8">
            {/* STEP 1: Basic Info */}
            {step === 0 && (
              <div className="fade-in space-y-5">
                <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
                  <div><Lbl>{t("wz_name")} *</Lbl><input className="field" value={w.name} onChange={(e) => set({ name: e.target.value })} placeholder={t("wz_name_ph")} /></div>
                  <div><Lbl>{t("wz_sym")} *</Lbl><input className="field font-mono2 uppercase" maxLength={8} value={w.sym} onChange={(e) => set({ sym: e.target.value.toUpperCase() })} placeholder={t("wz_sym_ph")} /></div>
                </div>
                <div><Lbl>{t("wz_desc")}</Lbl><textarea className="field min-h-[80px] resize-none" value={w.desc} onChange={(e) => set({ desc: e.target.value })} placeholder={t("wz_desc_ph")} /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Lbl>{t("wz_x")}</Lbl><input className="field font-mono2" value={w.x} onChange={(e) => set({ x: e.target.value })} placeholder="https://x.com/…" /></div>
                  <div><Lbl>{t("wz_tg")}</Lbl><input className="field font-mono2" value={w.tg} onChange={(e) => set({ tg: e.target.value })} placeholder="https://t.me/…" /></div>
                </div>
                <div className="rounded-xl border border-gold/15 bg-gold/5 p-3 text-xs text-fog">
                  <Icon name="info" size={12} className="mr-1 inline text-gold" />
                  代币精度 30 decimals，固定最大供应量 10^30 raw units。Mint 阶段按 mintRate 实时铸造，毕业即锁定。
                </div>
              </div>
            )}

            {/* STEP 2: Mint Config */}
            {step === 1 && (
              <div className="fade-in space-y-7">
                <div>
                  <Lbl>{t("wz_mode")} · {t("wz_mode_note")}</Lbl>
                  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                    {MODES.map(({ m, icon }) => (
                      <button key={m} onClick={() => set({ mode: m })}
                        className={`rounded-xl border p-3.5 text-left transition ${w.mode === m ? "border-gold bg-gold/10 shadow-[0_0_18px_-6px_rgba(240,185,11,.5)]" : "border-line bg-panel2 hover:border-line2"}`}>
                        <Icon name={icon} size={17} className={w.mode === m ? "text-gold" : "text-fog"} />
                        <div className={`mt-2 text-[13px] font-bold ${w.mode === m ? "text-gold2" : "text-snow"}`}>{t(`mode_${m}` as never)}</div>
                        <div className="mt-0.5 text-[10.5px] leading-snug text-fog">{MODE_DESC[m][lang]}</div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {w.mode === "wl" && <div><Lbl>{t("wz_wl_n")}</Lbl><input type="number" className="field font-mono2" value={w.wlN} onChange={(e) => set({ wlN: +e.target.value })} /></div>}
                    {w.mode === "time" && <div><Lbl>{t("wz_dur")}</Lbl><input type="number" className="field font-mono2" value={w.durH} onChange={(e) => set({ durH: +e.target.value })} /></div>}
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <div className="flex items-baseline justify-between"><Lbl>毕业目标 (capBNB)</Lbl><span className="font-mono2 text-sm font-bold text-gold2">{w.capBNB} BNB</span></div>
                    <input type="range" min={0.1} max={50} step={0.1} value={w.capBNB} onChange={(e) => set({ capBNB: +e.target.value })} className="w-full" />
                    <p className="mt-1 text-[11px] text-fog">达到此金额即毕业上 PancakeSwap，最低 0.1 BNB</p>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between"><Lbl>Mint 兑换率 (mintRate)</Lbl><span className="font-mono2 text-sm font-bold text-gold2">{w.mintRate.toLocaleString()}</span></div>
                    <input type="range" min={1000} max={10000000} step={1000} value={w.mintRate} onChange={(e) => set({ mintRate: +e.target.value })} className="w-full" />
                    <p className="mt-1 text-[11px] text-fog">1 BNB = {w.mintRate.toLocaleString()} raw units（30 decimals）</p>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  <div>
                    <Lbl>单笔最低 (minMint)</Lbl>
                    <div className="flex items-center gap-2"><input type="number" step={0.001} min={0.001} className="field font-mono2 flex-1" value={w.minMint} onChange={(e) => set({ minMint: +e.target.value })} /><span className="font-mono2 text-xs text-fog">BNB</span></div>
                  </div>
                  <div>
                    <Lbl>单笔最高 (maxMint)</Lbl>
                    <div className="flex items-center gap-2"><input type="number" step={0.01} className="field font-mono2 flex-1" value={w.maxMint} onChange={(e) => set({ maxMint: +e.target.value })} /><span className="font-mono2 text-xs text-fog">BNB</span></div>
                  </div>
                  <div>
                    <Lbl>每钱包累计上限 (walletCap)</Lbl>
                    <div className="flex items-center gap-2"><input type="number" step={0.1} className="field font-mono2 flex-1" value={w.walletCap} onChange={(e) => set({ walletCap: +e.target.value })} /><span className="font-mono2 text-xs text-fog">BNB</span></div>
                    <p className="mt-1 text-[10px] text-fog">0 = 不限制，非零值须 ≥ maxMint</p>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <div className="flex items-baseline justify-between"><Lbl>Mint → LP 比例 (poolPercent)</Lbl><span className="font-mono2 text-sm font-bold text-gold2">{w.poolPercent}%</span></div>
                    <input type="range" min={50} max={100} step={1} value={w.poolPercent} onChange={(e) => set({ poolPercent: +e.target.value })} className="w-full" />
                    <p className="mt-1 text-[11px] text-fog">剩余 {100 - w.poolPercent}% 归 Dev 钱包</p>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between"><Lbl>LP 代币倍率 (lpTokenRatio)</Lbl><span className="font-mono2 text-sm font-bold text-gold2">{w.lpTokenRatio}/1000</span></div>
                    <input type="range" min={1} max={1000} step={1} value={w.lpTokenRatio} onChange={(e) => set({ lpTokenRatio: +e.target.value })} className="w-full" />
                    <p className="mt-1 text-[11px] text-fog">LP 对中代币数量的 mintRate 比例</p>
                  </div>
                </div>

                <div><Lbl>{t("wz_dev")}</Lbl><input className="field font-mono2" value={w.dev} onChange={(e) => set({ dev: e.target.value })} placeholder={t("wz_dev_ph")} /></div>

                <div className="rounded-xl border border-gold/15 bg-gold/5 p-3 text-xs text-fog">
                  <Icon name="info" size={12} className="mr-1 inline text-gold" />
                  白名单地址通过平台后台批量设置，Mint 开启后不可修改 capBNB。
                </div>
              </div>
            )}

            {/* STEP 3: Tax */}
            {step === 2 && (
              <div className="fade-in space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  {[
                    { k: "buy" as const, label: t("wz_buy"), c: "#2ee6a8" },
                    { k: "sell" as const, label: t("wz_sell"), c: "#ff5c7a" },
                  ].map((x) => (
                    <div key={x.k}>
                      <div className="flex items-baseline justify-between"><Lbl>{x.label}</Lbl><span className="font-mono2 text-lg font-bold" style={{ color: x.c }}>{w[x.k]}%</span></div>
                      <input type="range" min={0} max={25} step={0.5} value={w[x.k]} onChange={(e) => set({ [x.k]: +e.target.value })} className="w-full" />
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-gold/25 bg-gold/6 p-4">
                  <div className="flex items-center gap-2 text-[13px] font-bold text-gold2"><Icon name="percent" size={15} />平台抽税 20%</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[{ l: t("wz_buy"), v: w.buy }, { l: t("wz_sell"), v: w.sell }].map((r) => (
                      <div key={r.l} className="rounded-lg border border-line bg-panel/70 px-4 py-3">
                        <div className="text-[11px] text-fog">{r.l} {r.v}%</div>
                        <div className="font-mono2 mt-1.5 space-y-0.5 text-[11.5px]">
                          <div className="flex justify-between"><span className="text-snow/80">项目方 80%</span><span className="font-bold text-mint">{(r.v * 0.8).toFixed(2)}%</span></div>
                          <div className="flex justify-between"><span className="text-snow/80">社区维护 15%</span><span className="font-bold text-gold2">{(r.v * 0.15).toFixed(2)}%</span></div>
                          <div className="flex justify-between"><span className="text-snow/80">推广返佣 5%</span><span className="font-bold text-rosey">{(r.v * 0.05).toFixed(2)}%</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-panel2/60 p-4">
                  <div className="text-sm font-bold text-snow mb-2">费用分配比例</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><Lbl>营销比例</Lbl><input type="range" min={0} max={800} step={10} value={300} className="w-full" /><span className="text-xs text-fog">当前 300/1000 = 30%</span></div>
                    <div><Lbl>回购比例</Lbl><input type="range" min={0} max={800} step={10} value={250} className="w-full" /><span className="text-xs text-fog">当前 250/1000 = 25%</span></div>
                    <div><Lbl>加池比例</Lbl><input type="range" min={0} max={800} step={10} value={250} className="w-full" /><span className="text-xs text-fog">当前 250/1000 = 25%</span></div>
                    <div><Lbl>持币分红比例</Lbl><input type="range" min={0} max={200} step={10} value={100} className="w-full" /><span className="text-xs text-fog">当前 100/1000 = 10%</span></div>
                  </div>
                  <p className="mt-2 text-[10px] text-fog">平台抽税 20% 后，剩余 80% 按以上比例分配</p>
                </div>
              </div>
            )}

            {/* STEP 4: Mechanics */}
            {step === 3 && (
              <div className="fade-in space-y-3">
                <p className="mb-4 text-[12.5px] text-fog"><Icon name="info" size={13} className="mr-1.5 inline text-gold" />{t("wz_mech_note")}</p>

                <Tgl on={w.burnOn} set={(v) => set({ burnOn: v })} icon="flame" label={`${t("mech_burn")} · ${t("wz_burn_pct")}`}>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={10} step={0.5} value={w.burnPct} onChange={(e) => set({ burnPct: +e.target.value })} className="flex-1" />
                    <span className="font-mono2 w-14 text-right text-sm font-bold text-gold2">{w.burnPct}%</span>
                  </div>
                </Tgl>

                <Tgl on={w.mktOn} set={(v) => set({ mktOn: v })} icon="gift" label={`${t("mech_mkt")} · ${t("wz_mkt_pct")}`}>
                  <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                    <input className="field font-mono2" value={w.mktWallet} onChange={(e) => set({ mktWallet: e.target.value })} placeholder={`${t("wz_mkt_wallet")} 0x…`} />
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={10} step={0.5} value={w.mktPct} onChange={(e) => set({ mktPct: +e.target.value })} className="flex-1" />
                      <span className="font-mono2 w-11 text-right text-sm font-bold text-gold2">{w.mktPct}%</span>
                    </div>
                  </div>
                </Tgl>

                <Tgl on={w.holderOn} set={(v) => set({ holderOn: v })} icon="coins" label={t("mech_holder")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Lbl>{t("wz_reward_token")}</Lbl>
                      <div className="flex flex-wrap gap-1.5">
                        {["BNB", "USDT", "native", "pool", "custom"].map((o) => (
                          <button key={o} onClick={() => set({ holderToken: o })}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${w.holderToken === o ? "border-gold bg-gold/12 text-gold2" : "border-line text-fog hover:border-gold/40"}`}>{optLabel(o)}</button>
                        ))}
                      </div>
                      {w.holderToken === "custom" && <input className="field mt-2 font-mono2" value={w.customCa} onChange={(e) => set({ customCa: e.target.value })} placeholder={t("wz_custom_ca")} />}
                    </div>
                    <div><Lbl>{t("wz_holder_min")} · {t("wz_holder_min_note")}</Lbl><input type="number" className="field font-mono2" value={w.holderMin} onChange={(e) => set({ holderMin: +e.target.value })} /></div>
                  </div>
                </Tgl>

                <Tgl on={w.buybackOn} set={(v) => set({ buybackOn: v })} icon="refresh" label={`${t("mech_buyback")} · ${t("wz_buyback_pct")}`}>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={10} step={0.5} value={w.buybackPct} onChange={(e) => set({ buybackPct: +e.target.value })} className="flex-1" />
                    <span className="font-mono2 w-14 text-right text-sm font-bold text-gold2">{w.buybackPct}%</span>
                  </div>
                </Tgl>

                <Tgl on={w.lpOn} set={(v) => set({ lpOn: v })} icon="drop" label={t("mech_lp")}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Lbl>{t("wz_reward_token")}</Lbl>
                      <div className="flex flex-wrap gap-1.5">
                        {["BNB", "USDT", "native", "pool", "custom"].map((o) => (
                          <button key={o} onClick={() => set({ lpToken: o })}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${w.lpToken === o ? "border-gold bg-gold/12 text-gold2" : "border-line text-fog hover:border-gold/40"}`}>{optLabel(o)}</button>
                        ))}
                      </div>
                    </div>
                    <div><Lbl>{t("wz_lp_min")} · {t("wz_lp_min_note")}</Lbl><input type="number" step={0.1} className="field font-mono2" value={w.lpMin} onChange={(e) => set({ lpMin: +e.target.value })} /></div>
                  </div>
                </Tgl>

                <Tgl on={w.bdOn} set={(v) => set({ bdOn: v })} icon="fire" label={t("mech_burndiv")}>
                  <p className="text-[12px] leading-relaxed text-fog">{t("wz_burndiv_note")}</p>
                </Tgl>
              </div>
            )}

            {/* STEP 5: Summary */}
            {step === 4 && (
              <div className="fade-in grid gap-6 lg:grid-cols-[1fr_280px]">
                <div>
                  <h3 className="font-disp mb-4 text-sm font-bold text-gold2">{t("wz_summary")}</h3>
                  <div className="grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
                    {[
                      [t("wz_name"), `${w.name} ($${w.sym})`],
                      ["供应量", supplyDisplay],
                      ["毕业目标", `${w.capBNB} BNB`],
                      ["Mint 兑换率", `1 BNB = ${w.mintRate.toLocaleString()}`],
                      ["单笔范围", `${w.minMint} - ${w.maxMint} BNB`],
                      ["每钱包上限", w.walletCap > 0 ? `${w.walletCap} BNB` : "不限制"],
                      ["Mint 模式", t(`mode_${w.mode}` as never) + (w.mode === "wl" ? ` · ${w.wlN}` : w.mode === "time" ? ` · ${w.durH}h` : "")],
                      ["底池资产", `${poolAsset.sym} · ${poolAsset.name}`],
                      ["Mint → LP 比例", `${w.poolPercent}%`],
                      [`${t("wz_buy")} / ${t("wz_sell")}`, `${w.buy}% / ${w.sell}%`],
                      [t("dt_mech_title"), [w.burnOn && `销毁${w.burnPct}%`, w.mktOn && `营销${w.mktPct}%`, w.holderOn && `分红·${optLabel(w.holderToken)}`, w.buybackOn && `回购${w.buybackPct}%`, w.lpOn && "加池分红", w.bdOn && "燃烧分红"].filter(Boolean).join(" · ") || "—"],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2">
                        <span className="flex-none text-fog">{k}</span>
                        <span className="text-right font-mono2 text-[12.5px] font-bold text-snow">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl border border-gold/25 bg-gold/6 px-4 py-3 text-[12px] leading-relaxed text-gold2/90">
                    <Icon name="percent" size={13} className="mr-1.5 inline" />平台抽取交易税点的 20%（15% 社区维护 + 5% 推广返佣），项目方获得剩余 80%。
                  </div>
                </div>
                <div className="h-fit rounded-2xl border border-line bg-panel2 p-5 text-center">
                  <CoinIcon sym={w.sym || "NEW"} color="#f0b90b" size={54} />
                  <div className="font-disp mt-3 text-lg font-bold text-snow">{w.name || "—"}</div>
                  <div className="text-[11px] text-fog">{t("wz_fee")}</div>
                  <div className="font-mono2 mt-1 text-2xl font-black text-mint">0 BNB · {t("wz_fee_free")}</div>
                  <button onClick={launch} className="btn-gold mt-5 flex w-full items-center justify-center gap-2 py-3.5 text-[15px]">
                    <Icon name="rocket" size={17} /> {t("wz_launch")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* footer nav */}
          <div className="flex items-center justify-between border-t border-line px-5 py-4 sm:px-8">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
              className="btn-ghost flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:pointer-events-none disabled:opacity-30">
              <Icon name="chevL" size={15} /> {t("wz_prev")}
            </button>
            <span className="font-mono2 text-[11px] text-fog">{step + 1} / 5</span>
            {step < 4 ? (
              <button onClick={() => canNext && setStep((s) => Math.min(4, s + 1))}
                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold transition ${canNext ? "btn-gold" : "cursor-not-allowed rounded-xl border border-line text-fog/40"}`}>
                {t("wz_next")} <Icon name="chevR" size={15} />
              </button>
            ) : <span className="w-[104px]" />}
          </div>
        </div>
      </Reveal>
    </section>
  );
}