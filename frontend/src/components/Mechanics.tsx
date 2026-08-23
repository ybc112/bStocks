import { Icon, Reveal, SectionHead, useI18n, useToast } from "./ui";

export default function Mechanics() {
  const { lang, t } = useI18n();
  const toast = useToast();

  const projMechs = [
    { icon: "flame", k: t("mech_burn"), d: lang === "zh" ? "交易自动销毁,制造通缩" : "Auto burn per trade, deflation built-in" },
    { icon: "gift", k: t("mech_mkt"), d: lang === "zh" ? "营销钱包可自定义地址" : "Custom marketing wallet address" },
    { icon: "coins", k: t("mech_holder"), d: lang === "zh" ? "分红代币与门槛自定义" : "Reward token & threshold customizable" },
    { icon: "drop", k: t("mech_lp"), d: lang === "zh" ? "LP 持有人专属分红池" : "Exclusive pool for LP holders" },
    { icon: "fire", k: t("mech_burndiv"), d: lang === "zh" ? "转黑洞地址参与分红" : "Send to black-hole to earn dividends" },
    { icon: "refresh", k: t("mech_buyback"), d: lang === "zh" ? "自动回购并销毁" : "Auto buyback & burn" },
  ];

  return (
    <section id="mech" className="relative scroll-mt-20 overflow-hidden py-20">
      <div className="pointer-events-none absolute left-[-8%] top-1/3 h-[400px] w-[400px] rounded-full bg-mint/6 blur-[110px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead kicker="Revenue Mechanics" title={t("mc_title")} sub={t("mc_sub")} />

        <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          {/* flow diagram */}
          <Reveal>
            <div className="h-full rounded-2xl border border-line2 bg-panel/80 p-6 sm:p-7">
              <div className="mx-auto w-fit rounded-xl border border-gold/50 bg-gold/10 px-5 py-2.5 text-center shadow-[0_0_24px_-8px_rgba(240,185,11,.6)]">
                <span className="font-disp text-sm font-bold text-gold2">{t("mc_trade_tax")}</span>
              </div>

              <svg className="mx-auto block" width="300" height="56" viewBox="0 0 300 56">
                <path d="M150 2v16M150 18H60v20M150 18h90v20" fill="none" stroke="#f0b90b" strokeWidth="2" className="dash-line" />
                <path d="m56 36 4 8 4-8M146 36l4 8 4-8M236 36l4 8 4-8" fill="none" stroke="#f0b90b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-mint/30 bg-mint/5 p-4">
                  <div className="font-disp text-sm font-bold text-mint">{t("mc_project")}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {projMechs.map((m) => (
                      <div key={m.k} className="group rounded-lg border border-line bg-panel px-3 py-2.5 transition hover:border-mint/40">
                        <div className="flex items-center gap-1.5 text-[12px] font-bold text-snow"><Icon name={m.icon} size={13} className="text-mint" />{m.k}</div>
                        <div className="mt-1 text-[10px] leading-snug text-fog">{m.d}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="rounded-xl border border-gold/30 bg-gold/5 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-disp text-sm font-bold text-gold2">{t("mc_platform")}</span>
                      <span className="font-mono2 text-xs font-bold text-gold">20%</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2.5">
                        <span className="flex items-center gap-2 text-[12px] font-bold text-snow"><Icon name="users" size={14} className="text-gold" />{t("mc_community")}</span>
                        <span className="font-mono2 text-xs font-bold text-gold2">15%</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2.5">
                        <span className="flex items-center gap-2 text-[12px] font-bold text-snow"><Icon name="gift" size={14} className="text-rosey" />{t("mc_promo")}</span>
                        <span className="font-mono2 text-xs font-bold text-rosey">5%</span>
                      </div>
                    </div>
                  </div>

                  <div className="relative flex-1 overflow-hidden rounded-xl border border-cy/30 bg-cy/5 p-4">
                    <div className="pointer-events-none absolute -right-6 -top-6 opacity-20"><Icon name="coins" size={90} className="text-cy" /></div>
                    <div className="font-disp text-sm font-bold text-cy">{t("mc_tokenized")}</div>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-fog">{t("mc_tokenized_desc")}</p>
                    <div className="font-mono2 mt-3 flex items-center gap-2">
                      <span className="rounded-lg border border-cy/40 bg-cy/10 px-2.5 py-1 text-xs font-black text-cy">10,000 BSTK</span>
                      <span className="text-[10.5px] text-fog">{t("mc_hold")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          {/* dividend pool board */}
          <Reveal delay={120}>
            <div className="flex h-full flex-col rounded-2xl border border-line2 bg-gradient-to-b from-panel to-abyss p-6 sm:p-7">
              <div className="flex items-center gap-2.5">
                <span className="rounded-xl border border-gold/40 bg-gold/10 p-2.5 text-gold"><Icon name="coins" size={19} /></span>
                <div>
                  <h3 className="font-disp text-[15px] font-bold text-snow">{t("mc_tokenized")}</h3>
                  <p className="text-[11px] text-fog">BSTK · BSC</p>
                </div>
                <span className="chip ml-auto !border-mint/40 !text-mint"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />LIVE</span>
              </div>

              <div className="mt-6 rounded-xl border border-line bg-panel/70 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11.5px] text-fog">{t("mc_pool")}</span>
                  <span className="font-mono2 text-[11px] text-fog">{t("mc_holders")} 1,892</span>
                </div>
                <div className="font-mono2 mt-1 text-3xl font-black text-gold2">$41,208<span className="text-base text-fog"> USDT</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-raise">
                  <div className="shimmer bar-grow h-full rounded-full bg-gradient-to-r from-gold/70 to-mint" style={{ width: "68%" }} />
                </div>
                <div className="font-mono2 mt-1.5 flex justify-between text-[10px] text-fog">
                  <span>{lang === "zh" ? "本期已注入 68%" : "Epoch funded 68%"}</span><span>≈ 3.2 BNB / 24H</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {[
                  { a: "0x8f3a…c5d6", v: "+128.4 USDT", hold: "2,500 BSTK" },
                  { a: "0x2b4c…4e5f", v: "+86.1 USDT", hold: "1,600 BSTK" },
                  { a: "0x7d6c…b5a4", v: "+54.9 USDT", hold: "10,000 BSTK" },
                ].map((r) => (
                  <div key={r.a} className="flex items-center justify-between rounded-lg border border-line bg-panel/60 px-3.5 py-2.5 text-[12px] transition hover:border-gold/30">
                    <span className="font-mono2 text-fog">{r.a}</span>
                    <span className="font-mono2 text-[10.5px] text-fog">{r.hold}</span>
                    <span className="font-mono2 font-bold text-mint">{r.v}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => toast(t("claim_ok"))} className="btn-gold mt-5 flex w-full items-center justify-center gap-2 py-3.5 text-sm">
                <Icon name="gift" size={16} /> {t("mc_hold")}
              </button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
