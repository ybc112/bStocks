export type PoolAsset = { sym: string; name: string; nameEn: string; addr: string; color: string };

export const POOL_ASSETS: PoolAsset[] = [
  { sym: "BNB", name: "BNB", nameEn: "BNB Chain", addr: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", color: "#F0B90B" },
  { sym: "USDT", name: "泰达美元", nameEn: "Tether USD", addr: "0x55d398326f99059ff775485246999027b3197955", color: "#26A17B" },
  { sym: "USD1", name: "USD1 稳定币", nameEn: "USD1 Stable", addr: "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d", color: "#3D7BFF" },
  { sym: "SPCXB", name: "SpaceX 镜像", nameEn: "SpaceX Mirror", addr: "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1", color: "#5CC8FF" },
  { sym: "SKHYB", name: "SK 海力士镜像", nameEn: "SK Hynix Mirror", addr: "0xca750ef65f295bbecd685abf54e82caf297bdb61", color: "#E8465A" },
  { sym: "SPYB", name: "标普500镜像", nameEn: "S&P 500 Mirror", addr: "0x7138b48df7d98d7e3cc221bfe7192d0a178182d8", color: "#2FBF71" },
  { sym: "XAUT", name: "Tether 黄金", nameEn: "Tether Gold", addr: "0x21caef8a43163eea865baee23b9c2e327696a3bf", color: "#D4AF37" },
  { sym: "QQQB", name: "纳指100镜像", nameEn: "Nasdaq 100 Mirror", addr: "0x205812cdbed920aff76c6580abd681a46d11efc7", color: "#9B6BFF" },
  { sym: "NVDAB", name: "英伟达镜像", nameEn: "NVIDIA Mirror", addr: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", color: "#76B900" },
  { sym: "AAPLB", name: "苹果镜像", nameEn: "Apple Mirror", addr: "0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a", color: "#A8B4C4" },
  { sym: "TSLAB", name: "特斯拉镜像", nameEn: "Tesla Mirror", addr: "0x5b1910eaad6450e50f816082aa078c41f10c292f", color: "#E82127" },
  { sym: "MFSTB", name: "微软镜像", nameEn: "Microsoft Mirror", addr: "0x80106cb3ead06659a5ad19df39d9b4733863b9b0", color: "#00A4EF" },
  { sym: "GOOGLB", name: "谷歌镜像", nameEn: "Google Mirror", addr: "0x3f53de71c126bdabae20f9cd64848d317f6c3238", color: "#4285F4" },
  { sym: "BABAB", name: "阿里镜像", nameEn: "Alibaba Mirror", addr: "0x4ef9d3062c7f6eba4aae4990c5036598c6eff4ec", color: "#FF6A00" },
  { sym: "GMEB", name: "GameStop 镜像", nameEn: "GameStop Mirror", addr: "0x46ceefda28dd7207059ed19b0acdc026955bb15c", color: "#FF3E55" },
  { sym: "BTCB", name: "比特币 BEP20", nameEn: "Bitcoin BEP20", addr: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", color: "#F7931A" },
  { sym: "ETH", name: "以太坊 BEP20", nameEn: "Ethereum BEP20", addr: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", color: "#627EEA" },
];

export const assetOf = (sym: string) => POOL_ASSETS.find((a) => a.sym === sym)!;

export type MintMode = "public" | "wl" | "time" | "cap";
export type Cat = "new" | "grad" | "listed" | "hot";

export type Token = {
  id: number; sym: string; nameZh: string; nameEn: string; descZh: string; descEn: string;
  cat: Cat; raised: number; goal: number; mcap: number; vol: number; holders: number;
  price: number; chg: number; pool: string; mode: MintMode; poolRatio: number;
  tax: { b: number; s: number; t: number }; supplyBase: string;
  ca: string; dev: string; deadlineH: number; listAt?: string; color: string;
  mech: { burn: number; mkt: number; holder: string; buyback: number; lp: number; burndiv: boolean; dv?: number; divId?: number };
  spark: number[];
  refundTs?: number;
  mintLive?: boolean;
  mcapSym?: string;
  avatar?: string;
  twitter?: string;
  tg?: string;
  creator?: string;
  createdAt?: number;
};

export type Ad = { id: number; tag: { zh: string; en: string }; t: { zh: string; en: string }; d: { zh: string; en: string }; to: string; art: "orbit" | "pool" | "zeros" | "tree"; from: string; to2: string };

export const ADS: Ad[] = [
  {
    id: 1, tag: { zh: "限时活动", en: "EVENT" }, t: { zh: "Season 2 · 交易挖矿开启", en: "Season 2 · Trade Mining Live" },
    d: { zh: "广场交易即挖 BSTK,交易量越高挖得越多,每周快照空投。", en: "Trade on the board to mine BSTK — the more volume, the more mined. Weekly snapshot airdrop." },
    to: "#board", art: "orbit", from: "rgba(240,185,11,.16)", to2: "rgba(240,185,11,0)" },
  {
    id: 2, tag: { zh: "平台分红", en: "REVENUE" }, t: { zh: "税收代币化 · 持 10,000 BSTK 分享平台税", en: "Tokenized Tax · Hold 10,000 BSTK to share platform revenue" },
    d: { zh: "平台税点的 20% 拆分:15% 社区维护 + 5% 推广返佣,社区维护费注入平台分红池,按 BSTK 持仓比例发放。", en: "Platform's 20% tax cut: 15% community + 5% referral. Community portion flows to the dividend pool, paid pro-rata to BSTK holders." },
    to: "#mech", art: "pool", from: "rgba(46,230,168,.15)", to2: "rgba(46,230,168,0)" },
  {
    id: 3, tag: { zh: "发射福利", en: "LAUNCH" }, t: { zh: "30 个零免费发射 · 毕业门槛最低 0.01 BNB", en: "Free 30-zero launch · graduation from 0.1 BNB" },
    d: { zh: "Mint 实入池,未打满 24 小时可退款,项目方零成本试错。", en: "Mint funds go to real LP; 24h refund if not filled — zero-cost trial for creators." },
    to: "#create", art: "zeros", from: "rgba(56,225,255,.14)", to2: "rgba(56,225,255,0)" },
  {
    id: 4, tag: { zh: "推广计划", en: "REFERRAL" }, t: { zh: "两级返佣 · 一代 3% 二代 2%", en: "Two-tier rebates · 3% + 2%" },
    d: { zh: "下级每笔交易手续费实时返佣,推广达人榜每周额外奖励。", en: "Realtime rebates from every referee trade; weekly bonuses for top promoters." },
    to: "#ref", art: "tree", from: "rgba(255,92,122,.14)", to2: "rgba(255,92,122,0)" },
];

export const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export const fmtNum = (n: number): string => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(n < 10 ? 2 : 0);
};

export const fmtBnb = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));