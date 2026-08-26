import { useState } from "react";
import { Contract } from "ethers";
import { Icon, SectionHead, useI18n, useToast } from "./ui";
import { useWallet } from "./Header";
import { FACTORY_ABI, resolveFactoryAddress } from "../contracts";

export default function Mechanics() {
  const { lang, t } = useI18n();
  const toast = useToast();
  const { addr, isBsc, getSigner } = useWallet();
  const [busy, setBusy] = useState(false);
  const claim = async () => {
    if (!addr) return toast(t("need_wallet"), "warn");
    if (!isBsc) return toast(t("wrong_chain"), "warn");
    setBusy(true);
    try {
      const signer = await getSigner();
      const fa = await resolveFactoryAddress();
      if (!signer || !fa) throw new Error("factory unavailable");
      const tx = await new Contract(fa, FACTORY_ABI, signer).claimPlatformDiv();
      toast(t("tx_sent"));
      await tx.wait();
      toast(t("claim_ok"));
    } catch (e) {
      toast(`${t("mint_fail")}: ${(e as Error).message.slice(0, 90)}`, "warn");
    } finally { setBusy(false); }
  };
  return (
    <section id="mech" className="scroll-mt-20 py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHead kicker={lang === "zh" ? "BSTK 股东分红" : "BSTK SHAREHOLDER DIVIDENDS"} title={lang === "zh" ? "股东分红" : "Shareholder dividends"} sub={lang === "zh" ? "持有 10,000 BSTK 可参与平台交易税分红。" : "Hold 10,000 BSTK to participate in platform trading-tax dividends."} />
        <div className="rounded-2xl border border-gold/30 bg-panel p-7 text-center">
          <Icon name="coins" size={34} className="mx-auto text-gold" />
          <h3 className="mt-4 font-disp text-xl font-bold text-snow">BSTK · BSC</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-fog">{lang === "zh" ? "平台将交易税收入的一部分注入 BSTK 分红池，满足最低持仓后可随时领取。" : "A portion of platform trading-tax income funds the BSTK dividend pool. Eligible holders can claim at any time."}</p>
          <button onClick={() => void claim()} disabled={busy} className="btn-gold mt-6 inline-flex items-center gap-2 px-8 py-3 disabled:opacity-50"><Icon name="gift" size={16} />{busy ? "..." : (lang === "zh" ? "领取 BSTK 分红" : "Claim BSTK dividends")}</button>
        </div>
      </div>
    </section>
  );
}
