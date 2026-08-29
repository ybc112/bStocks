import { useEffect, useState } from "react";
import { Icon, Reveal, SectionHead, useI18n, useToast } from "./ui";
import { useWallet } from "./Header";
import { Contract } from "ethers";
import { FACTORY_ABI, resolveFactoryAddress } from "../contracts";
import { readOnlyProvider } from "../web3";
import { short } from "../data";

const QR = [
  "1111111010011111111", "1000001011010000001", "1011101000110111001", "1011101101010111001",
  "1011101010110111001", "1000001011010000001", "1111111010101111111", "0000000011100000000",
  "1010111100101101011", "0110100110110100110", "1101011010011010101", "0000000010100001011",
  "1111111011010110100", "1000001001101011010", "1011101110100110101", "1011101010010010011",
  "1011101011101011101", "1000001001010100110", "1111111010101011010",
];

export default function Referral() {
  const { lang, t } = useI18n();
  const toast = useToast();
  const { addr, isBsc, getSigner } = useWallet();
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [parent, setParent] = useState<string>("");
  const [claiming, setClaiming] = useState(false);
  const [binding, setBinding] = useState(false);

  const refParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ref") : null;
  const link = addr ? `${window.location.origin}/?ref=${addr}` : "https://bstocks.fi/?ref=0x…";

  useEffect(() => {
    setRegistered(null);
    setParent("");
    if (!addr) return;
    void (async () => {
      const fa = await resolveFactoryAddress();
      if (!fa) return;
      try {
        const fac = new Contract(fa, FACTORY_ABI, readOnlyProvider());
        setRegistered((await fac.registered(addr)) as boolean);
        setParent(((await fac.parentOf(addr)) as string) ?? "");
      } catch { /* offline */ }
    })();
  }, [addr]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { /* noop */ }
    toast(t("copied"));
  };

  const bind = async () => {
    if (!addr) { toast(t("need_wallet"), "warn"); return; }
    if (!isBsc) { toast(t("wrong_chain"), "warn"); return; }
    if (!refParam || !/^0x[0-9a-fA-F]{40}$/.test(refParam)) return;
    setBinding(true);
    try {
      const signer = await getSigner();
      if (!signer) { toast(t("need_wallet"), "warn"); return; }
      const fa = await resolveFactoryAddress();
      const fac = new Contract(fa, FACTORY_ABI, signer);
      const tx = await fac.register(refParam);
      toast(t("tx_sent"));
      await tx.wait();
      setRegistered(true);
      setParent(refParam);
      toast(t("rf_bound"));
    } catch (e) {
      const msg = (e as Error).message || "";
      toast(msg.includes("user rejected") ? t("tx_rejected") : `${t("rf_bind")}: ${msg.slice(0, 90)}`, "warn");
    } finally {
      setBinding(false);
    }
  };

  const claim = async () => {
    if (!addr) { toast(t("need_wallet"), "warn"); return; }
    if (!isBsc) { toast(t("wrong_chain"), "warn"); return; }
    setClaiming(true);
    try {
      const signer = await getSigner();
      if (!signer) { toast(t("need_wallet"), "warn"); return; }
      const fa = await resolveFactoryAddress();
      const fac = new Contract(fa, FACTORY_ABI, signer);
      const tx = await fac.claimPlatformDiv();
      toast(t("tx_sent"));
      await tx.wait();
      toast(t("claim_ok"));
    } catch (e) {
      const msg = (e as Error).message || "";
      toast(msg.includes("user rejected") ? t("tx_rejected") : `${t("rf_claim")}: ${msg.slice(0, 90)}`, "warn");
    } finally {
      setClaiming(false);
    }
  };
  return (
    <section id="ref" className="relative scroll-mt-20 overflow-hidden py-20">
      <div className="pointer-events-none absolute right-[-10%] top-10 h-[380px] w-[380px] rounded-full bg-rosey/6 blur-[110px]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead kicker="Referral Program" title={t("rf_title")} sub={t("rf_sub")} />

        <div className="grid gap-5 lg:grid-cols-[.92fr_1.08fr]">
          <Reveal>
            <div className="flex h-full flex-col rounded-2xl border border-line2 bg-panel/85 p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-fog">{t("rf_code")}</div>
                  <div className="font-disp mt-1 text-3xl font-black tracking-wide text-gold2">
                    {addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "— — — —"}
                  </div>
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
                  <span className="font-mono2 min-w-0 flex-1 truncate text-[12.5px] text-snow/85">{addr ? link : t("need_wallet")}</span>
                  <button onClick={copy} disabled={!addr} className="btn-gold flex-none px-3.5 py-1.5 text-[11.5px] disabled:opacity-40">{t("rf_copy")}</button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {[
                  { l: `${t("rf_g1")} · 3%`, v: lang === "zh" ? "实时返佣" : "Realtime", c: "#2ee6a8" },
                  { l: `${t("rf_g2")} · 2%`, v: lang === "zh" ? "实时返佣" : "Realtime", c: "#38e1ff" },
                  { l: lang === "zh" ? "绑定状态" : "Bind status", v: registered === null ? "…" : registered ? (lang === "zh" ? "已绑定" : "Bound") : (lang === "zh" ? "未绑定" : "Unbound"), c: registered ? "#f0b90b" : "#e9eeff" },
                  { l: lang === "zh" ? "上级地址" : "Parent", v: parent && parent !== "0x0000000000000000000000000000000000000000" ? short(parent) : "—", c: "#9b6bff" },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl border border-line bg-panel2 px-4 py-3">
                    <div className="font-mono2 text-[15px] font-bold" style={{ color: s.c }}>{s.v}</div>
                    <div className="mt-0.5 text-[10.5px] text-fog">{s.l}</div>
                  </div>
                ))}
              </div>

              {refParam && !registered && addr && (
                <button onClick={() => void bind()} disabled={binding}
                  className="btn-gold mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm disabled:opacity-50">
                  <Icon name="link" size={15} /> {t("rf_bind")} {short(refParam)}
                </button>
              )}

              <button onClick={() => void claim()} disabled={!addr || claiming} className="btn-gold mt-3 flex w-full items-center justify-center gap-2 py-3.5 text-sm disabled:opacity-40">
                <Icon name="gift" size={16} />
                {claiming ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-abyss/40 border-t-abyss" /> : t("rf_claim")}
              </button>
              <p className="mt-2 text-center text-[10px] text-fog">{t("rf_claim_note")}</p>
            </div>
          </Reveal>

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
                  <h3 className="font-disp text-sm font-bold text-snow">{t("rf_rules")}</h3>
                  <span className="chip ml-auto !text-[10px]">{lang === "zh" ? "链上规则" : "On-chain"}</span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { k: lang === "zh" ? "平台基金抽税" : "Platform fund cut", v: lang === "zh" ? "交易税点的 20%" : "20% of tax points" },
                    { k: lang === "zh" ? "社区维护" : "Community", v: "15% -> communityPool" },
                    { k: lang === "zh" ? "推广返佣" : "Referral", v: "5% = 3% L1 + 2% L2" },
                    { k: lang === "zh" ? "结算方式" : "Settlement", v: lang === "zh" ? "交易时实时到账(失败入储备)" : "Realtime on trade (reserve on fail)" },
                    { k: lang === "zh" ? "绑定方式" : "Binding", v: lang === "zh" ? "邀请链接 ?ref=0x… 一键绑定" : "One click via ?ref=0x… link" },
                  ].map((r) => (
                    <div key={r.k} className="font-mono2 grid grid-cols-[110px_1fr] items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-[12px] transition hover:bg-raise hover:border-line">
                      <span className="text-fog">{r.k}</span>
                      <span className="text-snow/85">{r.v}</span>
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