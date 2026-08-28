/**
 * End-to-end verification for the ATOMIC launch path:
 *   launchProjectDeterministicAndConfigure(...)
 *
 * Proves:
 *   1. The factory REJECTS a fee distribution != 80% (e.g. the 70% case) with
 *      a clear revert BEFORE anything is deployed (no half-state, no salt use).
 *   2. vanity search -> commitSalt -> single atomic tx deploys AND fully
 *      configures the token (mint / tax / fee distribution / dividend).
 *   3. On-chain read-back matches the intended config exactly
 *      (marketing 30 / buyback 20 / liquidity-backflow 20 / dividend 10).
 *
 * Prereq: the NEW LaunchpadFactory (with launchProjectDeterministicAndConfigure)
 * must already be deployed; its addr goes into FACTORY_ADDRESS (and DEPLOYER_ADDRESS).
 * Run on testnet:  npx hardhat run scripts/verify-atomic.mjs --network bscTestnet
 */

import { ethers } from "hardhat";

const E = (n) => ethers.parseEther(n);
const U = (n) => ethers.parseUnits(n, 0);

const FACTORY = process.env.FACTORY_ADDRESS || "";
const DEPLOYER = process.env.DEPLOYER_ADDRESS || "";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sum = (...a) => a.reduce((x, y) => x + y, 0);

async function main() {
  assert(FACTORY !== "", "FACTORY_ADDRESS env missing");
  const [owner] = await ethers.getSigners();
  console.log("owner :", owner.address);
  console.log("factory:", FACTORY);

  const fac = await ethers.getContractAt("LaunchpadFactory", FACTORY);
  const deployerAddr = DEPLOYER || await fac.deployer();
  const router = await fac.router();
  const pancakeFactory = await fac.factoryERC20();
  const wbnb = await fac.WBNB();

  const nonce = Date.now().toString().slice(-8);
  const name = `Atomic ${nonce}`;
  const symbol = `AT${nonce.slice(-4)}`;
  const dev = owner.address;
  const marketing = owner.address;

  // ---- deterministic init code + vanity ----
  const tokenArtifact = await ethers.getContractFactory("StocksToken");
  const bytecode = tokenArtifact.bytecode;
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "address", "address", "address", "address", "address"],
    [name, symbol, router, pancakeFactory, dev, marketing, ethers.ZeroAddress]
  );
  const initCode = bytecode + encoded.slice(2);
  const initCodeHash = ethers.keccak256(initCode);

  const suffix = "bbbb";
  let found;
  for (let i = 0; i < 5_000_000; i++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
    const a = ethers.getCreate2Address(deployerAddr, salt, initCodeHash);
    if (a.toLowerCase().endsWith(suffix)) { found = { salt, address: a, attempts: i + 1 }; break; }
  }
  assert(found, "vanity not found");
  console.log("predicted:", found.address, `(${found.attempts} tries, ends ${suffix})`);
  assert(found.address.toLowerCase().endsWith(suffix), "suffix mismatch");

  // ---- negative test: 70% (m+bb+l+d = 700) must revert with "DIST80" ----
  const commit = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "bytes"], [owner.address, found.salt, initCode]
  ));
  const dep = await ethers.getContractAt("TokenDeployer", deployerAddr);
  await (await dep.commitSalt(commit)).wait();
  console.log("committed salt");

  console.log("\n-- negative: fee distribution = 70% must revert --");
  const badArgs = [
    initCode, name, symbol, dev, marketing, ethers.ZeroAddress, found.salt, owner.address,
    false, 800, 1000, E("0.001"), E("5"), E("5"), E("1"), 30 * 86400,
    50, 50, 0,
    300, 200, 200, 0,   // d = 0  => sum = 700 (70%)
    0, ethers.ZeroAddress, 0,
  ];
  try {
    const gas = await fac.launchProjectDeterministicAndConfigure.estimateGas(...badArgs);
    console.log("BAD: expected revert but estimateGas succeeded:", gas.toString());
    process.exitCode = 1;
    return;
  } catch (e) {
    console.log("OK  : reverted with:", (e.reason || e.message || e.toString()).slice(0, 80));
  }

  // ---- positive: atomic deploy + configure (m+bb+l+d = 300+200+200+100 = 800) ----
  console.log("\n-- positive: atomic deploy + configure (80%) --");
  const goodArgs = [
    initCode, name, symbol, dev, marketing, ethers.ZeroAddress, found.salt, owner.address,
    // mint: public, poolPct 80%, lpRatio 100%, min 0.001, max 5, wCap 5, cap 1, 30d
    false, 800, 1000, E("0.001"), E("5"), E("5"), E("1"), 30 * 86400,
    // tax: buy 5% sell 5% transfer 0
    50, 50, 0,
    // fee distribution: mkt 30% bb 20% liq 20% div 10%
    300, 200, 200, 100,
    // dividend: hold=1, reward=WBNB, minEligible=0
    1, wbnb, 0,
  ];
  const tx = await fac.launchProjectDeterministicAndConfigure(...goodArgs);
  const rc = await tx.wait();

  let actual = "";
  for (const log of rc.logs) {
    try {
      const ev = new ethers.Interface(fac.interface.fragments).parseLog(log);
      if (ev?.name === "ProjectLaunched2") actual = ev.args.token;
    } catch {}
  }
  assert(actual !== "", "ProjectLaunched2 missing");
  console.log("actual  :", actual);

  // ---- on-chain read-back assertions ----
  const t = await ethers.getContractAt("StocksToken", actual);
  assert(actual.toLowerCase() === found.address.toLowerCase(), "VANITY_MISMATCH");
  assert(actual.toLowerCase().endsWith(suffix), "not ending bbbb");
  assert((await t.name()) === name, "NAME");
  assert((await t.symbol()) === symbol, "SYMBOL");
  assert((await t.totalSupply()) === 10n ** 30n, "SUPPLY");
  assert((await t.decimals()) === 0n, "DECIMALS");
  assert((await t.devWallet()).toLowerCase() === dev.toLowerCase(), "DEV");
  assert((await t.marketingWallet()).toLowerCase() === marketing.toLowerCase(), "MKT_WALLET");
  assert((await t.baseToken()).toLowerCase() === wbnb.toLowerCase(), "BASE");
  assert((await t.owner()).toLowerCase() === FACTORY.toLowerCase(), "OWNER=factory");

  // fee distribution (the crux of this fix)
  const m = await t.marketingShare();
  const bb = await t.buyBackShare();
  const liq = await t.liquidityBackflowShare();
  const dv = await t.dividendShare();
  assert(m === 300n && bb === 200n && liq === 200n && dv === 100n,
    `DIST ${m}+${bb}+${liq}+${dv} != 800`);
  assert(sum(Number(m), Number(bb), Number(liq), Number(dv)) === 800, "DIST_SUM");
  console.log(`fee dist: mkt ${m/10n}% / bb ${bb/10n}% / liq ${liq/10n}% / div ${dv/10n}% (project 80%) + platform 20% = 100%`);

  // mint config
  assert(await t.mintEnabled(), "MINT_ENABLED");
  assert((await t.capBNB()) === E("1"), "CAP");
  assert((await t.minMint()) === E("0.001"), "MIN");
  assert((await t.maxMint()) === E("5"), "MAX");

  // tax
  assert((await t.buyTax()) === 50n, "BUY_TAX");
  assert((await t.sellTax()) === 50n, "SELL_TAX");
  assert((await t.transferTax()) === 0n, "TRANSFER_TAX");

  // dividend mechanism (hold active)
  const d1 = await t.divInfo(1);
  assert(d1[0] === true, "DIV_HOLD_ENABLED");
  assert(d1[1].toLowerCase() === wbnb.toLowerCase(), "DIV_REWARD");

  assert(await fac.isProject(actual), "IS_PROJECT");

  console.log("\n=== ATOMIC LAUNCH VERIFIED ===");
  console.log("token:", actual);
  console.log("salt :", found.salt);
  console.log("tx   :", tx.hash);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });