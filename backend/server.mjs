/**
 * bStocks Launchpad Backend Server
 * 
 * Provides:
 * 1. Vanity address salt search (offline worker)
 * 2. BSCScan contract verification after deployment
 * 3. Deployment metadata storage
 * 4. Token avatar upload and serve
 * 
 * Environment variables:
 *   PORT=3001
 *   CHAIN_ID=97 (BSC testnet) or 56 (BSC mainnet)
 *   BSCSCAN_API_KEY=YourEtherscanV2ApiKey
 *   RPC_URL=https://bsc-dataseed.binance.org/
 *   FACTORY_ADDRESS=0x...
 *   DEPLOYER_ADDRESS=0x...
 */

import "dotenv/config";
import express from "express";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

// Honor HTTP(S)_PROXY env vars for outbound fetch (direct connection when unset)
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
  console.error("[server] Outbound fetch via proxy from env");
}
import cors from "cors";
import { ethers } from "ethers";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "https://bstocks.vercel.app,http://localhost:5173")
  .split(",").map((v) => v.trim()).filter(Boolean);
app.use(cors({ origin: (origin, cb) => {
  if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
  return cb(new Error("CORS_ORIGIN_DENIED"));
} }));
app.use(express.json({ limit: "32kb" }));

const PORT = process.env.PORT || 3001;
const CHAIN_ID = Number(process.env.CHAIN_ID || 97);
const ETHERSCAN_API = "https://api.etherscan.io/v2/api";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";
const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "";
const DEPLOYER_ADDRESS = process.env.DEPLOYER_ADDRESS || "";
const MAX_VANITY_ATTEMPTS = 5_000_000;

// Verification state persisted to disk (survives PM2 restart / git pull)
const VERIFY_STORE = path.join(__dirname, "verify-status.json");
let tokenVerifications = [];
let factoryVerifications = {};
try {
  const st = JSON.parse(fs.readFileSync(VERIFY_STORE, "utf8"));
  tokenVerifications = Array.isArray(st.tokenVerifications) ? st.tokenVerifications : [];
  factoryVerifications = (st.factoryVerifications && typeof st.factoryVerifications === "object") ? st.factoryVerifications : {};
} catch { /* fresh start */ }
function saveVerifyStore() {
  try { fs.writeFileSync(VERIFY_STORE, JSON.stringify({ tokenVerifications, factoryVerifications }, null, 2)); } catch (e) { console.error("[server] save store failed:", e.message); }
}
async function submitVerification({ address, contractName, constructorArgsHex }) {
  if (!address || !ethers.isAddress(address)) return { kind: "error", status: "failed", error: "invalid address" };
  if (!BSCSCAN_API_KEY) return { kind: "error", status: "failed", error: "BSCSCAN_API_KEY not configured" };
  if (!standardJsonInput || !compilerVersion) return { kind: "error", status: "failed", error: "Standard JSON input not loaded (run 'npx hardhat compile')" };
  const params = new URLSearchParams({
    chainid: String(CHAIN_ID), apikey: BSCSCAN_API_KEY, module: "contract", action: "verifysourcecode",
    contractaddress: address, sourceCode: standardJsonInput, codeformat: "solidity-standard-json-input",
    contractname: contractName, compilerversion: compilerVersion,
    constructorArguments: constructorArgsHex || "", licenseType: 3,
  });
  try {
    const response = await fetch(`${ETHERSCAN_API}?chainid=${encodeURIComponent(String(CHAIN_ID))}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
    const data = await response.json();
    return { kind: "result", status: data.status === "1" ? "submitted" : "failed", guid: data.result || null, error: data.status !== "1" ? data.result : null };
  } catch (err) { return { kind: "error", status: "failed", guid: null, error: err.message }; }
}

// ---- Avatar upload config ----
const AVATAR_DIR = path.join(__dirname, "avatars");
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
const AVATAR_INDEX_FILE = path.join(AVATAR_DIR, "index.json");
let avatarIndex = {};
try { avatarIndex = JSON.parse(fs.readFileSync(AVATAR_INDEX_FILE, "utf8")); } catch { avatarIndex = {}; }

// ---- Project metadata store (description/link/etc.) persisted to disk ----
const PROJECTS_FILE = path.join(__dirname, "projects.json");
let projects = {};
try { projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8")); } catch { projects = {}; }
function saveProjects() {
  try { fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2)); } catch (e) { console.error("[server] save projects failed:", e.message); }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (_req, file, cb) => {
    const ext = file.mimetype === "image/png" ? ".png" : file.mimetype === "image/jpeg" ? ".jpg" : file.mimetype === "image/svg+xml" ? ".svg" : file.mimetype === "image/gif" ? ".gif" : ".webp";
    cb(null, randomUUID() + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG/JPEG/WebP/GIF allowed"), ok);
  },
});

// Load contract artifact for init code hash
let initCodeHash = null;
let stockArtifact = null;
try {
  const artifact = require("../artifacts/contracts/StocksToken.sol/StocksToken.json");
  if (artifact && artifact.bytecode) {
    stockArtifact = artifact;
    initCodeHash = ethers.keccak256(ethers.getBytes(artifact.bytecode));
    console.error(`[server] Init code hash loaded: ${initCodeHash}`);
  }
} catch (e) {
  console.error("[server] Warning: Cannot load StocksToken artifact. Run 'npx hardhat compile' first.");
}

// CREATE2 init code hash INCLUDING the encoded constructor arguments.
// Without the args the predicted address does NOT match the deployed one.
// Args order: (name, symbol, router, pancakeFactory, dev, marketing, baseToken)
function initCodeHashWithArgs(constructorArgs) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const initCode = stockArtifact.bytecode + abiCoder.encode(
    ["string", "string", "address", "address", "address", "address", "address"],
    constructorArgs
  ).slice(2);
  return ethers.keccak256(ethers.getBytes(initCode));
}

// Standard JSON input from hardhat build-info (for Etherscan verification)
let standardJsonInput = null;
let compilerVersion = "";
try {
  const buildInfoDir = path.join(__dirname, "..", "artifacts", "build-info");
  const files = fs.readdirSync(buildInfoDir).filter((f) => f.endsWith(".json")).sort().reverse();
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(buildInfoDir, f), "utf8"));
    if (data?.output?.contracts?.["contracts/StocksToken.sol"]?.StocksToken) {
      standardJsonInput = JSON.stringify(data.input);
      if (data.solcLongVersion) compilerVersion = "v" + data.solcLongVersion;
      break;
    }
  }
  console.error(`[server] Standard JSON input ${standardJsonInput ? "ready" : "unavailable"} · compiler ${compilerVersion}`);
} catch (e) {
  console.error("[server] Warning: Cannot load build-info. Run 'npx hardhat compile' first.");
}

// ========== API Routes ==========

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Get deployment config
app.get("/api/config", (req, res) => {
  res.json({
    factoryAddress: FACTORY_ADDRESS,
    deployerAddress: DEPLOYER_ADDRESS,
    chainId: CHAIN_ID,
    chainName: CHAIN_ID === 97 ? "BNB Smart Chain Testnet" : "BNB Smart Chain",
  });
});

// ========== Avatar Upload ==========

// Upload avatar image
app.post("/api/upload/avatar", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    res.json({ url: `/api/avatars/${req.file.filename}` });
  });
});

// Serve avatar images
app.use("/api/avatars", express.static(AVATAR_DIR, {
  maxAge: "7d",
  setHeaders: (res) => res.set("Cache-Control", "public, max-age=604800, immutable"),
}));

app.get("/api/avatar/:token", (req, res) => {
  const token = String(req.params.token || "").toLowerCase();
  if (!ethers.isAddress(token)) return res.status(400).json({ error: "Invalid token address" });
  const filename = avatarIndex[token];
  if (filename && fs.existsSync(path.join(AVATAR_DIR, filename))) return res.sendFile(path.join(AVATAR_DIR, filename));
  const legacy = path.join(AVATAR_DIR, token + ".webp");
  if (fs.existsSync(legacy)) return res.sendFile(legacy);
  return res.status(404).json({ error: "Avatar not found" });
});

// Single-step avatar upload + bind (stable interface)
app.post("/api/avatar/:tokenAddress", (req, res) => {
  const token = String(req.params.tokenAddress || "").toLowerCase();
  if (!ethers.isAddress(token)) return res.status(400).json({ error: "Invalid token address" });
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file (field 'file') provided" });
    try {
      const src = path.join(AVATAR_DIR, req.file.filename);
      const ext = path.extname(req.file.filename) || ".webp";
      const filename = token + ext;
      fs.renameSync(src, path.join(AVATAR_DIR, filename));
      avatarIndex[token] = filename;
      fs.writeFileSync(AVATAR_INDEX_FILE, JSON.stringify(avatarIndex, null, 2));
      res.json({ url: `/api/avatar/${token}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

// Optional: Associate avatar with a token address (for persistent lookup)
app.post("/api/avatar/link", express.json(), (req, res) => {
  const { tokenAddress, avatarUrl } = req.body;
  if (!tokenAddress || !ethers.isAddress(tokenAddress) || !avatarUrl) {
    return res.status(400).json({ error: "tokenAddress and avatarUrl required" });
  }
  const filename = path.basename(avatarUrl);
  const src = path.join(AVATAR_DIR, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: "Avatar file not found" });
  try {
    avatarIndex[tokenAddress.toLowerCase()] = filename;
    fs.writeFileSync(AVATAR_INDEX_FILE, JSON.stringify(avatarIndex, null, 2));
  } catch (e) { return res.status(500).json({ error: e.message }); }
  res.json({ url: `/api/avatar/${tokenAddress.toLowerCase()}` });
});

// ========== Project Metadata ==========
// Persisted to projects.json (keyed by lowercase token address) so details
// survive PM2 restart. description is NOT on-chain — stored here by the backend.

app.post("/api/projects", express.json(), (req, res) => {
  const b = req.body || {};
  const token = String(b.tokenAddress || "");
  if (!ethers.isAddress(token)) return res.status(400).json({ error: "Invalid tokenAddress" });
  if (!b.name) return res.status(400).json({ error: "name required" });
  const key = token.toLowerCase();
  const createdAt = Number(b.createdAt) || Date.now();
  projects[key] = {
    tokenAddress: key,
    name: String(b.name || "").slice(0, 64),
    symbol: String(b.symbol || "").slice(0, 16),
    description: String(b.description || "").slice(0, 2000),
    twitter: String(b.twitter || "").slice(0, 512),
    telegram: String(b.telegram || "").slice(0, 512),
    pool: String(b.pool || "").slice(0, 16),
    creator: String(b.creator || ""),
    createdAt,
  };
  saveProjects();
  res.json({ ok: true, tokenAddress: key });
});

app.get("/api/projects", (_req, res) => {
  res.json({ items: Object.values(projects) });
});

app.get("/api/projects/:tokenAddress", (req, res) => {
  const key = String(req.params.tokenAddress || "").toLowerCase();
  const p = projects[key];
  if (!p) return res.status(404).json({ error: "Not found" });
  res.json(p);
});

// ========== Vanity Address ==========

app.post("/api/vanity/init-code-hash", (req, res) => {
  const { constructorArgs } = req.body || {};
  if (!stockArtifact || !Array.isArray(constructorArgs) || constructorArgs.length !== 7) {
    return res.status(400).json({ error: "constructorArgs must contain 7 values" });
  }
  try {
    const initCode = stockArtifact.bytecode + ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "address", "address", "address", "address", "address"], constructorArgs
    ).slice(2);
    const initCodeHash = ethers.keccak256(ethers.getBytes(initCode));
    res.json({ initCode, initCodeHash });
  } catch (e) {
    res.status(400).json({ error: "Invalid constructorArgs: " + e.message });
  }
});

// Search for a vanity salt
app.post("/api/vanity/search", async (req, res) => {
  const { suffix, deployer, maxAttempts = 50000, constructorArgs, initCodeHash: requestedHash } = req.body;

  if (!suffix || !/^[0-9a-fA-F]{4,8}$/.test(suffix)) {
    return res.status(400).json({ error: "Invalid suffix. Must be 4-8 hex characters (e.g., 7777)" });
  }

  if (!initCodeHash) {
    return res.status(500).json({ error: "Contract artifact not loaded" });
  }

  const deployerAddr = deployer || DEPLOYER_ADDRESS;
  if (!deployerAddr || !ethers.isAddress(deployerAddr)) {
    return res.status(400).json({ error: "Invalid deployer address" });
  }
  const attempts = Number(maxAttempts);
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > MAX_VANITY_ATTEMPTS) {
    return res.status(400).json({ error: `maxAttempts must be an integer between 1 and ${MAX_VANITY_ATTEMPTS}` });
  }

  const hasRequestedHash = typeof requestedHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(requestedHash);
  let codeHash = hasRequestedHash ? requestedHash : initCodeHash;
  if (!hasRequestedHash && Array.isArray(constructorArgs) && constructorArgs.length === 7) {
    if (!stockArtifact) {
      return res.status(500).json({ error: "Contract artifact not loaded" });
    }
    for (const a of constructorArgs) {
      if (typeof a !== "string") {
        return res.status(400).json({ error: "constructorArgs must be 7 strings" });
      }
    }
    try {
      codeHash = initCodeHashWithArgs(constructorArgs);
    } catch (e) {
      return res.status(400).json({ error: "Invalid constructorArgs: " + e.message });
    }
  }

  const suffixLower = suffix.toLowerCase();
  const startTime = Date.now();
  let found = false;

  // Search in batches, return progress
  for (let i = 0; i < attempts; i += 1000) {
    const batchSize = Math.min(1000, attempts - i);
    for (let j = 0; j < batchSize; j++) {
      const nonce = i + j;
      const salt = ethers.zeroPadValue(ethers.toBeHex(nonce), 32);
      const addr = ethers.getAddress(
        "0x" + ethers.keccak256(
          ethers.solidityPacked(
            ["bytes1", "address", "bytes32", "bytes32"],
            ["0xff", deployerAddr, salt, codeHash]
          )
        ).slice(26)
      );

      if (addr.toLowerCase().endsWith(suffixLower)) {
        found = true;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        return res.json({
          found: true,
          salt: ethers.hexlify(salt),
          address: addr,
          deployer: deployerAddr,
          attempts: nonce + 1,
          elapsed: `${elapsed}s`,
        });
      }
    }

    // Send progress every 10k attempts
    if ((i + batchSize) % 10000 === 0) {
      console.error(`[vanity] Progress: ${i + batchSize}/${attempts}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  res.json({
    found: false,
    attempts,
    elapsed: `${elapsed}s`,
    message: `No address ending with "${suffix}" found in ${attempts} attempts`,
  });
});

// ========== BSCScan Verification ==========

// Submit verification
app.post("/api/verify/submit", async (req, res) => {
  const { tokenAddress, name, symbol, router, factory, dev, marketing, baseToken } = req.body;

  if (!tokenAddress || !ethers.isAddress(tokenAddress) || !name || !symbol || name.length > 100 || symbol.length > 32) {
    return res.status(400).json({ error: "Missing required fields: tokenAddress, name, symbol" });
  }

  for (const [label, value] of Object.entries({ router, factory, dev, marketing, baseToken })) {
    if (!value || !ethers.isAddress(value)) return res.status(400).json({ error: `Invalid ${label} address` });
  }
  // `factory` is the Pancake V2 ERC20-factory (constructor arg), NOT the launchpad
  // factory. Only require it be a valid address; do not compare it to FACTORY_ADDRESS.
  if (!FACTORY_ADDRESS) {
    return res.status(500).json({ error: "FACTORY_ADDRESS not configured on server" });
  }

  if (!BSCSCAN_API_KEY) {
    return res.status(500).json({ error: "BSCSCAN_API_KEY not configured on server" });
  }

  try {
    // Encode constructor arguments
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const constructorArgs = abiCoder.encode(
      ["string", "string", "address", "address", "address", "address", "address"],
      [name, symbol, router, factory, dev, marketing, baseToken]
    ).slice(2);

    if (!standardJsonInput || !compilerVersion) {
      return res.status(500).json({ error: "Standard JSON input not loaded on server (run 'npx hardhat compile')" });
    }

    // Submit to Etherscan V2
    const data = await submitVerification({ address: tokenAddress, contractName: "contracts/StocksToken.sol:StocksToken", constructorArgsHex: constructorArgs });
    const deployment = {
      tokenAddress,
      name,
      symbol,
      timestamp: Date.now(),
      verificationStatus: data.status,
      verificationGuid: data.guid,
      verificationError: data.error,
    };
    tokenVerifications.push(deployment);
    saveVerifyStore();
    res.json(deployment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check verification status
app.get("/api/verify/status/:guid", async (req, res) => {
  const { guid } = req.params;

  if (!BSCSCAN_API_KEY) {
    return res.status(500).json({ error: "BSCSCAN_API_KEY not configured" });
  }

  try {
    const params = new URLSearchParams({
      chainid: String(CHAIN_ID),
      apikey: BSCSCAN_API_KEY,
      module: "contract",
      action: "checkverifystatus",
      guid: guid,
    });

    const response = await fetch(`${ETHERSCAN_API}?${params.toString()}`);
    const data = await response.json();

    res.json({
      guid,
      status: data.status === "1" ? "verified" : "pending",
      result: data.result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get deployment / verification history
app.get("/api/deployments", (req, res) => {
  res.json({ deployments: tokenVerifications.slice(-50).reverse() });
});

// Auto-verify TokenDeployer + LaunchpadFactory (constructor args exact match)
app.get("/api/verify/factory", (req, res) => { res.json(factoryVerifications); });
app.post("/api/verify/factory", async (req, res) => {
  const { factory, deployer, router, factoryV2, deployerArgs, factoryArgs } = req.body || {};
  const factoryAddr = factory || FACTORY_ADDRESS;
  const deployerAddr = deployer || DEPLOYER_ADDRESS;
  const routerAddr = router || process.env.ROUTER_ADDRESS;
  const v2Addr = factoryV2 || process.env.FACTORY_V2_ADDRESS;
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const results = {};
  if (deployerAddr && ethers.isAddress(deployerAddr)) {
    const creationCode = stockArtifact?.bytecode ? ethers.getBytes(stockArtifact.bytecode) : null;
    const defaultArgs = creationCode ? [factoryAddr, ethers.keccak256(creationCode), creationCode.length] : null;
    const args = Array.isArray(deployerArgs) ? deployerArgs : defaultArgs;
    const argsHex = args ? abiCoder.encode(["address", "bytes32", "uint256"], args).slice(2) : "";
    results.deployer = { address: deployerAddr, ...(await submitVerification({ address: deployerAddr, contractName: "contracts/TokenDeployer.sol:TokenDeployer", constructorArgsHex: argsHex })) };
  } else {
    results.deployer = { status: "failed", error: "deployer address required (env DEPLOYER_ADDRESS or body.deployer)" };
  }
  if (factoryAddr && ethers.isAddress(factoryAddr) && routerAddr && ethers.isAddress(routerAddr) && v2Addr && ethers.isAddress(v2Addr)) {
    const argsHex = Array.isArray(factoryArgs) ? abiCoder.encode(["address", "address", "address"], factoryArgs).slice(2) : abiCoder.encode(["address", "address", "address"], [routerAddr, v2Addr, deployerAddr]).slice(2);
    results.factory = { address: factoryAddr, ...(await submitVerification({ address: factoryAddr, contractName: "contracts/LaunchpadFactory.sol:LaunchpadFactory", constructorArgsHex: argsHex })) };
  } else {
    results.factory = { status: "failed", error: "factory/router/factoryV2/deployer addresses required (env FACTORY_ADDRESS, ROUTER_ADDRESS, FACTORY_V2_ADDRESS, DEPLOYER_ADDRESS or request body)" };
  }
  factoryVerifications = results;
  saveVerifyStore();
  res.json({ results, updatedAt: Date.now() });
});

// Re-verify a deployed token (blocking-safe: never affects token creation)
app.post("/api/verify/token/:address", async (req, res) => {
  const tokenAddress = String(req.params.address || "").toLowerCase();
  const { name, symbol, router, factory, dev, marketing, baseToken } = req.body || {};
  if (!ethers.isAddress(tokenAddress) || !name || !symbol) return res.status(400).json({ error: "tokenAddress, name, symbol required" });
  for (const [l, v] of Object.entries({ router, factory, dev, marketing, baseToken })) if (!ethers.isAddress(v)) return res.status(400).json({ error: `invalid ${l}` });
  try {
    const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(["string", "string", "address", "address", "address", "address", "address"], [name, symbol, router, factory, dev, marketing, baseToken]).slice(2);
    const data = await submitVerification({ address: tokenAddress, contractName: "contracts/StocksToken.sol:StocksToken", constructorArgsHex: constructorArgs });
    const rec = { tokenAddress, name, symbol, timestamp: Date.now(), verificationStatus: data.status, verificationGuid: data.guid, verificationError: data.error };
    tokenVerifications.push(rec);
    saveVerifyStore();
    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== Start Server ==========

app.listen(PORT, () => {
  console.error(`[server] bStocks Launchpad Backend running on port ${PORT}`);
  console.error(`[server] Vanity search ${initCodeHash ? "ready" : "unavailable (no artifact)"}`);
  console.error(`[server] BSCScan verification ${BSCSCAN_API_KEY ? "ready" : "unavailable (no API key)"}`);
  console.error(`[server] Avatar upload ready (${AVATAR_DIR})`);
});
