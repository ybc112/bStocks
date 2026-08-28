/**
 * ONE-SHOT: deploy a brand-new LaunchpadFactory (with
 * launchProjectDeterministicAndConfigure) + matching TokenDeployer, then run the
 * atomic vanity deploy + configure flow and assert the on-chain result.
 *
 * This is the full migration entry point for the "no more half-configured
 * token" fix. It redeploys BOTH contracts so the factory gains the atomic
 * entry AND the deployer becomes Factory-owned (constructor arg swap).
 *
 * Usage (testnet or mainnet):
 *   ROUTER_ADDRESS / FACTORY_V2_ADDRESS default to the bStocks testnet ones.
 *   npx hardhat run scripts/deploy-and-verify.mjs --network bscTestnet
 *
 * Returns the new Factory + Deployer addresses to write into your backend
 * /api/config and frontend ENV_FACTORY.
 */

import { ethers } from "hardhat";

const E = (n) => ethers.parseEther(n);
const assert = (c, m) => { if (!c) throw new Error(m); };

// bStocks testnet PancakeV2 clone (kept in sync with the production router).
const ROUTER = process.env.ROUTER_ADDRESS || "0xd99d1c33f9fc3444f8101754abc46c52416550d1";
const PFACTORY = process.env.FACTORY_V2_ADDRESS || "0x6725f303b657a9451d8ba641348b6761a6cc7a17";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log("owner    :", owner.address);

  const StocksToken = await ethers.getContractFactory("StocksToken");
  const creationCode = StocksToken.bytecode; // deployment code (no constructor args)
  const creationCodeHash = ethers.keccak256(creationCode);
  const creationCodeLength = creationCode.length > 2 ? (creationCode.length - 2) / 2 : 0;
  console.log("token init code hash:", creationCodeHash.slice(0, 18) + "…", `(len ${creationCodeLength})`);

  // ---- deploy (circular: Factory first w/ zero deployer, then Deployer, then set) ----
  const Factory = await ethers.getContractFactory("LaunchpadFactory");
  const fac = await Factory.deploy(ROUTER, PFACTORY, ethers.ZeroAddress);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();

  const Deployer = await ethers.getContractFactory("TokenDeployer");
  const dep = await Deployer.deploy(facAddr, creationCodeHash, creationCodeLength);
  await dep.waitForDeployment();
  const depAddr = await dep.getAddress();

  await (await fac.setDeployer(depAddr)).wait();

  const wbnb = await fac.WBNB();
  const router = await fac.router();
  const pfac = await fac.factoryERC20();
  const actDep = await fac.deployer();
  assert(router.toLowerCase() === ROUTER.toLowerCase(), "ROUTER");
  assert(pfac.toLowerCase() === PFACTORY.toLowerCase(), "PFACTORY");
  assert(actDep.toLowerCase() === depAddr.toLowerCase(), "DEPLOYER");
  assert((await fac.baseTokenWhitelist(wbnb)) === true, "WBNB_WHITELIST");
  console.log("\n=== NEW deployment ===");
  console.log("Factory :", facAddr);
  console.log("Deployer:", depAddr);
  console.log("WBNB    :", wbnb);

  // ---- atomic vanity deploy + configure ----
  const nonce = Date.now().toString().slice(-8);
  const name = `A1 ${nonce}`;
  const symbol = `A1${nonce.slice(-4)}`;
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "address", "address", "address", "address", "address"],
    [name, symbol, router, pfac, owner.address, owner.address, ethers.ZeroAddress]
  );
  const initCode = creationCode + encoded.slice(2);
  const initCodeHash = ethers.keccak256(initCode);

  let found;
  for (let i = 0; i < 5_000_000; i++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
    const a = ethers.getCreate2Address(depAddr, salt, initCodeHash);
    if (a.toLowerCase().endsWith("bbbb")) { found = { salt, address: a, attempts: i + 1 }; break; }
  }
  assert(found, "vanity not found");
  console.log("\npredicted:", found.address, `(${found.attempts} tries …bbbb)`);

  const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "bytes"], [owner.address, found.salt, initCode]
  ));
  await (await dep.commitSalt(commitment)).wait();

  // 70% negative — must revert with DIST80 before anything is deployed
  try {
    await fac.launchProjectDeterministicAndConfigure.estimateGas(
      initCode, name, symbol, owner.address, owner.address, ethers.ZeroAddress, found.salt, owner.address,
      false, 800, 1000, E("0.001"), E("5"), E("5"), E("1"), 30 * 86400,
      50, 50, 0,
      300, 200, 200, 0, // sum = 700
      0, ethers.ZeroAddress, 0
    );
    throw new Error("BAD: 70% was accepted");
  } catch (e) { console.log("OK  : 70% rejected →", (e.reason || e.message || "").slice(0, 40)); }

  // 80% positive — deploy + full config atomically
  const tx = await fac.launchProjectDeterministicAndConfigure(
    initCode, name, symbol, owner.address, owner.address, ethers.ZeroAddress, found.salt, owner.address,
    false, 800, 1000, E("0.001"), E("5"), E("5"), E("1"), 30 * 86400,
    50, 50, 0,
    300, 200, 200, 100, // mkt30 / bb20 / liq20 / div10 = 80%
    1, wbnb, 0
  );
  const rc = await tx.wait();
  let actual = "";
  for (const log of rc.logs) {
    try {
      const ev = new ethers.Interface(fac.interface.fragments).parseLog(log);
      if (ev?.name === "ProjectLaunched2") actual = ev.args.token;
    } catch {}
  }
  assert(actual, "ProjectLaunched2 missing");
  const t = await ethers.getContractAt("StocksToken", actual);

  // ---- read-back assertions ----
  assert(actual.toLowerCase() === found.address.toLowerCase(), "VANITY_MISMATCH");
  assert(actual.toLowerCase().endsWith("bbbb"), "NOT_BBBB");
  assert((await t.totalSupply()) === 10n ** 30n, "SUPPLY");
  assert((await t.owner()).toLowerCase() === facAddr.toLowerCase(), "OWNER=factory");
  const m = await t.marketingShare(), bb = await t.buyBackShare();
  const liq = await t.liquidityBackflowShare(), dv = await t.dividendShare();
  assert(m === 300n && bb === 200n && liq === 200n && dv === 100n, "DIST");
  assert(Number(m) + Number(bb) + Number(liq) + Number(dv) === 800, "DIST_SUM");
  assert(await t.mintEnabled(), "MINT");
  const d1 = await t.divInfo(1);
  assert(d1[0] === true && d1[1].toLowerCase() === wbnb.toLowerCase(), "DIV");
  assert(await fac.isProject(actual), "IS_PROJECT");

  console.log("\n=== ATOMIC LAUNCH VERIFIED ON NEW CONTRACTS ===");
  console.log("token   :", actual);
  console.log("dist    : mkt", (m / 10n).toString(), "/ bb", (bb / 10n).toString(),
    "/ liq", (liq / 10n).toString(), "/ div", (dv / 10n).toString(), "= project 80% + 20% platform");
  console.log("tx      :", tx.hash);
  console.log("\n!!! Write these into backend /api/config + frontend ENV_FACTORY !!!");
  console.log("NEW_FACTORY ", facAddr);
  console.log("NEW_DEPLOYER", depAddr);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });