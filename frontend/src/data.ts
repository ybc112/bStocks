export type PoolAsset = { sym: string; name: string; nameEn: string; addr: string; color: string };

export const POOL_ASSETS: PoolAsset[] = [
  { sym: "BNB", name: "币安币", nameEn: "BNB Chain", addr: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", color: "#F0B90B" },
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

const sp = (a: number[]) => a;

export const TOKENS: Token[] = [
  {
    id: 1, sym: "NVDR", nameZh: "英伟达火箭", nameEn: "NVDIA Rocket", descZh: "致敬 AI 算力之王,持有共享算力叙事红利,自动回购销毁通缩。", descEn: "Tribute to the AI compute king — holder dividends plus auto buyback-burn deflation.",
    cat: "hot", raised: 28.6, goal: 30, mcap: 4_820_000, vol: 1_284_000, holders: 3412, price: 0.00482, chg: 38.6, pool: "NVDAB", mode: "public", poolRatio: 80,
    tax: { b: 5, s: 5, t: 1 }, supplyBase: "10亿", ca: "0x8f3a91c2d4e6b7081a2c3d4e5f60718293a4b5c6", dev: "0x3fa10293bc4d5e6f708192a3b4c5d6e7f8091a2b", deadlineH: 6, color: "#76B900",
    mech: { burn: 2, mkt: 1, holder: "USDT", buyback: 1.5, lp: 0.5, burndiv: true },
    spark: sp([12, 14, 13, 17, 19, 18, 22, 26, 24, 29, 34, 38, 36, 42]),
  },
  {
    id: 2, sym: "MDOG", nameZh: "月球狗", nameEn: "Moon Dog", descZh: "社区驱动 MEME,白名单 Mint 已打满 87%,毕业在即。", descEn: "Community meme — whitelist mint 87% filled, graduation imminent.",
    cat: "grad", raised: 17.4, goal: 20, mcap: 960_000, vol: 312_000, holders: 1820, price: 0.00096, chg: 22.4, pool: "USDT", mode: "wl", poolRatio: 85,
    tax: { b: 3, s: 3, t: 0 }, supplyBase: "1亿", ca: "0x2b4c6d8e0f1a2b3c4d5e6f7081920a1b2c3d4e5f", dev: "0x9c8b7a605f4e3d2c1b0a9f8e7d6c5b4a39281706", deadlineH: 9, color: "#38E1FF",
    mech: { burn: 1, mkt: 1, holder: "BNB", buyback: 0, lp: 1, burndiv: false },
    spark: sp([20, 22, 21, 25, 24, 27, 26, 30, 33, 31, 35, 37, 34, 43]),
  },
  {
    id: 3, sym: "BAIX", nameZh: "bStocks AI", nameEn: "bStocks AI", descZh: "平台首个 AI 代理叙事代币,毕业 4 小时即上所,交易量飙升。", descEn: "First AI-agent narrative on the pad — listed 4h after graduation, volume soaring.",
    cat: "listed", raised: 50, goal: 50, mcap: 8_940_000, vol: 2_410_000, holders: 5210, price: 0.00894, chg: 126.8, pool: "BNB", mode: "time", poolRatio: 90,
    tax: { b: 6, s: 8, t: 2 }, supplyBase: "10亿", ca: "0x7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6b5a4", dev: "0x1a2b3c4d5e6f708192a3b4c5d6e7f80910a1b2c3", deadlineH: 0, listAt: "PancakeSwap · 4h ago", color: "#9B6BFF",
    mech: { burn: 3, mkt: 2, holder: "本币", buyback: 2, lp: 1, burndiv: true },
    spark: sp([8, 10, 9, 12, 16, 15, 21, 28, 26, 33, 41, 39, 48, 56]),
  },
  {
    id: 4, sym: "JZBX", nameZh: "韭菜盒子", nameEn: "Leek Box", descZh: "韭菜的自我修养,限量 Mint 每钱包最多 0.5 BNB,燃烧分红池已开启。", descEn: "Leek self-cultivation — capped mint 0.5 BNB/wallet, burn-dividend pool live.",
    cat: "new", raised: 2.1, goal: 5, mcap: 180_000, vol: 46_000, holders: 342, price: 0.00018, chg: -4.2, pool: "BNB", mode: "cap", poolRatio: 75,
    tax: { b: 4, s: 4, t: 1 }, supplyBase: "2100万", ca: "0x5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1", dev: "0x4d5e6f7081920a1b2c3d4e5f60718293a4b5c6d7", deadlineH: 21, color: "#2EE6A8",
    mech: { burn: 1, mkt: 0, holder: "BNB", buyback: 0, lp: 0, burndiv: true },
    spark: sp([15, 14, 16, 13, 15, 12, 14, 11, 13, 12, 10, 12, 11, 10]),
  },
  {
    id: 5, sym: "PBURN", nameZh: "熊猫燃烧", nameEn: "Panda Burn", descZh: "每笔交易 2% 直接进黑洞,烧得越多分红越多,通缩飞轮。", descEn: "2% of every trade to the black hole — the more burned, the more dividends.",
    cat: "hot", raised: 30, goal: 30, mcap: 3_150_000, vol: 890_000, holders: 2764, price: 0.00315, chg: 18.9, pool: "BTCB", mode: "public", poolRatio: 82,
    tax: { b: 5, s: 7, t: 2 }, supplyBase: "1亿", ca: "0x6f5e4d3c2b1a0f9e8d7c6b5a49382716f5e4d3c2", dev: "0x0f9e8d7c6b5a4938271605f4e3d2c1b0a9f8e7d6", deadlineH: 0, listAt: "PancakeSwap · 1d ago", color: "#FF5C7A",
    mech: { burn: 2, mkt: 1, holder: "BTCB", buyback: 1, lp: 0, burndiv: true },
    spark: sp([10, 12, 11, 14, 16, 15, 18, 17, 21, 20, 24, 23, 27, 29]),
  },
  {
    id: 6, sym: "XGOLD", nameZh: "黄金矿工", nameEn: "Gold Miner", descZh: "底池锚定 XAUT 黄金,毕业即锁金池,抗跌叙事首选。", descEn: "LP anchored to XAUT gold — golden pool locked on graduation.",
    cat: "grad", raised: 8.6, goal: 10, mcap: 540_000, vol: 128_000, holders: 903, price: 0.00054, chg: 9.6, pool: "XAUT", mode: "time", poolRatio: 88,
    tax: { b: 3, s: 3, t: 0 }, supplyBase: "1000万", ca: "0x8a9b0c1d2e3f405162738495061728394a5b6c7d", dev: "0x7b8c9d0e1f203142536475869708192a3b4c5d6e", deadlineH: 4, color: "#D4AF37",
    mech: { burn: 1, mkt: 1, holder: "XAUT", buyback: 0.5, lp: 1, burndiv: false },
    spark: sp([9, 10, 10, 12, 11, 13, 12, 14, 15, 14, 16, 17, 16, 18]),
  },
  {
    id: 7, sym: "TTURBO", nameZh: "特斯拉涡轮", nameEn: "Tesla Turbo", descZh: "马斯克概念加速版,毕业 26 小时,外盘深度已超 40 BNB。", descEn: "Musk narrative turbocharged — 26h since graduation, 40+ BNB DEX depth.",
    cat: "listed", raised: 25, goal: 25, mcap: 2_730_000, vol: 704_000, holders: 2109, price: 0.00273, chg: -6.4, pool: "TSLAB", mode: "public", poolRatio: 80,
    tax: { b: 5, s: 5, t: 1 }, supplyBase: "10亿", ca: "0x1c2d3e4f506172839405162738495a6b7c8d9e0f", dev: "0x2e3f405162738495a6b7c8d9e0f10213a4b5c6d7", deadlineH: 0, listAt: "PancakeSwap · 26h ago", color: "#E82127",
    mech: { burn: 2, mkt: 2, holder: "TSLAB", buyback: 1, lp: 0.5, burndiv: false },
    spark: sp([30, 34, 32, 38, 36, 40, 37, 35, 33, 36, 32, 30, 31, 29]),
  },
  {
    id: 8, sym: "QSYD", nameZh: "量子鱿鱼", nameEn: "Quantum Squid", descZh: "限时 48 小时 Mint,超时未打满 24 小时内全额退款,零风险试错。", descEn: "48h timed mint — full refund within 24h if not filled. Zero-risk trial.",
    cat: "new", raised: 0.8, goal: 3, mcap: 96_000, vol: 18_000, holders: 129, price: 0.000096, chg: 12.1, pool: "ETH", mode: "time", poolRatio: 70,
    tax: { b: 2, s: 2, t: 0 }, supplyBase: "1亿", ca: "0x9e0f10213a4b5c6d7e8f90a1b2c3d4e5f6071829", dev: "0x5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182", deadlineH: 41, color: "#3D7BFF",
    mech: { burn: 0, mkt: 1, holder: "BNB", buyback: 0, lp: 0, burndiv: false },
    spark: sp([5, 6, 6, 7, 6, 8, 7, 9, 8, 10, 9, 11, 10, 12]),
  },
  {
    id: 9, sym: "GCAT", nameZh: "银河猫", nameEn: "Galaxy Cat", descZh: "猫系 MEME 顶流预备役,持币分红 USDT,门槛仅 10 万枚。", descEn: "Cat meme contender — USDT holder dividends, threshold only 100K tokens.",
    cat: "grad", raised: 13.9, goal: 15, mcap: 1_120_000, vol: 286_000, holders: 1653, price: 0.00112, chg: 31.2, pool: "USD1", mode: "public", poolRatio: 84,
    tax: { b: 4, s: 6, t: 1 }, supplyBase: "10亿", ca: "0x0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d", dev: "0x6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9", deadlineH: 7, color: "#FF9F43",
    mech: { burn: 1, mkt: 1, holder: "USDT", buyback: 1, lp: 1, burndiv: true },
    spark: sp([14, 16, 15, 18, 20, 19, 23, 22, 26, 25, 29, 31, 30, 34]),
  },
  {
    id: 10, sym: "DSXB", nameZh: "深 seek 鲸鱼", nameEn: "DeepSeek Whale", descZh: "国产大模型叙事,交易量连续 3 日热搜第一,回购销毁不停。", descEn: "Homegrown LLM narrative — #1 trending 3 days straight, buyback-burn nonstop.",
    cat: "hot", raised: 42, goal: 42, mcap: 6_480_000, vol: 1_930_000, holders: 4481, price: 0.00648, chg: 54.3, pool: "QQQB", mode: "wl", poolRatio: 86,
    tax: { b: 6, s: 6, t: 2 }, supplyBase: "10亿", ca: "0x3b4c5d6e7f80910a1b2c3d4e5f6071829a3b4c5d", dev: "0x8d9e0f10a1b2c3d4e5f60718293a4b5c6d7e8f90", deadlineH: 0, listAt: "PancakeSwap · 3d ago", color: "#00A4EF",
    mech: { burn: 3, mkt: 2, holder: "本币", buyback: 2.5, lp: 1, burndiv: true },
    spark: sp([18, 22, 21, 26, 30, 28, 35, 40, 38, 45, 52, 50, 58, 64]),
  },
  {
    id: 11, sym: "LGMB", nameZh: "老干妈辣酱", nameEn: "LaoGanMa Hot", descZh: "国民辣酱上链,限量 888 份 Mint,白名单优先,辣度即涨幅。", descEn: "The national hot sauce on-chain — 888 capped mints, whitelist first.",
    cat: "new", raised: 4.4, goal: 8.8, mcap: 320_000, vol: 74_000, holders: 511, price: 0.00032, chg: 6.8, pool: "BABAB", mode: "cap", poolRatio: 78,
    tax: { b: 5, s: 5, t: 0 }, supplyBase: "8888万", ca: "0x4c5d6e7f80910a1b2c3d4e5f607182930a4b5c6d", dev: "0x1b2c3d4e5f607182930a4b5c6d7e8f90a1b2c3d4", deadlineH: 15, color: "#E8465A",
    mech: { burn: 2, mkt: 1, holder: "本币", buyback: 0, lp: 0.5, burndiv: true },
    spark: sp([8, 9, 8, 11, 10, 12, 13, 12, 14, 13, 15, 16, 15, 17]),
  },
  {
    id: 12, sym: "SFISH", nameZh: "中本聪鱼", nameEn: "Satoshi Fish", descZh: "毕业 52 小时,底池 ETH 对,持币分红门槛 5 万枚,鱼群持续扩大。", descEn: "52h since graduation — ETH pool pair, holder dividend threshold 50K.",
    cat: "listed", raised: 18, goal: 18, mcap: 1_540_000, vol: 421_000, holders: 1988, price: 0.00154, chg: 11.4, pool: "ETH", mode: "public", poolRatio: 82,
    tax: { b: 4, s: 4, t: 1 }, supplyBase: "10亿", ca: "0x5d6e7f80910a1b2c3d4e5f6071829304a5b6c7d8", dev: "0x2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f", deadlineH: 0, listAt: "PancakeSwap · 52h ago", color: "#2EE6A8",
    mech: { burn: 1, mkt: 1, holder: "ETH", buyback: 0.5, lp: 1, burndiv: false },
    spark: sp([11, 12, 14, 13, 15, 14, 17, 16, 18, 19, 18, 20, 21, 22]),
  },
  {
    id: 13, sym: "RFUEL", nameZh: "火箭燃料", nameEn: "Rocket Fuel", descZh: "毕业进度 96%,最后一把火,加池分红 SPYB 底池代币。", descEn: "96% to graduation — one last push. LP dividends paid in SPYB.",
    cat: "grad", raised: 11.5, goal: 12, mcap: 880_000, vol: 205_000, holders: 1240, price: 0.00088, chg: 15.7, pool: "SPYB", mode: "public", poolRatio: 80,
    tax: { b: 3, s: 5, t: 1 }, supplyBase: "10亿", ca: "0x6e7f80910a1b2c3d4e5f607182930415a6b7c8d9", dev: "0x3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60", deadlineH: 2, color: "#F0B90B",
    mech: { burn: 1, mkt: 1, holder: "SPYB", buyback: 1, lp: 1.5, burndiv: false },
    spark: sp([16, 18, 17, 20, 22, 21, 24, 26, 25, 28, 30, 29, 32, 35]),
  },
  {
    id: 14, sym: "CSDAO", nameZh: "财神到", nameEn: "God of Wealth", descZh: "开盘即热搜,燃烧分红 + 回购双通缩,春节行情发动机。", descEn: "Trending since open — burn dividends + buyback double deflation.",
    cat: "hot", raised: 36, goal: 36, mcap: 5_260_000, vol: 1_466_000, holders: 3876, price: 0.00526, chg: 42.1, pool: "BTCB", mode: "wl", poolRatio: 88,
    tax: { b: 6, s: 8, t: 2 }, supplyBase: "8888万", ca: "0x7f80910a1b2c3d4e5f60718293041526a7b8c9d0", dev: "0x4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071", deadlineH: 0, listAt: "PancakeSwap · 8h ago", color: "#FF6A00",
    mech: { burn: 3, mkt: 2, holder: "BTCB", buyback: 2, lp: 1, burndiv: true },
    spark: sp([22, 26, 24, 30, 34, 32, 38, 44, 42, 48, 54, 52, 60, 66]),
  },
  {
    id: 15, sym: "SKYB", nameZh: "海力士风暴", nameEn: "Hynix Storm", descZh: "HBM 存储叙事镜像 SKHYB 底池,刚创建 2 小时,早鸟白名单开放。", descEn: "HBM memory narrative on SKHYB pool — created 2h ago, early WL open.",
    cat: "new", raised: 0.4, goal: 6, mcap: 66_000, vol: 9_000, holders: 87, price: 0.000066, chg: 0, pool: "SKHYB", mode: "wl", poolRatio: 76,
    tax: { b: 4, s: 4, t: 1 }, supplyBase: "1000万", ca: "0x80910a1b2c3d4e5f6071829304152637a8b9c0d1", dev: "0x5f60718293a4b5c6d7e8f90a1b2c3d4e5f607182", deadlineH: 46, color: "#5CC8FF",
    mech: { burn: 1, mkt: 1, holder: "SKHYB", buyback: 0, lp: 0.5, burndiv: false },
    spark: sp([4, 5, 5, 6, 5, 7, 6, 8, 7, 8, 9, 8, 9, 10]),
  },
  {
    id: 16, sym: "GMEW", nameZh: "散户起义", nameEn: "Ape Rebellion", descZh: "致敬 GME 史诗级逼空,镜像 GMEB 底池,限量 1 万份,手慢无。", descEn: "Salute to the GME squeeze — GMEB pool, 10K capped mints, act fast.",
    cat: "listed", raised: 20, goal: 20, mcap: 2_180_000, vol: 566_000, holders: 2419, price: 0.00218, chg: -12.5, pool: "GMEB", mode: "cap", poolRatio: 80,
    tax: { b: 5, s: 7, t: 1 }, supplyBase: "10亿", ca: "0x910a1b2c3d4e5f607182930415263748b9c0d1e2", dev: "0x6071829304a5b6c7d8e9f0a1b2c3d4e5f6071829", deadlineH: 0, listAt: "PancakeSwap · 2d ago", color: "#FF3E55",
    mech: { burn: 2, mkt: 1, holder: "GMEB", buyback: 1.5, lp: 0.5, burndiv: true },
    spark: sp([28, 32, 30, 27, 31, 26, 24, 27, 23, 25, 22, 24, 21, 22]),
  },
];

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
    id: 3, tag: { zh: "发射福利", en: "LAUNCH" }, t: { zh: "30 个零免费发射 · 毕业门槛最低 0.1 BNB", en: "Free 30-zero launch · graduation from 0.1 BNB" },
    d: { zh: "Mint 实入池,未打满 24 小时可退款,项目方零成本试错。", en: "Mint funds go to real LP; 24h refund if not filled — zero-cost trial for creators." },
    to: "#create", art: "zeros", from: "rgba(56,225,255,.14)", to2: "rgba(56,225,255,0)" },
  {
    id: 4, tag: { zh: "推广计划", en: "REFERRAL" }, t: { zh: "两级返佣 · 一代 3% 二代 2%", en: "Two-tier rebates · 3% + 2%" },
    d: { zh: "下级每笔交易手续费实时返佣,推广达人榜每周额外奖励。", en: "Realtime rebates from every referee trade; weekly bonuses for top promoters." },
    to: "#ref", art: "tree", from: "rgba(255,92,122,.14)", to2: "rgba(255,92,122,0)" },
];

export const LEADERBOARD = [
  { addr: "0x8f3a…c5d6", team: 342, rebate: 18.4 },
  { addr: "0x2b4c…4e5f", team: 289, rebate: 14.1 },
  { addr: "0x7d6c…b5a4", team: 204, rebate: 11.7 },
  { addr: "0x5e4d…d2c1", team: 156, rebate: 8.2 },
  { addr: "0x6f5e…d3c2", team: 121, rebate: 6.9 },
];

export const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export const fmtNum = (n: number): string => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(n < 10 ? 2 : 0);
};

export const fmtBnb = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));

export const randAddr = () => {
  const hex = "0123456789abcdef";
  let s = "0x";
  for (let i = 0; i < 4; i++) s += hex[Math.floor(Math.random() * 16)];
  s += "…";
  for (let i = 0; i < 4; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
};