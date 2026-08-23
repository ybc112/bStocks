import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dicts } from "../i18n";
import type { K, Lang } from "../i18n";

/* ---------------- i18n ---------------- */
type I18nVal = { lang: Lang; setLang: (l: Lang) => void; t: (k: K) => string };
const I18nCtx = createContext<I18nVal>({ lang: "zh", setLang: () => {}, t: (k) => dicts.zh[k] });
export const useI18n = () => useContext(I18nCtx);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("zh");
  const t = (k: K) => dicts[lang][k];
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

/* ---------------- toast ---------------- */
type Toast = { id: number; msg: string; kind: "ok" | "warn" };
const ToastCtx = createContext<(msg: string, kind?: "ok" | "warn") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const push = (msg: string, kind: "ok" | "warn" = "ok") => {
    const id = idRef.current++;
    setList((l) => [...l.slice(-3), { id, msg, kind }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 2800);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[120] flex flex-col gap-2 items-end">
        {list.map((t) => (
          <div
            key={t.id}
            className={`pop-in flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur-md ${
              t.kind === "ok"
                ? "border-mint/40 bg-[#0a1f18]/90 text-mint"
                : "border-gold/40 bg-[#241a00]/90 text-gold2"
            }`}
          >
            <Icon name={t.kind === "ok" ? "check" : "info"} size={16} />
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- icons ---------------- */
const PATHS: Record<string, ReactNode> = {
  x: <path d="M4 4l7.1 9.3L4.4 20h2.2l5.5-5.5L16.8 20H20l-7.4-9.7L18.9 4h-2.2l-4.9 5L8.2 4H4z" fill="currentColor" stroke="none" />,
  tg: <><path d="M21.5 4.5 2.9 11.7c-.9.35-.85 1.63.08 1.9l4.6 1.35 1.7 5.2c.3.9 1.44 1.1 2.05.37l2.3-2.75 4.5 3.3c.7.5 1.7.13 1.9-.74l2.6-14.2c.2-1-.75-1.73-1.73-1.38z" /><path d="m9.5 14.5 8.5-7" /></>,
  debox: <><rect x="3" y="3" width="18" height="18" rx="5.5" /><path d="M9.5 8h3a4 4 0 0 1 0 8h-3z" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2" /><path d="M21 12a2 2 0 0 0-2-2h-4a2.5 2.5 0 0 0 0 5h4a2 2 0 0 0 2-2z" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5.5-6.5" /></>,
  bolt: <path d="M13 2 3.5 13.5H11L10 22l9.5-11.5H12L13 2z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14.2 14.2 0 0 1 0 18 14.2 14.2 0 0 1 0-18z" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  coins: <><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82" /></>,
  rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></>,
  layers: <><path d="m12 2 8.5 4.5L12 11 3.5 6.5 12 2z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 17.5 12 22l8.5-4.5" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  chevD: <path d="m6 9 6 6 6-6" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  arrowR: <path d="M4 12h16m-6-6 6 6-6 6" />,
  external: <><path d="M15 3h6v6M10 14 21 3" /><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" /></>,
  drop: <path d="M12 2.5s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 9.5 12 2.5 12 2.5z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-15.3 6.4L3 16" /><path d="M3 21v-5h5" /></>,
  sparkle: <path d="m12 3 1.9 5.6L20 10.5l-6.1 1.9L12 18l-1.9-5.6L4 10.5l6.1-1.9L12 3z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  crown: <path d="m3 7 4.5 4L12 4l4.5 7L21 7l-1.5 12h-15L3 7z" />,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  fire: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
};

export function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd75e" /><stop offset="1" stopColor="#d99e00" />
        </linearGradient>
      </defs>
      <path d="M20 2 35.6 11v18L20 38 4.4 29V11L20 2z" fill="none" stroke="url(#lg1)" strokeWidth="2.4" />
      <path d="M14.5 26.5 26 15m-8.5-2.5h5m3.5 3.5v5" stroke="url(#lg1)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="14" cy="14" r="1.7" fill="#ffd75e" />
      <circle cx="26" cy="26" r="1.7" fill="#ffd75e" />
    </svg>
  );
}

/* ---------------- modal ---------------- */
export function Modal({ onClose, children, w = "max-w-3xl" }: { onClose: () => void; children: ReactNode; w?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-abyss/80 backdrop-blur-sm fade-in p-4 sm:p-8" onMouseDown={onClose}>
      <div className={`m-in relative w-full ${w} my-auto rounded-2xl border border-line2 bg-panel shadow-[0_40px_90px_-20px_rgba(0,0,0,.9)]`} onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-lg border border-line bg-panel2 p-2 text-fog transition hover:border-rosey/60 hover:text-rosey" aria-label="close">
          <Icon name="close" size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

/* ---------------- copy button ---------------- */
export function CopyBtn({ text, label, shortText }: { text: string; label?: string; shortText?: string }) {
  const toast = useToast();
  const t = useI18n().t;
  const [ok, setOk] = useState(false);
  const go = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
    setOk(true);
    toast(t("copied"));
    setTimeout(() => setOk(false), 1500);
  };
  return (
    <button onClick={go} className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono2 text-[11.5px] text-fog transition hover:bg-raise hover:text-gold2">
      <span>{shortText ?? text}</span>
      <Icon name={ok ? "check" : "copy"} size={12} className={ok ? "text-mint" : "opacity-60 group-hover:opacity-100"} />
      {label && <span className="text-[10px] uppercase tracking-wider opacity-60">{label}</span>}
    </button>
  );
}

/* ---------------- sparkline ---------------- */
export function Spark({ data, color, w = 110, h = 34, fill = true }: { data: number[]; color: string; w?: number; h?: number; fill?: boolean }) {
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (w - 4) + 2, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const gid = `g${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full overflow-visible" style={{ height: h }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity=".32" /><stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d} L${w - 2},${h} L2,${h} Z`} fill={`url(#${gid})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={color} className="glow-pulse" />
    </svg>
  );
}

/* ---------------- area chart ---------------- */
export function AreaChart({ data, color, w = 520, h = 170 }: { data: number[]; color: string; w?: number; h?: number }) {
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (w - 16) + 8, h - 18 - ((v - min) / (max - min || 1)) * (h - 42)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const gid = `a${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".3" /><stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((p) => (
        <line key={p} x1="8" x2={w - 8} y1={h * p} y2={h * p} stroke="#1b2740" strokeDasharray="3 6" />
      ))}
      <path d={`${d} L${w - 8},${h - 10} L8,${h - 10} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={color} className="glow-pulse" />
    </svg>
  );
}

/* ---------------- reveal on scroll ---------------- */
export function Reveal({ children, className = "", delay = 0, dir = "" }: { children: ReactNode; className?: string; delay?: number; dir?: "" | "l" | "r" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } }),
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`rv ${dir ? `rv-${dir}` : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ---------------- count up ---------------- */
export function useCountUp(target: number, dur = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

/* ---------------- misc ---------------- */
export function CoinIcon({ sym, color, size = 40 }: { sym: string; color: string; size?: number }) {
  return (
    <div
      className="flex flex-none items-center justify-center rounded-full font-disp font-bold"
      style={{
        width: size, height: size, fontSize: size * 0.3,
        background: `radial-gradient(circle at 32% 28%, ${color}33, ${color}14 60%, transparent)`,
        border: `1.5px solid ${color}88`, color,
        boxShadow: `0 0 18px -4px ${color}66`,
      }}
    >
      {sym.slice(0, sym.length > 4 ? 3 : 4)}
    </div>
  );
}

export function Bar({ pct, color = "#f0b90b" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-raise">
      <div
        className="shimmer bar-grow h-full rounded-full"
        style={{ width: `${Math.min(100, pct)}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
      />
    </div>
  );
}

export function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <Reveal className="mb-10">
      <div className="flex items-center gap-3 text-gold">
        <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold" />
        <span className="font-mono2 text-xs tracking-[.25em] uppercase">{kicker}</span>
      </div>
      <h2 className="font-disp mt-3 text-3xl font-bold text-snow sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-fog">{sub}</p>}
    </Reveal>
  );
}
