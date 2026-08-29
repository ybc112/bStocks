import { Icon, Logo, useI18n } from "./ui";

export default function Footer() {
  const { lang, t } = useI18n();
  const socials = [
    { n: "x", label: "Twitter X", handle: "@bstocks_binance", href: "https://x.com/bstocks_binance/", c: "#e9eeff" },
    { n: "tg", label: "Telegram", handle: "t.me/bStocksLauchpad", href: "https://t.me/bStocksLauchpad", c: "#38e1ff" },
    { n: "debox", label: "Debox", handle: "m.debox.pro/group", href: "https://m.debox.pro/group?id=eoawrnur&code=y3o8dduj", c: "#9b6bff" },
  ];

  return (
    <footer className="relative border-t border-line bg-abyss/60">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo size={34} />
              <span className="leading-none">
                <span className="font-disp block text-lg font-bold text-snow">bStocks</span>
                <span className="font-mono2 block text-[9px] tracking-[.4em] text-gold">LAUNCHPAD</span>
              </span>
            </div>
            <p className="mt-4 max-w-md text-[13px] leading-relaxed text-fog">
              {lang === "zh"
                ? "BSC 自定义多零 Mint 发射台 —— 30 个零固定发行、自由毕业门槛、全自定义交易税与销毁 / 回购 / 分红官方机制。"
                : "The multi-zero mint launchpad on BSC — fixed 10^30 supply, free graduation thresholds, fully custom taxes and burn / buyback / dividend mechanics."}
            </p>
            <p className="mt-5 max-w-md rounded-xl border border-rosey/25 bg-rosey/5 px-4 py-3 text-[11px] leading-relaxed text-fog">
              <Icon name="shield" size={13} className="mr-1.5 inline text-rosey" />{t("ft_risk")}
            </p>
          </div>

          <div>
            <h4 className="font-disp text-sm font-bold text-snow">{t("ft_community")}</h4>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
              {socials.map((s) => (
                <a key={s.n} href={s.href} target="_blank" rel="noreferrer"
                  className="card-lift group rounded-2xl border border-line bg-panel p-4">
                  <span className="inline-flex rounded-xl border border-line2 p-2.5 transition group-hover:border-current" style={{ color: s.c }}>
                    <Icon name={s.n} size={18} />
                  </span>
                  <div className="mt-2.5 text-[13px] font-bold text-snow">{s.label}</div>
                  <div className="font-mono2 mt-0.5 truncate text-[10.5px] text-fog">{s.handle}</div>
                  <div className="mt-2 flex items-center gap-1 text-[10.5px] font-bold opacity-0 transition group-hover:opacity-100" style={{ color: s.c }}>
                    {lang === "zh" ? "关注" : "Follow"} <Icon name="arrowR" size={11} />
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <span className="font-mono2 text-[11px] text-fog">© 2026 {t("ft_rights")}</span>
          <span className="font-mono2 chip !text-[10.5px]"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-mint" />{t("ft_chain")}</span>
        </div>
      </div>
    </footer>
  );
}
