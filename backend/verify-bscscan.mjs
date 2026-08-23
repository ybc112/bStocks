/**
 * BSCScan Contract Verification Service
 * 
 * Submits source code to BSCScan for verification after deployment.
 * Must be called from a backend/server, NEVER from the frontend (API key would be exposed).
 * 
 * Usage: node verify-bscscan.mjs <tokenAddress> <name> <symbol> <router> <factory> <dev> <marketing> <baseToken>
 */

const BSCSCAN_API_URL = "https://api.bscscan.com/api";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";

if (!BSCSCAN_API_KEY) {
  console.error("Error: BSCSCAN_API_KEY environment variable is required");
  console.error("Set it with: export BSCSCAN_API_KEY=YourApiKey");
  process.exit(1);
}

async function verifyContract(tokenAddress, constructorArgs, compilerVersion = "v0.8.20+commit.a1b79de6") {
  const params = new URLSearchParams({
    apikey: BSCSCAN_API_KEY,
    module: "contract",
    action: "verifysourcecode",
    contractaddress: tokenAddress,
    sourceCode: "", // Standard JSON input
    codeformat: "solidity-standard-json-input",
    contractname: "contracts/StocksToken.sol:StocksToken",
    compilerversion: compilerVersion,
    optimizationUsed: 1,
    runs: 200,
    constructorArguements: constructorArgs,
    evmversion: "paris",
    viaIR: true,
    licenseType: 3, // MIT
  });

  const response = await fetch(BSCSCAN_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json();
  return data;
}

async function checkVerificationStatus(guid) {
  const params = new URLSearchParams({
    apikey: BSCSCAN_API_KEY,
    module: "contract",
    action: "checkverifystatus",
    guid: guid,
  });

  const response = await fetch(`${BSCSCAN_API_URL}?${params.toString()}`);
  const data = await response.json();
  return data;
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Usage: node verify-bscscan.mjs <action> [params...]");
  console.error("Actions:");
  console.error("  submit <tokenAddress> <name> <symbol> <router> <factory> <dev> <marketing> <baseToken>");
  console.error("  status <guid>");
  process.exit(1);
}

const [action, ...rest] = args;

if (action === "submit") {
  const [tokenAddress, name, symbol, router, factory, dev, marketing, baseToken] = rest;
  
  if (!tokenAddress) {
    console.error("Error: tokenAddress is required");
    process.exit(1);
  }

  // Encode constructor arguments
  // StocksToken constructor: (string name, string symbol, address router, address factory, address dev, address marketing, address baseToken)
  const { ethers } = await import("ethers");
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const constructorArgs = abiCoder.encode(
    ["string", "string", "address", "address", "address", "address", "address"],
    [name, symbol, router, factory, dev, marketing, baseToken]
  ).slice(2); // Remove 0x prefix

  console.error(`[verify] Submitting verification for ${tokenAddress}...`);
  const result = await verifyContract(tokenAddress, constructorArgs);
  
  if (result.status === "1") {
    console.log(JSON.stringify({ status: "submitted", guid: result.result, tokenAddress }));
  } else {
    console.log(JSON.stringify({ status: "error", error: result.result, tokenAddress }));
  }
} else if (action === "status") {
  const [guid] = rest;
  if (!guid) {
    console.error("Error: guid is required");
    process.exit(1);
  }
  const result = await checkVerificationStatus(guid);
  console.log(JSON.stringify({ status: result.status === "1" ? "verified" : "pending", result: result.result }));
} else {
  console.error(`Unknown action: ${action}`);
  process.exit(1);
}