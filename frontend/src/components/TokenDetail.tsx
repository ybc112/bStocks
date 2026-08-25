import { useEffect, useMemo, useState } from "react";
import { assetOf, short } from "../data";
import type { Token } from "../data";
import { Contract, parseEther } from "ethers";
import { AreaChart, Bar, CoinIcon, CopyBtn, Icon, Modal, useI18n, useToast } from "./ui";
import { useWallet } from "./Header";
import { TOKEN_ABI, avatarUrl } from "../contracts";
import { addrLink, txLink } from "../web3";

function useCountdown(ts?: number) {
  const [left, setLeft] = useState(() => (ts ? ts * 1000 - Date.now() : 0));
  useEffect(() => {
    if (!ts) return;
    const id = setInterval(() => setLeft(Math.max(0, ts * 1000 - Date.now())), 1000);
    return () => clearInterval(id);
  }, [ts]);
  const s = Math.floor(left / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function TokenDetail({ token: tk, onClose, onMint }: { token: Token; onClose: () => void; onMint: (id: number, amt: number) => void }) {
  const { lang, t } = useI18n();
  const toast = useToast();
  const { addr, isBsc, getSigner } = useWallet();
  const [amt, setAmt] = useState(0.5);
  const [pending, setPending] = useState(false);
  const cd = useCountdown(tk.refundTs);
  const pool = assetOf(tk.pool);
  const pct = (tk.raised / tk.goal) * 100;
  const graduated = tk.raised >= tk.goal || tk.cat === "listed";
  const chartData = useMemo(() => [...tk.spark, ...tk.spark.slice(1).map((v) => v * (1 + Math.random() * 0.06))], [tk]);
  const mintable = tk.mintLive !== false && !graduated;

  const doMint = async () => {
    if (!addr) { toast(t("need_wallet"), "warn"); return; }
    if (!isBsc) { toast(t("wrong_chain"), "warn"); return; }
    if (amt <= 0 || pending) return;
    setPending(true);
    try {
      const signer = await getSigner();
      if (!signer) { toast(t("need_wallet"), "warn"); return; }
      const c = new Contract(tk.ca, TOKEN_ABI, signer);
      const v = parseEther(String(amt));
      const tx = await c.swapIn(v, { value: v });
      toast(`${t("dt_mint")} · ${t("tx_sent")}`);
      const rc = await tx.wait();
      if (rc?.status === 1) {
        onMint(tk.id, amt);
        toast(`${t("mint_ok")} · ${amt} BNB`);
      }
      if (rc?.transactionHash) window.open(txLink(rc.transactionHash), "_blank");
    } catch (e) {
      const msg = (e as Error).message || "";
      toast(msg.includes("user rejected") ? t("tx_rejected") : `${t("mint_fail")}: ${msg.slice(0, 100)}`, "warn");
    } finally {
      setPending(false);
    }
  };

  const mechs: { icon: string; label: string; val?: string }[] = [
    ...(tk.mech.burn > 0 ? [{ icon: "flame", label: t("mech_burn"), val: `${tk.mech.burn}%` }] : []),
    ...(tk.mech.mkt > 0 ? [{ icon: "gift", label: t("mech_mkt"), val: `${tk.mech.mkt}%` }] : []),
    { icon: "coins", label: t("mech_holder"), val: tk.mech.holder },
    ...(tk.mech.buyback > 0 ? [{ icon: "refresh", label: t("mech_buyback"), val: `${tk.mech.buyback}%` }] : []),
    ...(tk.mech.lp > 0 ? [{ icon: "drop", label: t("mech_lp"), val: `${tk.mech.lp}%` }] : []),
    ...(tk.mech.burndiv ? [{ icon: "fire", label: t("mech_burndiv") }] : []),
  ];

  const priceTxt = tk.mcapSym
    ? `${tk.price < 0.0001 && tk.price > 0 ? tk.price.toExponential(2) : tk.price.toFixed(6)} ${tk.pool}`
    : `$${tk.price.toFixed(6)}`;

  // check if avatar file exists on backend
  const avUrl = tk.avatar ? avatarUrl(tk.ca) : null;

  return (
    <Modal onClose={onClose} w="max-w-5xl">
      <div className="p-6 sm:p-8">
        {/* header */}
        <div className="flex flex-wrap items-start gap-4 pr-10">
          {avUrl ? (
            <img src={avUrl} alt={tk.sym}
              className="flex-none rounded-full border-2 border-gold/40 object-cover shadow-[0_0_18px_-4px_rgba(240,185,11,.5)]"
              style={{ width: 56, height: 56 }} />
          ) : (
            <CoinIcon sym={tk.sym} color={tk.color} size={56} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-disp text-2xl font-bold text-snow">{lang === "zh" ? tk.nameZh : tk.nameEn}</h2>
              <span className="font-mono2 text-sm text-fog">${tk.sym}</span>
              <span className="chip" style={{ borderColor: `${tk.color}55`, color: tk.color }}>
                {t("pool_label")}: {tk.pool}
              </span>
            </div>
            {(lang === "zh" ? tk.descZh : tk.descEn) && (
              <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-fog">{lang === "zh" ? tk.descZh : tk.descEn}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="chip"><span className="text-fog">{t("dt_ca")}</span><CopyBtn text={tk.ca} shortText={short(tk.ca)} /></span>
              {tk.dev && <span className="chip"><span className="text-fog">{t("dt_dev_addr")}</span><CopyBtn text={tk.dev} shortText={short(tk.dev)} /></span>}
              <a href={addrLink(tk.ca)} target="_blank" rel="noreferrer" className="rounded-lg border border-line p-1.5 text-fog transition hover:border-cy/60 hover:text-cy" title="BscScan">
                <Icon name="external" size={13} />
              </a>
              {(["x", "tg", "debox"] as const).map((s) => (
                <a key={s} href={s === "x" ? "https://x.com/bstocks_pad" : s === "tg" ? "https://t.me/bstocks_pad" : "https://debox.pro/bstocks"} target="_blank" rel="noreferrer"
                  className="rounded-lg border border-line p-1.5 text-fog transition hover:border-cy/60 hover:text-cy">
                  <Icon name={s} size={13} />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* left: chart + info */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-line bg-panel2/70 p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="font-mono2 text-2xl font-bold text-snow">{priceTxt}</div>
                  {tk.chg !== 0 && <span className={`font-mono2 text-sm font-bold ${tk.chg >= 0 ? "text-mint" : "text-rosey"}`}>{tk.chg >= 0 ? "+" : ""}{tk.chg}% · 24H</span>}
                </div>
                <div className="flex gap-5 text-right">
                  <div><div className="font-mono2 text-sm font-bold text-snow">{tk.mcap > 0 ? (tk.mcapSym ? `${(tk.mcap / 1e6).toFixed(2)}M ${tk.mcapSym}` : `$${(tk.mcap / 1e6).toFixed(2)}M`) : "—"}</div><div className="text-[10px] text-fog">{t("card_mcap")}</div></div>
                  <div><div className="font-mono2 text-sm font-bold text-snow">{tk.vol > 0 ? (tk.mcapSym ? `${(tk.vol / 1e6).toFixed(2)}M ${tk.mcapSym}` : `$${(tk.vol / 1e6).toFixed(2)}M`) : "—"}</div><div className="text-[10px] text-fog">{t("card_vol")}</div></div>
                  <div><div className="font-mono2 text-sm font-bold text-snow">{tk.holders > 0 ? tk.holders : "—"}</div><div className="text-[10px] text-fog">{t("card_holders")}</div></div>
                </div>
              </div>
              <div className="mt-4">
                <AreaChart data={chartData.length > 1 ? chartData : new Array(14).fill(1)} color={tk.chg >= 0 ? "#2ee6a8" : "#ff5c7a"} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5 text-[12px] sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
                  <div className="text-[10px] text-fog">{t("dt_supply")}</div>
                  <div className="font-mono2 mt-0.5 font-bold text-snow">{tk.supplyBase} ×10³⁰</div>
                </div>
                <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
                  <div className="text-[10px] text-fog">{t("dt_pool_ca")} · {pool.sym}</div>
                  <CopyBtn text={pool.addr} shortText={short(pool.addr)} />
                </div>
                <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
                  <div className="text-[10px] text-fog">{t("dt_listed")}</div>
                  <div className="font-mono2 mt-0.5 truncate font-bold text-mint">{tk.listAt ?? (graduated ? "PancakeSwap" : "—")}</div>
                </div>
              </div>
            </div>

            {/* taxes + mechanics */}
            <div className="rounded-2xl border border-line bg-panel2/70 p-5">
              <h4 className="font-disp text-sm font-bold text-snow">{t("dt_tax_title")}</h4>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {[
                  { l: t("dt_buy"), v: tk.tax.b, c: "#2ee6a8" },
                  { l: t("dt_sell"), v: tk.tax.s, c: "#ff5c7a" },
                  { l: t("dt_transfer"), v: tk.tax.t, c: "#38e1ff" },
                ].map((x) => (
                  <div key={x.l} className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-center" style={{ minWidth: 96 }}>
                    <div className="font-mono2 text-lg font-bold" style={{ color: x.c }}>{x.v}%</div>
                    <div className="text-[10.5px] text-fog">{x.l}</div>
                  </div>
                ))}
              </div>
              <h4 className="font-disp mt-5 text-sm font-bold text-snow">{t("dt_mech_title")}</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {mechs.map((m) => (
                  <span key={m.label} className="chip !border-line2 !py-1.5">
                    <Icon name={m.icon} size={13} className="text-gold" />
                    <span className="text-snow/85">{m.label}</span>
                    {m.val && <span className="font-mono2 font-bold text-gold2">{m.val}</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* right: mint panel */}
          <div className="h-fit rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/8 to-transparent p-5 lg:sticky lg:top-4">
            <div className="flex items-center justify-between">
              <h3 className="font-disp text-[15px] font-bold text-snow">{t("dt_mint")}</h3>
              {graduated ? (
                <span className="chip !border-mint/50 !text-mint"><Icon name="check" size={12} />{lang === "zh" ? "已毕业" : "Graduated"}</span>
              ) : tk.refundTs ? (
                <span className="chip !border-rosey/40 !text-rosey"><Icon name="clock" size={12} />{t("dt_refund_cd")} <span className="font-mono2 tick-pulse">{cd}</span></span>
              ) : (
                <span className="chip !border-cy/40 !text-cy"><Icon name="shield" size={12} />{t("refund_badge")}</span>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[11.5px]">
                <span className="text-fog">{t("card_goal")}</span>
                <span className="font-mono2 font-bold text-gold2">{tk.raised.toFixed(2)} / {tk.goal.toFixed(2)} BNB · {pct.toFixed(1)}%</span>
              </div>
              <Bar pct={pct} color={pct >= 100 ? "#2ee6a8" : "#f0b90b"} />
            </div>

            <div className="mt-5">
              <label className="text-[11.5px] font-semibold text-fog">{t("dt_amount")}</label>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line2 bg-abyss/60 px-3 py-2 focus-within:border-gold/60">
                <input
                  type="number" min={0.01} step={0.1} value={amt} disabled={!mintable}
                  onChange={(e) => setAmt(Math.max(0, +e.target.value))}
                  className="font-mono2 w-full bg-transparent text-lg font-bold text-snow disabled:opacity-40"
                />
                <span className="font-mono2 text-xs font-bold text-gold2">BNB</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {[0.1, 0.5, 1, 5].map((v) => (
                  <button key={v} onClick={() => setAmt(v)} disabled={!mintable}
                    className={`font-mono2 flex-1 rounded-lg border py-1.5 text-xs font-bold transition disabled:opacity-30 ${amt === v ? "border-gold bg-gold/15 text-gold2" : "border-line text-fog hover:border-gold/40 hover:text-gold2"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-panel/70 px-3.5 py-3">
              <div className="flex justify-between text-[11.5px] text-fog"><span>{t("dt_est")}</span></div>
              <div className="font-mono2 mt-1 text-[15px] font-bold text-gold2">≈ {(amt * tk.rate).toLocaleString()} {tk.sym}</div>
              <div className="mt-2 border-t border-line pt-2">
                <div className="mb-1 text-[10.5px] text-fog">{t("dt_split")} · {t("dt_rules")}: {t(`mode_${tk.mode}` as never)}</div>
                <div className="flex h-2.5 overflow-hidden rounded-full">
                  <div className="bg-gradient-to-r from-gold/70 to-gold" style={{ width: `${tk.poolRatio}%` }} />
                  <div className="bg-line2" style={{ width: `${100 - tk.poolRatio}%` }} />
                </div>
                <div className="font-mono2 mt-1.5 flex justify-between text-[10px]">
                  <span className="text-gold2">{t("dt_to_lp")} {tk.poolRatio}%</span>
                  <span className="text-fog">{t("dt_to_dev")} {100 - tk.poolRatio}%</span>
                </div>
              </div>
            </div>

            <button onClick={() => void doMint()} disabled={!mintable || pending}
              className="btn-gold mt-4 flex w-full items-center justify-center gap-2 py-3.5 text-[15px] disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50">
              {pending ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-abyss/40 border-t-abyss" /> {t("tx_pending")}</>
              ) : (
                <><Icon name="bolt" size={17} /> {graduated ? t("dt_listed") : t("dt_mint_btn")}</>
              )}
            </button>
            {!graduated && <p className="mt-2.5 text-center text-[10.5px] text-fog">{t("radar_note2")}</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}