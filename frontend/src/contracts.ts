import { Contract, Interface, formatUnits, id, keccak256, AbiCoder } from "ethers";
import type { JsonRpcProvider, BrowserProvider } from "ethers";
import { readOnlyProvider } from "./web3";
import { POOL_ASSETS } from "./data";
import type { Token } from "./data";

/* ---------------- env config ---------------- */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string) || "https://bstocks-api.kimi-vault.com";
export const ENV_FACTORY: string = "0x8552648110Bd1792386CCCD8b5d24102C41DFb12";

export const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
export const PANCAKE_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";

let cachedFactory = ENV_FACTORY;

export async function resolveFactoryAddress(): Promise<string> {
  if (cachedFactory) return cachedFactory;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`${API_BASE}/api/config`, { signal: ctl.signal });
    clearTimeout(timer);
    const j = (await r.json()) as { factoryAddress?: string };
    if (j.factoryAddress && /^0x[0-9a-fA-F]{40}$/.test(j.factoryAddress)) {
      cachedFactory = j.factoryAddress;
      return cachedFactory;
    }
  } catch { /* backend offline */ }
  return "";
}

/* ---------------- ABIs ---------------- */
export const FACTORY_ABI = [
  "function owner() view returns (address)",
  "function deployer() view returns (address)",
  "function router() view returns (address)",
  "function factoryERC20() view returns (address)",
  "function WBNB() view returns (address)",
  "function projects(uint256) view returns (address)",
  "function isProject(address) view returns (bool)",
  "function baseTokenWhitelist(address) view returns (bool)",
  "function tokenCreator(address) view returns (address)",
  "function registered(address) view returns (bool)",
  "function parentOf(address) view returns (address)",
  "function communityPool() view returns (uint256)",
  "function launchProjectDeterministic(string,string,address,address,address,bytes32,address) returns (address)",
  "function predictTokenAddress(string,string,address,address,address,bytes32) view returns (address)",
  "function configMint(address,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
  "function configTax(address,uint256,uint256,uint256)",
  "function configFeeSplit(address,uint256,uint256,uint256)",
  "function configDiv(address,uint8,address,uint256,bool)",
  "function configWhitelist(address,address[],bool)",
  "function register(address)",
  "function claimPlatformDiv()",
  "event ProjectLaunched(address indexed token, address indexed dev, address baseToken)",
  "event ProjectLaunched2(address indexed token, address indexed dev, address indexed baseToken, bytes32 salt, bool deterministic, string name, string symbol)",
];

export const DEPLOYER_ABI = ["function commitSalt(bytes32)", "function predictAddress(string,string,address,address,address,address,bytes32) view returns (address)"];

export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function capBNB() view returns (uint256)",
  "function totalMintedBNB() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function mintEnabled() view returns (bool)",
  "function mintCapped() view returns (bool)",
  "function whitelistOnly() view returns (bool)",
  "function mintRate() view returns (uint256)",
  "function poolPercent() view returns (uint256)",
  "function buyTax() view returns (uint256)",
  "function sellTax() view returns (uint256)",
  "function transferTax() view returns (uint256)",
  "function baseToken() view returns (address)",
  "function pair() view returns (address)",
  "function devWallet() view returns (address)",
  "function refundDeadline() view returns (uint256)",
  "function mintEnd() view returns (uint256)",
  "function marketingShare() view returns (uint256)",
  "function buyBackShare() view returns (uint256)",
  "function liquidityShare() view returns (uint256)",
  "function divInfo(uint8) view returns (bool enabled, address rewardToken, uint256 minEligible, uint256 accPerShare, uint256 totalShares, uint256 pendingReward)",
  "function swapIn(uint256 bnbAmount) payable",
];

const PAIR_ABI = ["function token0() view returns (address)", "function getReserves() view returns (uint112, uint112, uint32)"];

/* ---------------- contract handles ---------------- */
export const factoryIface = new Interface(FACTORY_ABI);
export const tokenIface = new Interface(TOKEN_ABI);
export const pairIface = new Interface(PAIR_ABI);

export function factoryContract(provider: JsonRpcProvider | BrowserProvider, addr?: string) {
  return new Contract(addr || cachedFactory, FACTORY_ABI, provider);
}

export function tokenContract(addr: string, provider: JsonRpcProvider | BrowserProvider) {
  return new Contract(addr, TOKEN_ABI, provider);
}

/* ---------------- commit-reveal helper (matches contract abi.encode) ---------------- */
export function computeCommitment(user: string, salt: string, name: string, symbol: string, baseToken: string): string {
  return keccak256(AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "string", "string", "address"],
    [user, salt, name, symbol, baseToken]
  ));
}

/* ---------------- backend API ---------------- */
export type VanityResult = { found: boolean; salt?: string; address?: string; attempts?: number; elapsed?: string; message?: string };

export async function vanitySearch(suffix: string, deployer: string, constructorArgs?: string[], maxAttempts = 200000): Promise<VanityResult> {
  const r = await fetch(`${API_BASE}/api/vanity/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suffix, deployer, maxAttempts, constructorArgs }),
  });
  if (!r.ok) throw new Error(`vanity api ${r.status}`);
  return (await r.json()) as VanityResult;
}

export type VerifyResult = { tokenAddress: string; verificationStatus: string; verificationGuid: string | null; verificationError?: string | null; error?: string };

export async function verifySubmit(payload: {
  tokenAddress: string; name: string; symbol: string; router: string; factory: string; dev: string; marketing: string; baseToken: string;
}): Promise<VerifyResult> {
  const r = await fetch(`${API_BASE}/api/verify/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = (await r.json()) as VerifyResult;
  if (!r.ok) throw new Error(j.error || `verify api ${r.status}`);
  return j;
}

/* ---------------- avatar upload API ---------------- */
export async function uploadAvatar(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/upload/avatar`, { method: "POST", body: fd });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || `upload avatar api ${r.status}`);
  }
  const j = (await r.json()) as { url: string };
  return j.url;
}

export async function linkAvatar(tokenAddress: string, avatarUrl: string): Promise<string> {
  const r = await fetch(`${API_BASE}/api/avatar/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokenAddress, avatarUrl }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || `link avatar api ${r.status}`);
  }
  const j = (await r.json()) as { url: string };
  return j.url;
}

export function avatarUrl(tokenAddress: string): string {
  return `${API_BASE}/api/avatars/${tokenAddress.toLowerCase()}.webp`;
}

/* ---------------- multicall (Multicall3 on BSC) ---------------- */
const MC3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const mcIface = new Interface(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns (bool[] success, bytes[] returnData)"]);

// Multicall3 response decoding has proven unreliable against the testnet RPC
// under ethers v6 (both decodeFunctionResult and AbiCoder overflow on the nested
// dynamic bytes[]). Fall back to sequential eth_call per entry — correct and
// dependency-free, at a small cost in round trips; the project list is small.
async function aggregate(provider: JsonRpcProvider, calls: { target: string; data: string }[]): Promise<string[]> {
  const out: string[] = new Array(calls.length).fill("0x");
  const n = calls.length;
  for (let i = 0; i < n; i += 25) {
    const batch = await Promise.all(
      calls.slice(i, i + 25).map(async (c, j) => {
        try {
          const r = await provider.call({ to: c.target, data: c.data });
          return { idx: i + j, ok: true, data: r };
        } catch {
          return { idx: i + j, ok: false, data: "0x" };
        }
      })
    );
    for (const b of batch) out[b.idx] = b.data || "0x";
  }
  return out;
}

/* ---------------- chain data loader ---------------- */
const SWAP_TOPIC = id("Swap(address,uint256,uint256,uint256,uint256,address)");
const PALETTE = ["#f0b90b", "#2ee6a8", "#38e1ff", "#9b6bff", "#ff5c7a", "#76B900", "#E82127", "#D4AF37", "#00A4EF", "#FF6A00"];
const colorOf = (a: string) => PALETTE[parseInt(a.slice(-2), 16) % PALETTE.length];
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const num = (wei: bigint) => Number(formatUnits(wei, 18));

const poolSymOf = (baseToken: string, wbnb: string): string => {
  const f = POOL_ASSETS.find((a) => a.addr.toLowerCase() === baseToken.toLowerCase());
  if (f) return f.sym;
  if (baseToken.toLowerCase() === wbnb.toLowerCase()) return "BNB";
  return "BNB";
};

async function fetchPairStats(provider: JsonRpcProvider, tokens: { token: string; pair: string }[]): Promise<Map<string, { token0: string; r0: bigint; r1: bigint }>> {
  const map = new Map<string, { token0: string; r0: bigint; r1: bigint }>();
  const valid = tokens.filter((p) => p.pair && p.pair !== ZERO_ADDR);
  if (!valid.length) return map;
  const calls = valid.flatMap((p) => [
    { target: p.pair, data: pairIface.encodeFunctionData("token0") },
    { target: p.pair, data: pairIface.encodeFunctionData("getReserves") },
  ]);
  let results: string[];
  try {
    results = await aggregate(provider, calls);
  } catch {
    results = await Promise.all(
      calls.map(async (c) => {
        try { return await provider.call({ to: c.target, data: c.data }); } catch { return "0x"; }
      })
    );
  }
  valid.forEach((p, i) => {
    try {
      const token0 = pairIface.decodeFunctionResult("token0", results[i * 2])[0] as string;
      const [r0, r1] = pairIface.decodeFunctionResult("getReserves", results[i * 2 + 1]) as unknown as [bigint, bigint];
      map.set(p.token, { token0, r0, r1 });
    } catch { /* skip */ }
  });
  return map;
}

async function fetchVolume(provider: JsonRpcProvider, pair: string, baseIsToken0: boolean, latest: number): Promise<{ vol: number; spark: number[] }> {
  const WINDOW = 28800;
  const CHUNK = 4800;
  const from = Math.max(0, latest - WINDOW + 1);
  const buckets = new Array(12).fill(0);
  for (let f = from; f <= latest; f += CHUNK) {
    const t = Math.min(latest, f + CHUNK - 1);
    try {
      const logs = await provider.getLogs({ address: pair, topics: [SWAP_TOPIC], fromBlock: f, toBlock: t });
      for (const log of logs) {
        const d = log.data;
        if (d.length < 2 + 64 * 4) continue;
        const vals = [0, 1, 2, 3].map((k) => BigInt("0x" + d.slice(2 + k * 64, 2 + (k + 1) * 64)));
        const baseAmt = baseIsToken0 ? vals[0] + vals[1] : vals[2] + vals[3];
        buckets[11 - Math.min(11, Math.floor(((latest - Number(log.blockNumber ?? latest)) / WINDOW) * 12))] += Number(baseAmt) / 1e18;
      }
    } catch { /* range rejected by RPC */ }
  }
  const vol = buckets.reduce((a, b) => a + b, 0);
  return { vol, spark: buckets.map((v) => (v > 0 ? v : 0.0001)) };
}

async function runPool(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (i < tasks.length) {
        const idx = i++;
        try { await tasks[idx](); } catch { /* ignore */ }
      }
    })
  );
}

export type LoadResult = { tokens: Token[]; factory: string; error?: string };

export async function loadProjects(factoryAddr: string): Promise<LoadResult> {
  const provider = readOnlyProvider();
  const factory = factoryContract(provider, factoryAddr);
  try {
    // 1) enumerate projects(0..N) via multicall — out-of-range calls fail softly
    const idxRes = await aggregate(
      provider,
      Array.from({ length: 200 }, (_, i) => ({ target: factoryAddr, data: factoryIface.encodeFunctionData("projects", [i]) }))
    );
    const addrs: string[] = [];
    for (const r of idxRes) {
      if (r === "0x" || r.length < 66) break;
      addrs.push("0x" + r.slice(26));
    }
    if (!addrs.length) return { tokens: [], factory: factoryAddr };

    const list = addrs.slice(-60).reverse(); // newest first

    // 2) batch token reads
    const fields: { fn: string; key: string; args?: unknown[] }[] = [
      { fn: "name", key: "name" }, { fn: "symbol", key: "symbol" }, { fn: "totalSupply", key: "totalSupply" },
      { fn: "capBNB", key: "capBNB" }, { fn: "totalMintedBNB", key: "totalMintedBNB" }, { fn: "graduated", key: "graduated" },
      { fn: "mintEnabled", key: "mintEnabled" }, { fn: "whitelistOnly", key: "whitelistOnly" }, { fn: "mintRate", key: "mintRate" },
      { fn: "poolPercent", key: "poolPercent" }, { fn: "buyTax", key: "buyTax" }, { fn: "sellTax", key: "sellTax" },
      { fn: "transferTax", key: "transferTax" }, { fn: "baseToken", key: "baseToken" }, { fn: "pair", key: "pair" },
      { fn: "devWallet", key: "devWallet" }, { fn: "refundDeadline", key: "refundDeadline" },
      { fn: "marketingShare", key: "marketingShare" }, { fn: "buyBackShare", key: "buyBackShare" }, { fn: "liquidityShare", key: "liquidityShare" },
      { fn: "divInfo", key: "div1", args: [1] }, { fn: "divInfo", key: "div3", args: [3] },
    ];
    const F = fields.length;
    const res = await aggregate(
      provider,
      list.flatMap((a) => fields.map((f) => ({ target: a, data: tokenIface.encodeFunctionData(f.fn, f.args as never[]) })))
    );

    type Dec = (key: string) => { ok: boolean; v: unknown[] };
    const decOf = (i: number): Dec => (key) => {
      const fi = fields.findIndex((x) => x.key === key);
      try {
        return { ok: true, v: tokenIface.decodeFunctionResult(fields[fi].fn, res[i * F + fi]) as unknown as unknown[] };
      } catch {
        return { ok: false, v: [] };
      }
    };
    const raw = list.map((a, i) => ({ addr: a, dec: decOf(i) }));

    // 3) pair reserves + shared reads
    const wbnb = (await factory.WBNB()) as string;
    const latest = await provider.getBlockNumber();
    const pairStats = await fetchPairStats(
      provider,
      raw.map((r) => ({ token: r.addr, pair: (r.dec("pair").v[0] as string) ?? "" }))
    );

    const tokens: Token[] = [];
    const volTasks: (() => Promise<void>)[] = [];

    for (const r of raw) {
      const g = (key: string) => (r.dec(key).ok ? r.dec(key).v[0] : undefined);
      const name = (g("name") as string) ?? "?";
      const sym = (g("symbol") as string) ?? "???";
      const raised = num((g("totalMintedBNB") as bigint) ?? 0n);
      const goal = num((g("capBNB") as bigint) ?? 0n);
      const graduated = (g("graduated") as boolean) ?? false;
      const mintEnabled = (g("mintEnabled") as boolean) ?? false;
      const baseToken = (g("baseToken") as string) ?? wbnb;
      const pair = (g("pair") as string) ?? "";
      const refundDeadline = Number((g("refundDeadline") as bigint) ?? 0n);
      const rate = Number((g("mintRate") as bigint) ?? 0n);
      const pool = poolSymOf(baseToken, wbnb);
      const pct = goal > 0 ? raised / goal : 0;

      let price = 0;
      let mcap = 0;
      const stats = pairStats.get(r.addr);
      if (stats) {
        const isToken0 = stats.token0.toLowerCase() === r.addr.toLowerCase();
        const tokenReserve = isToken0 ? stats.r0 : stats.r1;
        const baseReserve = isToken0 ? stats.r1 : stats.r0;
        if (tokenReserve > 0n) {
          price = Number(formatUnits((baseReserve * 10n ** 18n) / tokenReserve, 18));
          mcap = price * Number(formatUnits((g("totalSupply") as bigint) ?? 0n, 18));
        }
      }

      const div1 = r.dec("div1").ok ? r.dec("div1").v : undefined;
      const div3 = r.dec("div3").ok ? r.dec("div3").v : undefined;
      const rewardLabel = (d: unknown[] | undefined): string => {
        const token = (d?.[1] as string) ?? "";
        if (!token || token === ZERO_ADDR) return "本币";
        if (token.toLowerCase() === wbnb.toLowerCase()) return "BNB";
        const f = POOL_ASSETS.find((a) => a.addr.toLowerCase() === token.toLowerCase());
        return f ? f.sym : `${token.slice(0, 6)}…`;
      };

      const tk: Token = {
        id: 0,
        sym,
        nameZh: name,
        nameEn: name,
        descZh: "",
        descEn: "",
        cat: graduated ? "listed" : pct >= 0.8 ? "grad" : "new",
        raised,
        goal,
        mcap,
        vol: 0,
        holders: 0,
        price,
        chg: 0,
        pool,
        mode: (g("whitelistOnly") as boolean) ? "wl" : "public",
        poolRatio: Number((g("poolPercent") as bigint) ?? 1000n) / 10,
        tax: {
          b: Number((g("buyTax") as bigint) ?? 0n) / 10,
          s: Number((g("sellTax") as bigint) ?? 0n) / 10,
          t: Number((g("transferTax") as bigint) ?? 0n) / 10,
        },
        supplyBase: "1",
        rate,
        ca: r.addr,
        dev: (g("devWallet") as string) ?? "",
        deadlineH: Math.max(0, Math.round((refundDeadline * 1000 - Date.now()) / 3600000)),
        refundTs: refundDeadline,
        mintLive: mintEnabled && !graduated,
        listAt: graduated ? "PancakeSwap" : undefined,
        color: colorOf(r.addr),
        mech: {
          burn: 0,
          mkt: Number((g("marketingShare") as bigint) ?? 0n) / 10,
          holder: div1 && (div1[0] as boolean) ? rewardLabel(div1) : "—",
          buyback: Number((g("buyBackShare") as bigint) ?? 0n) / 10,
          lp: Number((g("liquidityShare") as bigint) ?? 0n) / 10,
          burndiv: (div3?.[0] as boolean) ?? false,
        },
        spark: [],
        mcapSym: pool,
        avatar: "1",
      };
      tokens.push(tk);

      if (pair && pair !== ZERO_ADDR && volTasks.length < 36) {
        const stats2 = pairStats.get(r.addr);
        const baseIsToken0 = stats2 ? stats2.token0.toLowerCase() !== r.addr.toLowerCase() : true;
        volTasks.push(async () => {
          const { vol, spark } = await fetchVolume(provider, pair, baseIsToken0, latest);
          tk.vol = vol;
          tk.spark = spark;
        });
      }
    }

    await runPool(volTasks, 6);
    tokens.forEach((tk, i) => (tk.id = i + 1));
    return { tokens, factory: factoryAddr };
  } catch (e) {
    return { tokens: [], factory: factoryAddr, error: (e as Error).message };
  }
}