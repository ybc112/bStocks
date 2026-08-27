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

// In-memory deployment store (use DB in production)
const deployments = [];

// ---- Avatar upload config ----
const AVATAR_DIR = path.join(__dirname, "avatars");
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
  filename: (_req, _file, cb) => cb(null, randomUUID() + ".webp"),
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG/JPEG/WebP/GIF/SVG allowed"), ok);
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

// Optional: Associate avatar with a token address (for persistent lookup)
app.post("/api/avatar/link", express.json(), (req, res) => {
  const { tokenAddress, avatarUrl } = req.body;
  if (!tokenAddress || !ethers.isAddress(tokenAddress) || !avatarUrl) {
    return res.status(400).json({ error: "tokenAddress and avatarUrl required" });
  }
  const filename = path.basename(avatarUrl);
  const src = path.join(AVATAR_DIR, filename);
  const dst = path.join(AVATAR_DIR, tokenAddress.toLowerCase() + ".webp");
  if (!fs.existsSync(src)) return res.status(404).json({ error: "Avatar file not found" });
  try { fs.copyFileSync(src, dst); } catch (e) { return res.status(500).json({ error: e.message }); }
  res.json({ url: `/api/avatars/${tokenAddress.toLowerCase()}.webp` });
});

// ========== Vanity Address ==========

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
  if (FACTORY_ADDRESS && factory.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) {
    return res.status(400).json({ error: "factory does not match configured factory" });
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
    const params = new URLSearchParams({
      chainid: String(CHAIN_ID),
      apikey: BSCSCAN_API_KEY,
      module: "contract",
      action: "verifysourcecode",
      contractaddress: tokenAddress,
      sourceCode: standardJsonInput,
      codeformat: "solidity-standard-json-input",
      contractname: "contracts/StocksToken.sol:StocksToken",
      compilerversion: compilerVersion,
      constructorArguements: constructorArgs,
      licenseType: 3, // MIT
    });

    const response = await fetch(ETHERSCAN_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await response.json();

    // Store deployment
    const deployment = {
      tokenAddress,
      name,
      symbol,
      timestamp: Date.now(),
      verificationStatus: data.status === "1" ? "submitted" : "failed",
      verificationGuid: data.result || null,
      verificationError: data.status !== "1" ? data.result : null,
    };
    deployments.push(deployment);

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

// Get deployment history
app.get("/api/deployments", (req, res) => {
  res.json({ deployments: deployments.slice(-50).reverse() });
});

// ========== Start Server ==========

app.listen(PORT, () => {
  console.error(`[server] bStocks Launchpad Backend running on port ${PORT}`);
  console.error(`[server] Vanity search ${initCodeHash ? "ready" : "unavailable (no artifact)"}`);
  console.error(`[server] BSCScan verification ${BSCSCAN_API_KEY ? "ready" : "unavailable (no API key)"}`);
  console.error(`[server] Avatar upload ready (${AVATAR_DIR})`);
});
