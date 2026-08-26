import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Contract, ZeroAddress, isAddress, parseEther, randomBytes, hexlify } from "ethers";
import type { ContractTransactionResponse } from "ethers";
import { POOL_ASSETS, assetOf } from "../data";
import type { MintMode } from "../data";
import { CoinIcon, CopyBtn, Icon, Reveal, SectionHead, useI18n, useToast } from "./ui";
import { useWallet } from "./Header";
import { readOnlyProvider, txLink, addrLink } from "../web3";
import {
  FACTORY_ABI, DEPLOYER_ABI, factoryIface, computeCommitment, vanitySearch, verifySubmit, resolveFactoryAddress,
  uploadAvatar, linkAvatar,
} from "../contracts";

type W = {
  name: string; sym: string; desc: string; x: string; tg: string;
  pool: string;
  mode: MintMode; durH: number; wlAddrs: string;
  mintRate: number; minMint: number; maxMint: number; walletCap: number;
  capBNB: number; poolPercent: number; lpTokenRatio: number; dev: string;
  buy: number; sell: number; transfer: number;
  feeMkt: number; feeBb: number; feeLiq: number; feeSelf: number;
  mktOn: boolean; mktWallet: string;
  buybackOn: boolean;
  holderOn: boolean; holderToken: string; holderMin: number; customCa: string;
  lpOn: boolean; lpToken: string; lpMin: number;
  bdOn: boolean;
  vanityOn: boolean; vanitySuffix: string;
};

const INIT: W = {
  name: "", sym: "", desc: "", x: "", tg: "",
  pool: "BNB",
  mode: "public", durH: 48, wlAddrs: "",
  mintRate: 100000, minMint: 0.001, maxMint: 0.1, walletCap: 0.5,
  capBNB: 10, poolPercent: 80, lpTokenRatio: 100, dev: "",
  buy: 5, sell: 5, transfer: 1,
  feeMkt: 300, feeBb: 250, feeLiq: 250, feeSelf: 100,
  mktOn: true, mktWallet: "",
  buybackOn: true,
  holderOn: true, holderToken: "USDT", holderMin: 100000, customCa: "",
  lpOn: false, lpToken: "BNB", lpMin: 1,
  bdOn: false,
  vanityOn: true, vanitySuffix: "bbbb",
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

type StageKey = "vanity" | "commit" | "deploy" | "config" | "verify";
type StageState = "wait" | "run" | "ok" | "err";
type Stage = { state: StageState; info?: string };

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

const parseWl = (s: string): string[] =>
  s.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => x.length === 42 && isAddress(x));
export default function CreateWizard() {
  const { lang, t } = useI18n();
  const toast = useToast();
  const { addr, isBsc, getSigner } = useWallet();
  const [w, setW] = useState<W>(INIT);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"form" | "running" | "done" | "error">("form");
  const [stages, setStages] = useState<Record<StageKey, Stage>>({
    vanity: { state: "wait" }, commit: { state: "wait" }, deploy: { state: "wait" }, config: { state: "wait" }, verify: { state: "wait" },
  });
  const [result, setResult] = useState<{ ca: string; salt: string; txs: string[] }>({ ca: "", salt: "", txs: [] });
  const [errMsg, setErrMsg] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const set = (patch: Partial<W>) => setW((v) => ({ ...v, ...patch }));
  const setStage = (k: StageKey, s: Stage) => setStages((v) => ({ ...v, [k]: s }));

  const optLabel = (o: string) =>
    o === "native" ? t("opt_native") : o === "pool" ? `${t("opt_pool")}(${w.pool})` : o === "custom" ? t("opt_custom") : o;

  const steps = [t("wz_s1"), t("wz_s2"), t("wz_s3"), t("wz_s4"), t("wz_s5")];
  const canNext = step !== 0 || (w.name.trim() && w.sym.trim());
  const poolAsset = assetOf(w.pool);
  const feeTotal = (w.mktOn ? w.feeMkt : 0) + (w.buybackOn ? w.feeBb : 0) + w.feeLiq + w.feeSelf;
  const feeOverflow = feeTotal > 900;
  const wlCount = parseWl(w.wlAddrs).length;

  const validate = (): string | null => {
    if (!addr) return t("need_wallet");
    if (!isBsc) return t("wrong_chain");
    if (!w.name.trim() || !w.sym.trim()) return t("wz_name") + " / " + t("wz_sym");
    if (!isAddress(w.dev)) return `${t("wz_dev")}: ${t("err_addr")}`;
    if (w.mktOn && w.mktWallet && !isAddress(w.mktWallet)) return `${t("wz_mkt_wallet")}: ${t("err_addr")}`;
    if (w.holderToken === "custom" && !isAddress(w.customCa)) return `${t("wz_custom_ca")}: ${t("err_addr")}`;
    if (w.capBNB < 0.1) return `${t("wz_goal")}: >= 0.1 BNB`;
    if (feeOverflow) return t("wz_allocation_warn");
    if (w.vanityOn && !/^[0-9a-fA-F]{4,8}$/.test(w.vanitySuffix)) return `${t("wz_vanity_suffix")}: 0-9 a-f x4-8`;
    return null;
  };

  const waitTx = async (label: string, p: Promise<ContractTransactionResponse>): Promise<string> => {
    const tx = await p;
    toast(`${label} · ${t("tx_sent")}`);
    await tx.wait();
    return tx.hash;
  };

  const doLaunch = async () => {
    const verr = validate();
    if (verr) { toast(verr, "warn"); return; }

    const fa = await resolveFactoryAddress();
    if (!fa) { toast(t("err_no_factory"), "warn"); return; }

    setPhase("running");
    setErrMsg("");
    setResult({ ca: "", salt: "", txs: [] });
    setStages({ vanity: { state: "wait" }, commit: { state: "wait" }, deploy: { state: "wait" }, config: { state: "wait" }, verify: { state: "wait" } });

    const txs: string[] = [];
    try {
      const signer = await getSigner();
      if (!signer) { toast(t("need_wallet"), "warn"); setPhase("error"); return; }
      const factory = new Contract(fa, FACTORY_ABI, signer);
      const wbnb = (await factory.WBNB()) as string;
      const router = (await factory.router()) as string;
      const pfactory = (await factory.factoryERC20()) as string;
      const deployerAddr = (await factory.deployer()) as string;
      const base = w.pool === "BNB" ? ZeroAddress : poolAsset.addr;
      const resolvedBase = w.pool === "BNB" ? wbnb : poolAsset.addr;
      const marketing = w.mktOn && isAddress(w.mktWallet) ? w.mktWallet : w.dev;

      let salt: string;
      let vanityAddr = "";
      setStage("vanity", { state: "run" });
      if (w.vanityOn) {
        const codeHash = await new Contract(deployerAddr, DEPLOYER_ABI, readOnlyProvider()).initCodeHash(w.name, w.sym, router, pfactory, w.dev, marketing, resolvedBase) as string;
        const v = await vanitySearch(w.vanitySuffix, deployerAddr, [w.name, w.sym, router, pfactory, w.dev, marketing, resolvedBase], 5000000, codeHash);
        if (!v.found || !v.salt) {
          setStage("vanity", { state: "err", info: v.message || "not found" });
          setErrMsg(t("err_vanity"));
          setPhase("error");
          return;
        }
        salt = v.salt;
        vanityAddr = v.address || "";
        setStage("vanity", { state: "ok", info: `${v.address} · ${v.attempts} tries · ${v.elapsed}` });
      } else {
        salt = hexlify(randomBytes(32));
        setStage("vanity", { state: "ok", info: lang === "zh" ? "random salt" : "random salt" });
      }

      setStage("commit", { state: "run" });
      const predicted = vanityAddr || "";
      const commitment = computeCommitment(addr!, salt, w.name, w.sym, resolvedBase);
      const deployer = new Contract(deployerAddr, DEPLOYER_ABI, signer);
      txs.push(await waitTx("commitSalt", deployer.commitSalt(commitment)));
      setStage("commit", { state: "ok", info: predicted || "committed" });

      setStage("deploy", { state: "run" });
      const depTx = await factory.launchProjectDeterministic(w.name, w.sym, w.dev, marketing, base, salt, addr!);
      toast(`${t("wz_deploy")} · ${t("tx_sent")}`);
      const rc = await depTx.wait();
      txs.push(depTx.hash);
      let tokenAddr = predicted;
      for (const log of rc?.logs ?? []) {
        try {
          const ev = factoryIface.parseLog({ topics: [...log.topics], data: log.data });
          if (ev && ev.name === "ProjectLaunched2") { tokenAddr = ev.args.token as string; break; }
        } catch { /* not ours */ }
      }
      setResult({ ca: tokenAddr, salt, txs });
      setStage("deploy", { state: "ok", info: tokenAddr });

      setStage("config", { state: "run" });
      const duration = w.mode === "time" ? Math.round(w.durH * 3600) : 30 * 86400;
      txs.push(await waitTx("configMint", factory.configMint(
        tokenAddr,
        w.mode === "wl",
        BigInt(Math.round(w.mintRate)),
        BigInt(Math.round(w.poolPercent * 10)),
        BigInt(Math.round(w.lpTokenRatio * 10)),
        parseEther(String(w.minMint)),
        parseEther(String(w.maxMint)),
        parseEther(String(w.walletCap)),
        parseEther(String(w.capBNB)),
        duration
      )));
      txs.push(await waitTx("configTax", factory.configTax(tokenAddr, BigInt(Math.round(w.buy * 10)), BigInt(Math.round(w.sell * 10)), BigInt(Math.round(w.transfer * 10)))));
      txs.push(await waitTx("configFeeSplit", factory.configFeeSplit(tokenAddr, BigInt(w.mktOn ? w.feeMkt : 0), BigInt(w.buybackOn ? w.feeBb : 0), BigInt(w.feeLiq))));

      const rewardAddr = (o: string): string => {
        if (o === "BNB") return wbnb;
        if (o === "native") return ZeroAddress;
        if (o === "pool") return resolvedBase;
        return w.customCa;
      };
      if (w.holderOn) {
        txs.push(await waitTx("configDiv(HOLD)", factory.configDiv(tokenAddr, 1, rewardAddr(w.holderToken), parseEther(String(w.holderMin)), true)));
      }
      if (w.lpOn) {
        txs.push(await waitTx("configDiv(LIQ)", factory.configDiv(tokenAddr, 2, rewardAddr(w.lpToken), parseEther(String(w.lpMin)), true)));
      }
      if (w.bdOn) {
        txs.push(await waitTx("configDiv(BURN)", factory.configDiv(tokenAddr, 3, rewardAddr(w.holderToken), 0n, true)));
      }
      setResult((r) => ({ ...r, txs }));
      setStage("config", { state: "ok", info: `${txs.length - 2} tx` });

      setStage("verify", { state: "run" });
      try {
        const v = await verifySubmit({ tokenAddress: tokenAddr, name: w.name, symbol: w.sym, router, factory: pfactory, dev: w.dev, marketing, baseToken: resolvedBase });
        setStage("verify", { state: "ok", info: v.verificationStatus });
      } catch (e) {
        setStage("verify", { state: "err", info: (e as Error).message });
      }

      // link avatar if uploaded
      if (avatarFile) {
        try {
          setAvatarUploading(true);
          const url = await uploadAvatar(avatarFile);
          await linkAvatar(tokenAddr, url);
          setAvatarUploading(false);
        } catch { setAvatarUploading(false); }
      }

      setResult((r) => ({ ...r, txs }));
      setPhase("done");
      toast(`${t("wz_success")} ${w.sym.toUpperCase()}`);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      setErrMsg(msg.slice(0, 220));
      setPhase("error");
      toast(msg.includes("user rejected") ? t("tx_rejected") : msg.slice(0, 120), "warn");
      setResult((r) => ({ ...r, txs }));
    }
  };
  if (phase === "done" || (phase === "error" && result.ca)) {
    return (
      <section id="create" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-2xl border border-mint/30 bg-panel p-10 text-center">
          <div className="confetti pointer-events-none absolute inset-x-0 top-0 h-0">
            {Array.from({ length: 16 }).map((_, i) => (
              <i key={i} style={{ left: `${6 + i * 6}%`, background: ["#f0b90b", "#2ee6a8", "#38e1ff", "#ff5c7a", "#ffd75e"][i % 5], animationDelay: `${(i % 8) * 0.09}s` }} />
            ))}
          </div>
          <svg width="92" height="92" viewBox="0 0 60 60" className="mx-auto">
            <circle cx="30" cy="30" r="25" fill="none" stroke={phase === "done" ? "#2ee6a8" : "#f0b90b"} strokeWidth="3" className="ring-check" strokeLinecap="round" transform="rotate(-90 30 30)" />
            <path d="M20 31l7 7 13-15" fill="none" stroke={phase === "done" ? "#2ee6a8" : "#f0b90b"} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" className="ring-check" />
          </svg>
          <h2 className="font-disp mt-5 text-3xl font-bold text-snow">{phase === "done" ? t("wz_success") : t("wz_partial")}</h2>
          <p className="mt-2 text-sm text-fog">{phase === "done" ? t("wz_success_real_sub") : t("wz_partial_sub")}</p>
          <div className="mx-auto mt-6 flex max-w-md flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-abyss/60 px-4 py-3">
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wider text-fog">{t("wz_ca_new")}</div>
                <a href={addrLink(result.ca)} target="_blank" rel="noreferrer" className="font-mono2 text-[12.5px] font-bold text-gold2 hover:text-gold">
                  {result.ca.slice(0, 12)}…{result.ca.slice(-8)}
                </a>
              </div>
              <CoinIcon sym={w.sym || "NEW"} color="#f0b90b" size={44} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-abyss/60 px-4 py-3">
              <div className="text-left">
                <div className="text-[10px] uppercase tracking-wider text-fog">Salt (CREATE2)</div>
                <CopyBtn text={result.salt} shortText={`${result.salt.slice(0, 12)}…${result.salt.slice(-8)}`} />
              </div>
              <span className="chip !border-gold/40 !text-gold2 !text-[10px]">
                {result.ca.toLowerCase().endsWith(w.vanitySuffix.toLowerCase()) ? `…${w.vanitySuffix}` : "—"}
              </span>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {result.txs.map((h, i) => (
              <a key={h} href={txLink(h)} target="_blank" rel="noreferrer" className="chip !text-[10.5px] hover:!border-gold/50">
                <Icon name="external" size={11} /> tx {i + 1}
              </a>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/board" className="btn-gold px-6 py-3 text-sm">{t("wz_view_board")}</Link>
            <button onClick={() => { setPhase("form"); setW(INIT); setStep(0); }} className="btn-ghost px-6 py-3 text-sm font-semibold">{t("wz_again")}</button>
          </div>
        </div>
      </section>
    );
  }

  if (phase === "running" || phase === "error") {
    const STAGES: { k: StageKey; label: string }[] = [
      { k: "vanity", label: t("stage_vanity") },
      { k: "commit", label: t("stage_commit") },
      { k: "deploy", label: t("stage_deploy") },
      { k: "config", label: t("stage_config") },
      { k: "verify", label: t("stage_verify") },
    ];
    return (
      <section id="create" className="mx-auto max-w-2xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="rounded-2xl border border-line2 bg-panel/85 p-8">
          <div className="flex items-center gap-3">
            {phase === "running" ? (
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
            ) : (
              <span className="rounded-xl border border-rosey/50 bg-rosey/10 p-2 text-rosey"><Icon name="close" size={16} /></span>
            )}
            <div>
              <h2 className="font-disp text-xl font-bold text-snow">{phase === "running" ? t("wz_launching") : t("wz_launch_fail")}</h2>
              <p className="text-xs text-fog">{phase === "running" ? t("wz_launching_sub") : errMsg}</p>
            </div>
          </div>
          <div className="mt-7 space-y-2.5">
            {STAGES.map((s, i) => {
              const st = stages[s.k];
              return (
                <div key={s.k} className={`flex items-center gap-3.5 rounded-xl border px-4 py-3.5 transition ${
                  st.state === "ok" ? "border-mint/40 bg-mint/6"
                  : st.state === "run" ? "border-gold/50 bg-gold/8"
                  : st.state === "err" ? "border-rosey/40 bg-rosey/6"
                  : "border-line bg-panel2/50"
                }`}>
                  <span className={`font-mono2 flex h-8 w-8 flex-none items-center justify-center rounded-full border text-xs font-bold ${
                    st.state === "ok" ? "border-mint/60 bg-mint/15 text-mint"
                    : st.state === "run" ? "border-gold bg-gold/15 text-gold2"
                    : st.state === "err" ? "border-rosey/60 bg-rosey/15 text-rosey"
                    : "border-line2 text-fog"
                  }`}>
                    {st.state === "ok" ? <Icon name="check" size={13} /> : st.state === "err" ? <Icon name="close" size={13} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13.5px] font-bold ${st.state === "wait" ? "text-fog" : "text-snow"}`}>{s.label}</div>
                    {st.info && <div className="font-mono2 mt-0.5 truncate text-[11px] text-fog">{st.info}</div>}
                  </div>
                  {st.state === "run" && <span className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-gold/30 border-t-gold" />}
                </div>
              );
            })}
          </div>
          {phase === "error" && (
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setPhase("form")} className="btn-ghost px-6 py-2.5 text-sm font-semibold">{t("wz_back_form")}</button>
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section id="create" className="relative mx-auto max-w-5xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHead kicker="Launch Console" title={t("wz_title")} sub="平台管理员创建项目，配置 Mint 规则、交易税与官方机制" />

      <Reveal>
        <div className="overflow-hidden rounded-2xl border border-line2 bg-panel/80 backdrop-blur">
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

                <div>
                  <Lbl>{t("wz_pool")} · {t("wz_pool_note")}</Lbl>
                  <div className="flex flex-wrap gap-1.5">
                    {POOL_ASSETS.map((a) => (
                      <button key={a.sym} type="button" onClick={() => set({ pool: a.sym })}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold transition ${w.pool === a.sym ? "border-gold bg-gold/12 text-gold2" : "border-line text-fog hover:border-gold/40"}`}>
                        <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                        {a.sym}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 font-mono2 text-[10.5px] text-fog">{poolAsset.name} · {poolAsset.addr}</p>
                </div>

                <div className="rounded-xl border border-gold/15 bg-gold/5 p-3 text-xs text-fog">
                  <Icon name="info" size={12} className="mr-1 inline text-gold" />
                  {t("wz_supply_note")} · {t("wz_goal_note")}
                </div>
              </div>
            )}

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
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {w.mode === "time" && <div><Lbl>{t("wz_dur")}</Lbl><input type="number" min={1} className="field font-mono2" value={w.durH} onChange={(e) => set({ durH: +e.target.value })} /></div>}
                    {w.mode === "wl" && (
                      <div className="sm:col-span-2 rounded-xl border border-cy/25 bg-cy/6 p-3 text-xs text-fog">
                        代币创建成功后，在代币详情的“白名单管理”中批量添加地址并单独上链。
                      </div>
                    )}
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
                    <p className="mt-1 text-[11px] text-fog">1 BNB = {w.mintRate.toLocaleString()} 枚（1 枚 = 10^18 raw，总供应 10^30 raw）</p>
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
                    <div className="flex items-baseline justify-between"><Lbl>加池代币比例</Lbl><span className="font-mono2 text-sm font-bold text-gold2">{w.poolPercent}%</span></div>
                    <input type="range" min={10} max={90} step={1} value={w.poolPercent} onChange={(e) => set({ poolPercent: +e.target.value })} className="w-full" />
                    <p className="mt-1 text-[11px] text-fog">加池 {w.poolPercent}% · Mint 用户分配 {100 - w.poolPercent}% · 剩余 BNB 转给 Dev</p>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between"><Lbl>LP 代币使用比例</Lbl><span className="font-mono2 text-sm font-bold text-gold2">{w.lpTokenRatio}%</span></div>
                    <input type="range" min={10} max={100} step={1} value={w.lpTokenRatio} onChange={(e) => set({ lpTokenRatio: +e.target.value })} className="w-full" />
                    <p className="mt-1 text-[11px] text-fog">100% = 完整使用 LP 储备，50% = 使用一半</p>
                  </div>
                </div>

                <div><Lbl>{t("wz_dev")}</Lbl><input className="field font-mono2" value={w.dev} onChange={(e) => set({ dev: e.target.value })} placeholder={t("wz_dev_ph")} /></div>

                <div className="rounded-xl border border-gold/15 bg-gold/5 p-3 text-xs text-fog">
                  <Icon name="info" size={12} className="mr-1 inline text-gold" />
                  未打满 24 小时后可退款；白名单模式创建后，在代币详情中追加地址上链。
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="fade-in space-y-6">
                <div className="grid gap-6 lg:grid-cols-3">
                  {[
                    { k: "buy" as const, label: t("wz_buy"), c: "#2ee6a8" },
                    { k: "sell" as const, label: t("wz_sell"), c: "#ff5c7a" },
                    { k: "transfer" as const, label: t("wz_transfer"), c: "#38e1ff" },
                  ].map((x) => (
                    <div key={x.k}>
                      <div className="flex items-baseline justify-between"><Lbl>{x.label}</Lbl><span className="font-mono2 text-lg font-bold" style={{ color: x.c }}>{w[x.k]}%</span></div>
                      <input type="range" min={0} max={25} step={0.5} value={w[x.k]} onChange={(e) => set({ [x.k]: +e.target.value })} className="w-full" />
                    </div>
                  ))}
                </div>
                <div className={`rounded-xl border p-4 ${feeOverflow ? "border-rosey/50 bg-rosey/6" : "border-line bg-panel2/60"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-bold text-snow">{t("wz_allocation")}</div>
                    <span className={`font-mono2 text-xs font-bold ${feeOverflow ? "text-rosey" : "text-gold2"}`}>{(feeTotal / 9).toFixed(1)}% / 100%</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {([
                      { k: "feeMkt" as const, l: t("mech_mkt"), on: w.mktOn },
                      { k: "feeBb" as const, l: t("mech_buyback"), on: w.buybackOn },
                      { k: "feeLiq" as const, l: t("wz_liq_share"), on: true },
                      { k: "feeSelf" as const, l: `${t("mech_holder")}·${t("opt_native")}`, on: w.holderOn && w.holderToken === "native" },
                    ]).map((x) => (
                      <div key={x.k} className={x.on ? "" : "opacity-40"}>
                        <div className="flex items-baseline justify-between"><Lbl>{x.l}</Lbl><span className="font-mono2 text-xs font-bold text-gold2">{(w[x.k] / 9).toFixed(1)}%</span></div>
                        <input type="range" min={0} max={800} step={10} value={w[x.k]} onChange={(e) => set({ [x.k]: +e.target.value })} className="w-full" />
                      </div>
                    ))}
                  </div>
                  <p className={`mt-2 text-[10px] ${feeOverflow ? "font-bold text-rosey" : "text-fog"}`}>
                    {feeOverflow ? t("wz_allocation_warn") : "项目税收分配合计 100%，平台另从交易税中抽取 20%"}
                  </p>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="fade-in space-y-3">
                <p className="mb-4 text-[12.5px] text-fog"><Icon name="info" size={13} className="mr-1.5 inline text-gold" />持币分红、加池分红、燃烧分红三选一；营销和回购可独立开启。</p>

                <Tgl on={w.mktOn} set={(v) => set({ mktOn: v })} icon="gift" label={t("mech_mkt")}>
                  <input className="field font-mono2" value={w.mktWallet} onChange={(e) => set({ mktWallet: e.target.value })} placeholder={`${t("wz_mkt_wallet")} 0x…`} />
                  <p className="mt-1.5 text-[10.5px] text-fog">{t("wz_mkt_pct")} {w.feeMkt}/1000</p>
                </Tgl>

                <Tgl on={w.buybackOn} set={(v) => set({ buybackOn: v })} icon="refresh" label={t("mech_buyback")}>
                  <p className="text-[12px] leading-relaxed text-fog">{t("wz_buyback_pct")} {w.feeBb}/1000 — {t("wz_buyback_note")}</p>
                </Tgl>

                <Tgl on={w.holderOn} set={(v) => set({ holderOn: v, lpOn: v ? false : w.lpOn, bdOn: v ? false : w.bdOn })} icon="coins" label={t("mech_holder")}>
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

                <Tgl on={w.lpOn} set={(v) => set({ lpOn: v, holderOn: v ? false : w.holderOn, bdOn: v ? false : w.bdOn })} icon="drop" label={t("mech_lp")}>
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

                <Tgl on={w.bdOn} set={(v) => set({ bdOn: v, holderOn: v ? false : w.holderOn, lpOn: v ? false : w.lpOn })} icon="fire" label={t("mech_burndiv")}>
                  <p className="text-[12px] leading-relaxed text-fog">{t("wz_burndiv_note")} · {t("wz_reward_token")}: {optLabel(w.holderToken)}</p>
                </Tgl>
              </div>
            )}
            {step === 4 && (
              <div className="fade-in grid gap-6 lg:grid-cols-[1fr_280px]">
                <div>
                  <h3 className="font-disp mb-4 text-sm font-bold text-gold2">{t("wz_summary")}</h3>
                  <div className="grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
                    {[
                      [t("wz_name"), `${w.name} ($${w.sym})`],
                      [t("wz_supply"), "10^30 raw · 30 decimals"],
                      ["毕业目标", `${w.capBNB} BNB`],
                      ["Mint 兑换率", `1 BNB = ${w.mintRate.toLocaleString()} 枚`],
                      ["单笔范围", `${w.minMint} - ${w.maxMint} BNB`],
                      ["每钱包上限", w.walletCap > 0 ? `${w.walletCap} BNB` : "不限制"],
                      ["Mint 模式", t(`mode_${w.mode}` as never) + (w.mode === "time" ? ` · ${w.durH}h` : w.mode === "wl" ? ` · ${wlCount} addr` : "")],
                      ["底池资产", `${poolAsset.sym} · ${poolAsset.name}`],
                      ["Mint → LP 比例", `${w.poolPercent}%`],
                      [`${t("wz_buy")} / ${t("wz_sell")} / ${t("wz_transfer")}`, `${w.buy}% / ${w.sell}% / ${w.transfer}%`],
                      ["费用分配 /1000", `营销${w.mktOn ? w.feeMkt : 0} · 回购${w.buybackOn ? w.feeBb : 0} · 加池${w.feeLiq} · 本币分红${w.feeSelf}`],
                      [t("dt_mech_title"), [w.mktOn && `营销${w.feeMkt / 10}%`, w.buybackOn && `回购${w.feeBb / 10}%`, w.holderOn && `分红·${optLabel(w.holderToken)}`, w.lpOn && "加池分红", w.bdOn && "燃烧分红"].filter(Boolean).join(" · ") || "—"],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2">
                        <span className="flex-none text-fog">{k}</span>
                        <span className="text-right font-mono2 text-[12.5px] font-bold text-snow">{v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-cy/30 bg-cy/6 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[13px] font-bold text-cy"><Icon name="bolt" size={14} />{t("wz_vanity")}</div>
                      <button type="button" onClick={() => set({ vanityOn: !w.vanityOn })} className={`toggle ${w.vanityOn ? "on" : ""}`}><span className="knob block" /></button>
                    </div>
                    {w.vanityOn && (
                      <div className="fade-in mt-3">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="font-mono2 flex items-center gap-1 rounded-lg border border-gold bg-gold/12 px-3.5 py-1.5 text-xs font-bold text-gold2">…bbbb</span>
                          <span className="font-mono2 text-[10px] text-fog">– bbbb(固定)</span>
                        </div>
                        <p className="mt-1.5 text-[10.5px] text-fog">{t("wz_vanity_note")} · {t("wz_auto_verify_note")}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-fit rounded-2xl border border-line bg-panel2 p-5 text-center">
                  {/* avatar upload */}
                  <div className="mb-4">
                    {avatarPreview ? (
                      <div className="relative mx-auto" style={{ width: 54, height: 54 }}>
                        <img src={avatarPreview} alt="avatar" className="h-full w-full rounded-full border-2 border-gold/60 object-cover shadow-[0_0_18px_-4px_rgba(240,185,11,.5)]" />
                        <button onClick={() => { setAvatarFile(null); setAvatarPreview(""); }}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-rosey/60 bg-abyss text-rosey transition hover:bg-rosey hover:text-abyss">
                          <Icon name="close" size={10} />
                        </button>
                      </div>
                    ) : (
                      <label className={`mx-auto flex cursor-pointer flex-col items-center justify-center rounded-full border-2 border-dashed transition ${
                        avatarUploading ? "border-gold/40 bg-gold/8" : "border-line hover:border-gold/50 hover:bg-gold/5"
                      }`} style={{ width: 54, height: 54 }}>
                        {avatarUploading ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                        ) : (
                          <Icon name="plus" size={18} className="text-fog" />
                        )}
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (f.size > 2 * 1024 * 1024) { toast("头像文件不能超过 2MB", "warn"); return; }
                            setAvatarFile(f);
                            setAvatarPreview(URL.createObjectURL(f));
                          }} />
                      </label>
                    )}
                    <div className="mt-1 text-[9px] text-fog">头像 (可选)</div>
                  </div>
                  <CoinIcon sym={w.sym || "NEW"} color="#f0b90b" size={54} />
                  <div className="font-disp mt-3 text-lg font-bold text-snow">{w.name || "—"}</div>
                  <div className="text-[11px] text-fog">{t("wz_fee")}</div>
                  <div className="font-mono2 mt-1 text-2xl font-black text-mint">0 BNB · {t("wz_fee_free")}</div>

                  <button onClick={() => void doLaunch()} className="btn-gold mt-4 flex w-full items-center justify-center gap-2 py-3.5 text-[15px]">
                    <Icon name="rocket" size={17} /> {t("wz_launch")}
                  </button>
                </div>
              </div>
            )}
          </div>

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
