/**
 * Vanity Address Salt Search
 * 
 * Offline worker that searches for a salt that generates a contract address
 * ending with the desired suffix (e.g., "7777", "8888").
 * 
 * Usage: node vanity-search.mjs <suffix> <maxAttempts>
 * Example: node vanity-search.mjs 7777 100000
 */

import { ethers } from "ethers";

// ABI-encoded constructor arguments for StocksToken
// The predictAddress function uses: keccak256(0xff ++ deployer ++ salt ++ keccak256(initCode))
// where initCode = type(StocksToken).creationCode + abi.encode(constructorArgs)

// We need the creation code from the compiled contract
// This must match the deployed bytecode exactly

const STOCKS_TOKEN_CREATION_CODE = ""; // Will be loaded from artifact

function calculateAddress(deployer, salt, initCodeHash) {
  return ethers.getAddress(
    "0x" +
      ethers.keccak256(
        ethers.solidityPacked(
          ["bytes1", "address", "bytes32", "bytes32"],
          ["0xff", deployer, salt, initCodeHash]
        )
      ).slice(26)
  );
}

function searchVanity(deployer, initCodeHash, suffix, maxAttempts, startNonce = 0) {
  const suffixLower = suffix.toLowerCase();
  const startTime = Date.now();

  for (let i = 0; i < maxAttempts; i++) {
    const nonce = startNonce + i;
    const salt = ethers.zeroPadValue(ethers.toBeHex(nonce), 32);
    const addr = calculateAddress(deployer, salt, initCodeHash);

    if (addr.toLowerCase().endsWith(suffixLower)) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(JSON.stringify({
        found: true,
        salt: ethers.hexlify(salt),
        address: addr,
        nonce,
        attempts: i + 1,
        elapsed: `${elapsed}s`,
        rate: (i + 1) / parseFloat(elapsed)
      }));
      return;
    }

    if ((i + 1) % 10000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`[vanity] Attempts: ${i + 1}, Elapsed: ${elapsed}s, Rate: ${(i + 1) / parseFloat(elapsed)}/s`);
    }
  }

  console.log(JSON.stringify({
    found: false,
    attempts: maxAttempts,
    elapsed: `${((Date.now() - startTime) / 1000).toFixed(2)}s`
  }));
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node vanity-search.mjs <suffix> <maxAttempts> [deployer] [startNonce]");
  console.error("Example: node vanity-search.mjs 7777 100000 0x... 0");
  process.exit(1);
}

const [suffix, maxAttemptsStr, deployerArg, startNonceArg] = args;
const deployer = deployerArg || "0x0000000000000000000000000000000000000000";
const maxAttempts = parseInt(maxAttemptsStr, 10);
const startNonce = startNonceArg ? parseInt(startNonceArg, 10) : 0;

// Load the contract artifact to get creation code
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const artifact = require("../../artifacts/contracts/StocksToken.sol/StocksToken.json");

if (!artifact || !artifact.bytecode) {
  console.error("Error: Cannot load StocksToken artifact. Run 'npx hardhat compile' first.");
  process.exit(1);
}

console.error(`[vanity] Searching for suffix: ${suffix}`);
console.error(`[vanity] Deployer: ${deployer}`);
console.error(`[vanity] Max attempts: ${maxAttempts}`);
console.error(`[vanity] Start nonce: ${startNonce}`);

const creationCode = artifact.bytecode;
const initCodeHash = ethers.keccak256(ethers.getBytes(creationCode));

searchVanity(deployer, initCodeHash, suffix, maxAttempts, startNonce);