import { useState } from "react";
import { POOL_ASSETS, short } from "../data";
import { CopyBtn, Icon, Reveal, SectionHead, useI18n } from "./ui";

export default function PoolAssets() {
  const { lang, t } = useI18n();
  const [q, setQ] = useState("");
  const list = POOL_ASSETS.filter((a) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return a.sym.toLowerCase().includes(s) || a.addr.toLowerCase().includes(s) || a.name.includes(q) || a.nameEn.toLowerCase().includes(s);
  });

  return (
    <section id="assets" className="relative mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHead kicker="Pool Assets" title={t("as_title")} sub={t("as_sub")} />

      <Reveal>
        <div className="mb-6 flex max-w-md items-center gap-2.5 rounded-xl border border-line2 bg-panel px-4 py-2.5 transition focus-within:border-gold/50">
          <Icon name="search" size={16} className="flex-none text-fog" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("as_search")} className="w-full bg-transparent text-sm text-snow placeholder:text-fog/50" />
          <span className="font-mono2 flex-none text-[11px] text-fog">{list.length}/17</span>
        </div>
      </Reveal>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a, i) => (
          <Reveal key={a.sym} delay={Math.min(i, 8) * 40}>
            <div className="card-lift group flex items-center gap-3.5 rounded-2xl border border-line bg-panel/85 p-4">
              <span className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full" style={{ background: `${a.color}1a`, border: `1.5px solid ${a.color}66` }}>
                <span className="font-disp text-[13px] font-bold" style={{ color: a.color }}>{a.sym.slice(0, 2)}</span>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink" style={{ background: a.color }} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono2 text-[13.5px] font-bold text-snow">{a.sym}</span>
                  <span className="chip !px-1.5 !py-0 !text-[9px] !border-mint/35 !text-mint">{t("as_pool_ok")}</span>
                </div>
                <div className="truncate text-[11px] text-fog">{lang === "zh" ? a.name : a.nameEn}</div>
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-[10px] text-fog/70">{t("as_contract")}</span>
                  <CopyBtn text={a.addr} shortText={short(a.addr)} />
                </div>
              </div>
              <Icon name="chevR" size={15} className="flex-none text-fog/40 transition group-hover:translate-x-0.5 group-hover:text-gold" />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
