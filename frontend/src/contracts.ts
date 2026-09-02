import { Contract, Interface, formatUnits, id, keccak256, AbiCoder, solidityPacked } from "ethers";
import type { JsonRpcProvider, BrowserProvider } from "ethers";
import { readOnlyProvider } from "./web3";
import { POOL_ASSETS } from "./data";
import type { Token } from "./data";

/* ---------------- env config ---------------- */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string) || "https://bstocks-api.kimi-vault.com";
export const ENV_FACTORY: string = "0x7Ab9652DF7DBbbB09e19d6D251426246EeA839F1";

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
  "function launchProjectDeterministic(bytes,string,string,address,address,address,bytes32,address) returns (address)",
  "function launchProjectDeterministicAndConfigure(bytes,string,string,address,address,address,bytes32,address,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint8,address,uint256) returns (address)",
  "function configMint(address,bool,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
  "function configTax(address,uint256,uint256,uint256)",
  "function configFeeDistribution(address,uint256,uint256,uint256,uint256)",
  "function configDiv(address,uint8,address,uint256,bool)",
  "function configWhitelist(address,address[],bool)",
  "function register(address)",
  "function claimPlatformDiv()",
  "event ProjectLaunched(address indexed token, address indexed dev, address baseToken)",
  "event ProjectLaunched2(address indexed token, address indexed dev, address indexed baseToken, bytes32 salt, bool deterministic, string name, string symbol)",
];

export const DEPLOYER_ABI = ["function commitSalt(bytes32)"];

export type InitCode = { initCode: string; initCodeHash: string };

export async function tokenInitCode(args: [string, string, string, string, string, string, string]): Promise<InitCode> {
  const r = await fetch(`${API_BASE}/api/vanity/init-code-hash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ constructorArgs: args }),
  });
  const j = await r.json().catch(() => ({})) as Partial<InitCode> & { error?: string };
  if (!r.ok || !j.initCode || !j.initCodeHash) throw new Error(j.error || `init code api ${r.status}`);
  return { initCode: j.initCode, initCodeHash: j.initCodeHash };
}

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
  "function liquidityBackflowShare() view returns (uint256)",
  "function dividendShare() view returns (uint256)",
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
export function computeCommitment(user: string, salt: string, initCode: string): string {
  return keccak256(AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "bytes"],
    [user, salt, initCode]
  ));
}

/* ---------------- backend API ---------------- */
export type VanityResult = { found: boolean; salt?: string; address?: string; attempts?: number; elapsed?: string; message?: string };

export async function vanitySearch(suffix: string, deployer: string, constructorArgs?: string[], maxAttempts = 200000, initCodeHash?: string): Promise<VanityResult> {
  const r = await fetch(`${API_BASE}/api/vanity/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suffix, deployer, maxAttempts, constructorArgs, initCodeHash }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({})) as { error?: string };
    throw new Error(j.error || `vanity api ${r.status}`);
  }
  return (await r.json()) as VanityResult;
}

export function searchVanityLocal(deployer: string, initCodeHash: string, suffix: string, maxAttempts = 500000): VanityResult {
  const target = suffix.toLowerCase();
  for (let i = 0; i < maxAttempts; i++) {
    const salt = `0x${i.toString(16).padStart(64, "0")}`;
    const hash = keccak256(solidityPacked(["bytes1", "address", "bytes32", "bytes32"], ["0xff", deployer, salt, initCodeHash]));
    const address = `0x${hash.slice(-40)}`;
    if (address.toLowerCase().endsWith(target)) return { found: true, salt, address, attempts: i + 1, elapsed: "local" };
  }
  return { found: false, attempts: maxAttempts, message: `No address ending with ${suffix}` };
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

export async function verifyStatusByAddress(tokenAddress: string): Promise<VerifyResult> {
  const r = await fetch(`${API_BASE}/api/verify/by-address/${tokenAddress.toLowerCase()}`);
  const j = (await r.json().catch(() => ({}))) as VerifyResult;
  if (!r.ok || !j.verificationStatus) return { tokenAddress, verificationStatus: "pending", verificationGuid: null, verificationError: "indexing" };
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
  return `${API_BASE}/api/avatar/${tokenAddress.toLowerCase()}?v=2`;
}

export async function uploadAvatarForToken(tokenAddress: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/api/avatar/${tokenAddress.toLowerCase()}`, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({})) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error || `upload avatar api ${r.status}`);
  return j.url;
}

/* ---------------- Project metadata (description / links) ---------------- */
export type ProjectMeta = {
  tokenAddress: string;
  name: string;
  symbol: string;
  description: string;
  twitter: string;
  telegram: string;
  pool: string;
  creator: string;
  createdAt: number;
};

export async function fetchProjectsMeta(): Promise<Record<string, ProjectMeta>> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`${API_BASE}/api/projects`, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return {};
    const j = (await r.json()) as { items?: ProjectMeta[] };
    const map: Record<string, ProjectMeta> = {};
    for (const p of j.items ?? []) map[String(p.tokenAddress).toLowerCase()] = p;
    return map;
  } catch {
    return {};
  }
}

export async function saveProjectMeta(meta: {
  tokenAddress: string; name: string; symbol: string; description: string;
  twitter: string; telegram: string; pool: string; creator: string; createdAt: number;
}): Promise<void> {
  const r = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  const j = await r.json().catch(() => ({})) as { error?: string };
  if (!r.ok) throw new Error(j.error || `save project api ${r.status}`);
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
  const metas = await fetchProjectsMeta();
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
      { fn: "mintEnabled", key: "mintEnabled" }, { fn: "whitelistOnly", key: "whitelistOnly" },
      { fn: "poolPercent", key: "poolPercent" }, { fn: "buyTax", key: "buyTax" }, { fn: "sellTax", key: "sellTax" },
      { fn: "transferTax", key: "transferTax" }, { fn: "baseToken", key: "baseToken" }, { fn: "pair", key: "pair" },
      { fn: "devWallet", key: "devWallet" }, { fn: "refundDeadline", key: "refundDeadline" },
      { fn: "marketingShare", key: "marketingShare" }, { fn: "buyBackShare", key: "buyBackShare" }, { fn: "liquidityBackflowShare", key: "liquidityBackflowShare" },
      { fn: "dividendShare", key: "dividendShare" },
      { fn: "divInfo", key: "div1", args: [1] }, { fn: "divInfo", key: "div2", args: [2] }, { fn: "divInfo", key: "div3", args: [3] },
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
          mcap = price * Number((g("totalSupply") as bigint) ?? 0n);
        }
      }

      const div1 = r.dec("div1").ok ? r.dec("div1").v : undefined;
      const div2 = r.dec("div2").ok ? r.dec("div2").v : undefined;
      const div3 = r.dec("div3").ok ? r.dec("div3").v : undefined;
      const rewardLabel = (d: unknown[] | undefined): string => {
        const token = (d?.[1] as string) ?? "";
        if (!token || token === ZERO_ADDR) return "本币";
        if (token.toLowerCase() === wbnb.toLowerCase()) return "BNB";
        const f = POOL_ASSETS.find((a) => a.addr.toLowerCase() === token.toLowerCase());
        return f ? f.sym : `${token.slice(0, 6)}…`;
      };

      const meta = metas[r.addr.toLowerCase()];
      const tk: Token = {
        id: 0,
        sym,
        nameZh: name,
        nameEn: name,
        descZh: meta?.description || "",
        descEn: meta?.description || "",
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
          lp: Number((g("liquidityBackflowShare") as bigint) ?? 0n) / 10,
          dv: Number((g("dividendShare") as bigint) ?? 0n) / 10,
          divId: (div1?.[0] as boolean) ? 1 : (div2?.[0] as boolean) ? 2 : (div3?.[0] as boolean) ? 3 : 0,
          burndiv: (div3?.[0] as boolean) ?? false,
        },
        spark: [],
        mcapSym: pool,
        avatar: "1",
        twitter: meta?.twitter,
        tg: meta?.telegram,
        creator: meta?.creator,
        createdAt: meta?.createdAt,
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
