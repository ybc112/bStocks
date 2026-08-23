import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ADS } from "../data";
import { Icon, useI18n } from "./ui";

const adRoute = (to: string) => {
  const map: Record<string, string> = { "#board": "/board", "#create": "/launchpad", "#mech": "/mechanics", "#ref": "/referral" };
  return map[to] || "/";
};

function Art({ kind }: { kind: string }) {
  if (kind === "orbit")
    return (
      <svg width="230" height="190" viewBox="0 0 230 190" className="spin-slow">
        <circle cx="115" cy="95" r="78" fill="none" stroke="#f0b90b" strokeOpacity=".35" strokeDasharray="4 8" />
        <circle cx="115" cy="95" r="50" fill="none" stroke="#ffd75e" strokeOpacity=".5" strokeDasharray="3 7" />
        <circle cx="115" cy="17" r="7" fill="#f0b90b" />
        <circle cx="165" cy="95" r="5" fill="#ffd75e" />
        <circle cx="80" cy="145" r="4" fill="#38e1ff" />
        <g transform="translate(115,95)">
          <path d="M-14 14c-8 7-10 22-10 22s15-2 22-10c4-4.6 4-11.6-.5-16s-11-1.6-11.5 4z" fill="none" stroke="#ffd75e" strokeWidth="2" />
          <path d="m10-22-16 16 22 4z" fill="#f0b90b" />
        </g>
      </svg>
    );
  if (kind === "pool")
    return (
      <svg width="220" height="190" viewBox="0 0 220 190">
        <g className="floaty">
          <ellipse cx="110" cy="140" rx="70" ry="16" fill="#2ee6a8" opacity=".12" />
          <ellipse cx="110" cy="128" rx="56" ry="13" fill="#2ee6a8" opacity=".2" />
          <ellipse cx="110" cy="116" rx="42" ry="10" fill="#2ee6a8" opacity=".35" />
          <circle cx="110" cy="72" r="34" fill="none" stroke="#2ee6a8" strokeWidth="2.5" />
          <path d="M96 72h28M110 58v28" stroke="#2ee6a8" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="156" cy="52" r="5" fill="#f0b90b" />
          <circle cx="64" cy="48" r="4" fill="#38e1ff" />
          <circle cx="160" cy="96" r="3" fill="#ffd75e" />
        </g>
      </svg>
    );
  if (kind === "zeros")
    return (
      <div className="select-none text-right">
        <div className="font-disp text-6xl font-black leading-none text-cy/90">30</div>
        <div className="font-mono2 mt-1 text-xl font-bold tracking-[.3em] text-cy/50">000…0</div>
        <div className="font-disp mt-3 text-sm font-bold text-cy/80">×10³⁰ SUPPLY</div>
      </div>
    );
  return (
    <svg width="230" height="190" viewBox="0 0 230 190">
      <path d="M115 40v34M115 74 55 120M115 74l60 46" stroke="#ff5c7a" strokeWidth="2" strokeDasharray="5 6" className="dash-line" fill="none" />
      <circle cx="115" cy="32" r="16" fill="#ff5c7a" opacity=".9" />
      <text x="115" y="37" textAnchor="middle" fontSize="13" fontWeight="800" fill="#060a13">你</text>
      <circle cx="55" cy="130" r="14" fill="none" stroke="#ff5c7a" strokeWidth="2" />
      <text x="55" y="134" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ff8ba0">3%</text>
      <circle cx="175" cy="130" r="14" fill="none" stroke="#ff5c7a" strokeWidth="2" />
      <text x="175" y="134" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ff8ba0">3%</text>
      <path d="M55 144v16M175 144v16" stroke="#ff5c7a" strokeOpacity=".5" strokeWidth="1.5" strokeDasharray="3 5" />
      <circle cx="55" cy="168" r="10" fill="none" stroke="#ff5c7a" strokeOpacity=".5" strokeWidth="1.5" />
      <text x="55" y="171.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#ff5c7a" opacity=".7">2%</text>
      <circle cx="175" cy="168" r="10" fill="none" stroke="#ff5c7a" strokeOpacity=".5" strokeWidth="1.5" />
      <text x="175" y="171.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#ff5c7a" opacity=".7">2%</text>
    </svg>
  );
}

export default function AdCarousel() {
  const { lang, t } = useI18n();
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const n = ADS.length;

  useEffect(() => {
    const id = setInterval(() => { if (!hover) setI((v) => (v + 1) % n); }, 5200);
    return () => clearInterval(id);
  }, [hover, n]);

  const ad = ADS[i];

  return (
    <section
      className="mx-auto mt-4 max-w-7xl px-4 sm:px-6"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        key={ad.id}
        className="fade-in relative overflow-hidden rounded-2xl border border-line2"
        style={{ background: `radial-gradient(120% 180% at 85% 10%, ${ad.from}, ${ad.to2} 60%), linear-gradient(120deg, #0b1220, #0e1729)` }}
      >
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
        <div className="relative flex min-h-[168px] items-center gap-6 px-6 py-6 sm:px-9">
          <div className="max-w-xl flex-1">
            <span className="chip border-gold/40 !text-gold2">
              <Icon name="sparkle" size={12} /> {ad.tag[lang]}
            </span>
            <h3 className="font-disp mt-3 text-xl font-bold leading-snug text-snow sm:text-[26px]">{ad.t[lang]}</h3>
            <p className="mt-2 hidden text-[13.5px] leading-relaxed text-fog sm:block">{ad.d[lang]}</p>
            <Link to={adRoute(ad.to)} className="btn-ghost mt-4 inline-flex items-center gap-2 px-4 py-2 text-[13px] font-semibold">
              {lang === "zh" ? "去看看" : "Explore"} <Icon name="arrowR" size={14} />
            </Link>
          </div>
          <div className="hidden flex-none md:block">
            <Art kind={ad.art} />
          </div>
        </div>

        <div className="relative flex items-center justify-between border-t border-line/60 px-6 py-2.5 sm:px-9">
          <div className="flex items-center gap-2">
            {ADS.map((a, k) => (
              <button key={a.id} onClick={() => setI(k)} aria-label={`ad ${k + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${k === i ? "w-7 bg-gold" : "w-2.5 bg-line2 hover:bg-fog/50"}`} />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setI((i - 1 + n) % n)} className="rounded-lg border border-line p-1.5 text-fog transition hover:border-gold/50 hover:text-gold" aria-label="prev">
              <Icon name="chevL" size={14} />
            </button>
            <button onClick={() => setI((i + 1) % n)} className="rounded-lg border border-line p-1.5 text-fog transition hover:border-gold/50 hover:text-gold" aria-label="next">
              <Icon name="chevR" size={14} />
            </button>
          </div>
        </div>
        <span className="sr-only">{t("hero_kicker")}</span>
      </div>
    </section>
  );
}
