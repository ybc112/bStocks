import { LEADERBOARD } from "../data";
import { Icon, Reveal, SectionHead, useI18n, useToast } from "./ui";

const QR = [
  "1111111010011111111", "1000001011010000001", "1011101000110111001", "1011101101010111001",
  "1011101010110111001", "1000001011010000001", "1111111010101111111", "0000000011100000000",
  "1010111100101101011", "0110100110110100110", "1101011010011010101", "0000000010101001011",
  "1111111011010110100", "1000001001101011010", "1011101110100110101", "1011101010011010011",
  "1011101011101011101", "1000001001010100110", "1111111010101011010",
];

export default function Referral() {
  const { lang, t } = useI18n();
  const toast = useToast();
  const link = "https://bstocks.fi/?ref=0x8F3a91C2d4E6b7081A2c3D4e5F60718293A4b5c6";

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { /* noop */ }
    toast(t("copied"));
  };

  return (
    <section id="ref" className="relative scroll-mt-20 overflow-hidden py-20">
      <div className="pointer-events-none absolute right-[-10%] top-10 h-[380px] w-[380px] rounded-full bg-rosey/6 blur-[110px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead kicker="Referral Program" title={t("rf_title")} sub={t("rf_sub")} />

        <div className="grid gap-5 lg:grid-cols-[.92fr_1.08fr]">
          {/* invite card */}
          <Reveal>
            <div className="flex h-full flex-col rounded-2xl border border-line2 bg-panel/85 p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-fog">{t("rf_code")}</div>
                  <div className="font-disp mt-1 text-3xl font-black tracking-wide text-gold2">0x8F3a…b5c6</div>
                </div>
                <svg width="92" height="92" viewBox="0 0 19 19" className="flex-none rounded-lg border border-line2 bg-abyss p-1.5">
                  {QR.map((row, y) =>
                    row.split("").map((c, x) => c === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="0.92" height="0.92" fill="#e9eeff" /> : null)
                  )}
                </svg>
              </div>

              <div className="mt-5">
                <div className="mb-1.5 text-[11px] uppercase tracking-wider text-fog">{t("rf_link")}</div>
                <div className="flex items-center gap-2 rounded-xl border border-line2 bg-abyss/70 px-3.5 py-2.5">
                  <Icon name="link" size={14} className="flex-none text-cy" />
                  <span className="font-mono2 min-w-0 flex-1 truncate text-[12.5px] text-snow/85">{link}</span>
                  <button onClick={copy} className="btn-gold flex-none px-3.5 py-1.5 text-[11.5px]">{t("rf_copy")}</button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {[
                  { l: t("rf_team"), v: "128", c: "#e9eeff" },
                  { l: t("rf_earn"), v: "4.28 BNB", c: "#f0b90b" },
                  { l: `${t("rf_g1")} · 3%`, v: "36", c: "#2ee6a8" },
                  { l: `${t("rf_g2")} · 2%`, v: "92", c: "#38e1ff" },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl border border-line bg-panel2 px-4 py-3">
                    <div className="font-mono2 text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
                    <div className="mt-0.5 text-[10.5px] text-fog">{s.l}</div>
                  </div>
                ))}
              </div>

              <button onClick={() => toast(t("claim_ok"))} className="btn-gold mt-5 flex w-full items-center justify-center gap-2 py-3.5 text-sm">
                <Icon name="gift" size={16} /> {t("rf_claim")} · 4.28 BNB
              </button>
            </div>
          </Reveal>

          {/* tree + leaderboard */}
          <Reveal delay={120}>
            <div className="flex h-full flex-col gap-5">
              <div className="rounded-2xl border border-line2 bg-panel/85 p-6">
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-2 rounded-xl border border-gold/50 bg-gold/10 px-4 py-2">
                    <Icon name="users" size={15} className="text-gold" />
                    <span className="font-disp text-[13px] font-bold text-gold2">{t("rf_you")}</span>
                  </div>
                  <svg width="320" height="44" viewBox="0 0 320 44" className="max-w-full">
                    <path d="M160 2v12M160 14H80v22M160 14h80v22" fill="none" stroke="#2ee6a8" strokeWidth="1.8" className="dash-line" />
                  </svg>
                  <div className="flex w-full max-w-md justify-center gap-6">
                    {[0, 1].map((i) => (
                      <div key={i} className="flex flex-col items-center">
                        <div className="flex items-center gap-1.5 rounded-lg border border-mint/40 bg-mint/8 px-3.5 py-1.5">
                          <span className="font-mono2 text-xs font-bold text-mint">{t("rf_g1")} · 3%</span>
                        </div>
                        <svg width="120" height="30" viewBox="0 0 120 30">
                          <path d="M60 2v8M60 10H25v14M60 10h35v14" fill="none" stroke="#38e1ff" strokeOpacity=".6" strokeWidth="1.5" className="dash-line" />
                        </svg>
                        <div className="flex gap-2.5">
                          {[0, 1].map((j) => (
                            <span key={j} className="rounded-lg border border-cy/35 bg-cy/6 px-2.5 py-1 font-mono2 text-[10.5px] font-bold text-cy">{t("rf_g2")} · 2%</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-center text-[11.5px] text-fog"><Icon name="bolt" size={12} className="mr-1 inline text-gold" />{t("rf_flow")}</p>
                </div>
              </div>

              <div className="flex-1 rounded-2xl border border-line2 bg-panel/85 p-6">
                <div className="mb-3 flex items-center gap-2">
                  <Icon name="crown" size={16} className="text-gold" />
                  <h3 className="font-disp text-sm font-bold text-snow">{t("rf_board")}</h3>
                  <span className="chip ml-auto !text-[10px]">{lang === "zh" ? "本周" : "This week"}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="font-mono2 grid grid-cols-[32px_1fr_64px_84px] gap-2 px-3 text-[10px] uppercase tracking-wider text-fog">
                    <span>{t("rf_rank")}</span><span>{t("rf_addr")}</span><span className="text-right">{t("rf_members")}</span><span className="text-right">{t("rf_rebate")}</span>
                  </div>
                  {LEADERBOARD.map((r, i) => (
                    <div key={r.addr} className={`font-mono2 grid grid-cols-[32px_1fr_64px_84px] items-center gap-2 rounded-lg px-3 py-2 text-[12px] transition hover:bg-raise ${i === 0 ? "border border-gold/30 bg-gold/6" : "border border-transparent"}`}>
                      <span className={i === 0 ? "font-black text-gold2" : "font-bold text-fog"}>{i + 1}</span>
                      <span className="text-snow/85">{r.addr}</span>
                      <span className="text-right text-fog">{r.team}</span>
                      <span className="text-right font-bold text-mint">{r.rebate} BNB</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
