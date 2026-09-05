import { Link } from "react-router-dom";
import { fmtNum } from "../data";
import { Icon, Reveal, useCountUp, useI18n } from "./ui";

const TICKS = [
  { s: "BNB", p: "$612.4", c: 2.4 }, { s: "BTCB", p: "$97,810", c: 1.1 }, { s: "ETH", p: "$3,421", c: -0.8 },
  { s: "NVDAB", p: "$138.2", c: 4.7 }, { s: "TSLAB", p: "$248.9", c: -2.3 }, { s: "XAUT", p: "$2,671", c: 0.6 },
  { s: "SPYB", p: "$598.1", c: 0.9 }, { s: "QQQB", p: "$512.6", c: 1.6 }, { s: "GMEB", p: "$24.8", c: 8.8 },
  { s: "USD1", p: "$1.00", c: 0.0 }, { s: "USDT", p: "$1.00", c: 0.0 }, { s: "AAPLB", p: "$227.3", c: 0.4 },
];

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
  const { t } = useI18n();

  return (
    <section id="top" className="relative overflow-hidden">
      {/* ambient */}
      <div className="pointer-events-none absolute -top-40 left-[-10%] h-[520px] w-[520px] rounded-full bg-gold/10 blur-[130px]" />
      <div className="pointer-events-none absolute -right-32 top-24 h-[440px] w-[440px] rounded-full bg-cy/8 blur-[120px]" />
      <div className="pointer-events-none absolute left-1/3 top-64 h-[300px] w-[300px] rounded-full bg-mint/6 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-14 sm:px-6">
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