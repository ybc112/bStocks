import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TOKENS, fmtNum, randAddr } from "../data";
import { CoinIcon, Icon, Reveal, useCountUp, useI18n } from "./ui";

type FeedItem = { id: number; time: string; addr: string; amt: number; sym: string; color: string; kind: "mint" | "grad" };

const TICKS = [
  { s: "BNB", p: "$612.4", c: 2.4 }, { s: "BTCB", p: "$97,810", c: 1.1 }, { s: "ETH", p: "$3,421", c: -0.8 },
  { s: "NVDAB", p: "$138.2", c: 4.7 }, { s: "TSLAB", p: "$248.9", c: -2.3 }, { s: "XAUT", p: "$2,671", c: 0.6 },
  { s: "SPYB", p: "$598.1", c: 0.9 }, { s: "QQQB", p: "$512.6", c: 1.6 }, { s: "GMEB", p: "$24.8", c: 8.8 },
  { s: "USD1", p: "$1.00", c: 0.0 }, { s: "USDT", p: "$1.00", c: 0.0 }, { s: "AAPLB", p: "$227.3", c: 0.4 },
];

let fid = 100;
const mkItem = (): FeedItem => {
  const tk = TOKENS[Math.floor(Math.random() * 10)];
  const isGrad = tk.cat === "grad" && Math.random() < 0.22;
  return {
    id: fid++,
    time: new Date().toTimeString().slice(0, 8),
    addr: randAddr(),
    amt: +(Math.random() * 4 + 0.15).toFixed(2),
    sym: tk.sym, color: tk.color,
    kind: isGrad ? "grad" : "mint",
  };
};

function Stat({ label, value, prefix = "", suffix = "" }: { label: string; value: number; prefix?: string; suffix?: string }) {
  const v = useCountUp(value);
  return (
    <div className="min-w-0">
      <div className="font-mono2 text-lg font-bold text-snow sm:text-xl">
        {prefix}{fmtNum(v)}{suffix}
      </div>
      <div className="mt-0.5 text-[11px] tracking-wide text-fog">{label}</div>
    </div>
  );
}

export default function Hero() {
  const { t, lang } = useI18n();
  const [feed, setFeed] = useState<FeedItem[]>(() => Array.from({ length: 6 }, mkItem));
  const timer = useRef<number | null>(null);

  useEffect(() => {
    timer.current = window.setInterval(() => setFeed((f) => [mkItem(), ...f].slice(0, 6)), 2600);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  return (
    <section id="top" className="relative overflow-hidden">
      {/* ambient */}
      <div className="pointer-events-none absolute -top-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-gold/10 blur-[130px]" />
      <div className="pointer-events-none absolute -right-32 top-24 h-[440px] w-[440px] rounded-full bg-cy/8 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/3 top-64 h-[300px] w-[300px] rounded-full bg-mint/6 blur-[100px]" />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-10 pt-14 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pt-16">
        <Reveal>
          <div>
            <span className="chip !border-gold/40 !bg-gold/8 !text-gold2">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-gold" />
              {t("hero_kicker")}
            </span>
            <h1 className="font-disp mt-6 text-[40px] font-black leading-[1.06] text-snow sm:text-6xl">
              <span className="text-gold2">{t("hero_t1")}</span>
              <br />
              {t("hero_t2")}
              <span className="text-gold">_</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-fog">{t("hero_sub")}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link to="/launchpad" className="btn-gold flex items-center gap-2.5 px-6 py-3.5 text-[15px]">
                <Icon name="rocket" size={18} /> {t("hero_cta1")}
              </Link>
              <Link to="/board" className="btn-ghost flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold">
                {t("hero_cta2")} <Icon name="arrowR" size={16} />
              </Link>
            </div>

            <div className="mt-11 grid max-w-xl grid-cols-2 gap-x-6 gap-y-7 border-t border-line pt-7 sm:grid-cols-4">
              <Stat label={t("stat_vol")} value={12.8} prefix="$" suffix="M" />
              <Stat label={t("stat_grad")} value={328} />
              <Stat label={t("stat_burn")} value={9.6} suffix="B" />
              <Stat label={t("stat_div")} value={41.2} prefix="$" suffix="K" />
            </div>
          </div>
        </Reveal>

        {/* live radar */}
        <Reveal dir="r" delay={120}>
          <div className="relative">
            <svg className="pointer-events-none absolute -right-10 -top-10 hidden opacity-50 lg:block" width="150" height="150" viewBox="0 0 150 150">
              <g className="spin-slow" style={{ transformOrigin: "75px 75px" }}>
                <circle cx="75" cy="75" r="62" fill="none" stroke="#f0b90b" strokeOpacity=".3" strokeDasharray="4 9" />
                <circle cx="75" cy="13" r="4" fill="#f0b90b" />
              </g>
            </svg>

            <div className="relative overflow-hidden rounded-2xl border border-line2 bg-panel/80 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="pulse-dot h-2 w-2 rounded-full bg-rosey" />
                  <h3 className="font-disp text-[15px] font-bold text-snow">{t("radar_title")}</h3>
                </div>
                <span className="chip !border-rosey/40 !text-rosey"><span className="tick-pulse">●</span> {t("radar_live")}</span>
              </div>

              <div className="space-y-1 px-3 py-3">
                {feed.map((f) => (
                  <div key={f.id} className="feed-in flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-raise/70">
                    <span className="font-mono2 w-[62px] flex-none text-[10.5px] text-fog/70">{f.time}</span>
                    <span className="font-mono2 w-[74px] flex-none text-xs text-snow/80">{f.addr}</span>
                    <span className={`text-xs ${f.kind === "grad" ? "font-bold text-mint" : "text-fog"}`}>
                      {f.kind === "grad" ? t("radar_grad") : t("radar_minted")}
                    </span>
                    {f.kind === "mint" && <span className="font-mono2 text-xs font-bold text-gold2">{f.amt} BNB</span>}
                    <span className="ml-auto flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold" style={{ borderColor: `${f.color}55`, color: f.color }}>
                      <CoinIcon sym={f.sym} color={f.color} size={15} />{f.sym}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
                <span className="chip !border-mint/40 !text-mint"><Icon name="shield" size={12} /> {t("radar_note1")}</span>
                <span className="chip !border-cy/40 !text-cy"><Icon name="clock" size={12} /> {t("radar_note2")}</span>
              </div>
            </div>

            <div className="floaty absolute -left-5 -bottom-6 hidden items-center gap-2 rounded-xl border border-line2 bg-panel2 px-3.5 py-2.5 shadow-xl sm:flex">
              <Icon name="flame" size={16} className="text-gold" />
              <span className="text-xs font-semibold text-snow">{lang === "zh" ? "NVDR 毕业进度 95.3%" : "NVDR graduation 95.3%"}</span>
            </div>
          </div>
        </Reveal>
      </div>

      {/* ticker tape */}
      <div className="relative border-y border-line/70 bg-panel/40 py-2.5 backdrop-blur">
        <div className="flex overflow-hidden">
          <div className="marq flex flex-none items-center gap-8 pr-8">
            {[...TICKS, ...TICKS].map((tk, i) => (
              <span key={i} className="font-mono2 flex flex-none items-center gap-2 text-xs">
                <span className="font-bold text-snow/90">{tk.s}</span>
                <span className="text-fog">{tk.p}</span>
                <span className={tk.c >= 0 ? "text-mint" : "text-rosey"}>{tk.c >= 0 ? "+" : ""}{tk.c}%</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
