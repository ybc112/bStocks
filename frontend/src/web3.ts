import { BrowserProvider, JsonRpcProvider } from "ethers";

/* ---------------- EIP-1193 window.ethereum ---------------- */
type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, cb: (...args: never[]) => void) => void;
  removeListener?: (event: string, cb: (...args: never[]) => void) => void;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isBitKeep?: boolean;
  isCoinWallet?: boolean;
  providers?: Eip1193[];
};

declare global {
  interface Window {
    ethereum?: Eip1193;
    okxwallet?: Eip1193;
  }
}

/* ---------------- BSC chain config (testnet) ---------------- */
export const BSC_CHAIN_ID = 97;
export const BSC_CHAIN_ID_HEX = "0x" + BSC_CHAIN_ID.toString(16);
export const BSC_RPC = "https://bsc-testnet.publicnode.com";
export const BSC_EXPLORER = "https://testnet.bscscan.com";

const BSC_CHAIN_PARAMS = {
  chainId: BSC_CHAIN_ID_HEX,
  chainName: BSC_CHAIN_ID === 97 ? "BNB Smart Chain Testnet" : "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: [BSC_RPC],
  blockExplorerUrls: [BSC_EXPLORER],
};

/* ---------------- read-only provider (chain data) ---------------- */
let roProvider: JsonRpcProvider | null = null;
export const readOnlyProvider = () => {
  if (!roProvider) roProvider = new JsonRpcProvider(BSC_RPC, BSC_CHAIN_ID, { staticNetwork: true });
  return roProvider;
};

/* ---------------- injected wallet detection ---------------- */
export type DetectedWallet = { id: string; name: string; provider: Eip1193; install?: string };

export function detectWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const out: DetectedWallet[] = [];
  const eth = window.ethereum;
  const entries: Eip1193[] = [];
  if (eth?.providers?.length) entries.push(...eth.providers);
  else if (eth) entries.push(eth);
  for (const p of entries) {
    if (p.isMetaMask) out.push({ id: "metamask", name: "MetaMask", provider: p, install: "https://metamask.io/download/" });
    else if (p.isTrust) out.push({ id: "trust", name: "Trust Wallet", provider: p, install: "https://trustwallet.com/download" });
    else if (p.isBitKeep) out.push({ id: "bitget", name: "Bitget Wallet", provider: p, install: "https://web3.bitget.com/" });
    else out.push({ id: "browser", name: "Browser Wallet", provider: p });
  }
  if (window.okxwallet) out.push({ id: "okx", name: "OKX Wallet", provider: window.okxwallet, install: "https://www.okx.com/web3" });
  const seen = new Set<Eip1193>();
  return out.filter((w) => (seen.has(w.provider) ? false : (seen.add(w.provider), true)));
}

/* ---------------- connect / chain switch ---------------- */
export async function ensureBscChain(provider: Eip1193): Promise<boolean> {
  try {
    const chainId = (await provider.request({ method: "eth_chainId" })) as string;
    if (chainId?.toLowerCase() === BSC_CHAIN_ID_HEX) return true;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID_HEX }] });
    } catch (e) {
      const err = e as { code?: number };
      if (err?.code === 4902 || err?.code === -32603) {
        await provider.request({ method: "wallet_addEthereumChain", params: [BSC_CHAIN_PARAMS] });
      } else throw e;
    }
    const after = (await provider.request({ method: "eth_chainId" })) as string;
    return after?.toLowerCase() === BSC_CHAIN_ID_HEX;
  } catch {
    return false;
  }
}

export type ConnectResult = { addr: string; chainOk: boolean };

export async function connectWallet(w: DetectedWallet): Promise<ConnectResult> {
  const accounts = (await w.provider.request({ method: "eth_requestAccounts" })) as string[];
  const addr = accounts?.[0];
  if (!addr) throw new Error("no account");
  const chainOk = await ensureBscChain(w.provider);
  return { addr, chainOk };
}

export async function silentCheck(w: DetectedWallet): Promise<string | null> {
  try {
    const accounts = (await w.provider.request({ method: "eth_accounts" })) as string[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

export function getBrowserProvider(w: DetectedWallet): BrowserProvider {
  return new BrowserProvider(w.provider as never, BSC_CHAIN_ID);
}

export const txLink = (hash: string) => `${BSC_EXPLORER}/tx/${hash}`;
export const addrLink = (a: string) => `${BSC_EXPLORER}/address/${a}`;
