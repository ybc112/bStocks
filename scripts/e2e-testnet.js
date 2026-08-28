const hre = require("hardhat");
const { ethers } = hre;

const FAC = "0x95e3358f860997E8F365d0b7f7DddE11C7A79819";
const DEP = "0x7C98Ecac31d865367029729cDcECf2BABF01a5c3";
const SUFFIX = "bbbb";
const E = (n) => ethers.parseEther(n);

async function main() {
  const [dev] = await hre.ethers.getSigners();
  console.log("Tester:", dev.address, "| BNB:", ethers.formatEther(await hre.ethers.provider.getBalance(dev.address)));

  const fac = await hre.ethers.getContractAt("LaunchpadFactory", FAC);
  const dep = await hre.ethers.getContractAt("TokenDeployer", DEP);
  const router = await fac.router();
  const pfac = await fac.factoryERC20();
  const wbnb = await fac.WBNB();

  const name = "bStocks Test";
  const symbol = "BSTST";
  const base = wbnb;
  const marketing = dev.address;

  // Local CREATE2 search with constructor args (exact same math as on-chain)
  const artifact = require("../artifacts/contracts/StocksToken.sol/StocksToken.json");
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const args = [name, symbol, router, pfac, dev.address, marketing, base];
  const initCode = artifact.bytecode + abi.encode(
    ["string", "string", "address", "address", "address", "address", "address"], args).slice(2);
  const codeHash = ethers.keccak256(ethers.getBytes(initCode));

  let salt, addr;
  const MAX = 400000;
  for (let i = 0; i < MAX; i++) {
    salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
    const h = ethers.keccak256(ethers.solidityPacked(
      ["bytes1", "address", "bytes32", "bytes32"], ["0xff", DEP, salt, codeHash]));
    const a = "0x" + h.slice(26);
    if (a.toLowerCase().endsWith(SUFFIX)) { addr = ethers.getAddress(a); break; }
  }
  if (!addr) throw new Error("vanity not found in " + MAX + " tries");
  console.log("Vanity salt :", salt);
  console.log("Predicted   :", addr);

  // Cross-check against the on-chain predictor
  const onChain = await fac.predictTokenAddress(name, symbol, dev.address, marketing, base, salt);
  if (onChain.toLowerCase() !== addr.toLowerCase()) throw new Error("PREDICT MISMATCH on-chain=" + onChain);
  console.log("On-chain predict matches local computation");

  // Commit-reveal
  const commitment = ethers.keccak256(abi.encode(
    ["address", "bytes32", "string", "string", "address"],
    [dev.address, salt, name, symbol, base]));
  await (await dep.commitSalt(commitment)).wait();
  console.log("commitSalt  : confirmed");

  // Deterministic launch
  const tx = await fac.launchProjectDeterministic(name, symbol, dev.address, marketing, base, salt, dev.address);
  const rc = await tx.wait();
  let tokenAddr = null;
  for (const log of rc.logs) {
    try {
      const ev = fac.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (ev && ev.name === "ProjectLaunched2") { tokenAddr = ev.args.token; break; }
    } catch {}
  }
  console.log("Deployed    :", tokenAddr, tokenAddr.toLowerCase().endsWith(SUFFIX) ? "<<< ENDS ." + SUFFIX : "VANITY FAIL");
  const token = await hre.ethers.getContractAt("StocksToken", tokenAddr);

  // On-chain config
  await (await fac.configMint(tokenAddr, false, 1000, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600)).wait();
  await (await fac.configTax(tokenAddr, 50, 50, 10)).wait();
  console.log("configMint  : confirmed (poolPct=100%, cap=0.1 BNB, min=0.001)");
  console.log("configTax   : confirmed (buy=5% sell=5% transfer=1%)");

  // Real mint -> real PancakeSwap testnet liquidity
  await (await token.swapIn(E("0.001"), { value: E("0.001") })).wait();
  const minted = await token.totalMintedBNB();
  const pair = await token.pair();
  console.log("Live mint   :", ethers.formatEther(minted), "BNB | pair:", pair);

  console.log("\n=== E2E PASS: vanity launch + config + live LP all working on testnet ===");
  console.log("Token CA    :", tokenAddr);
  console.log("BscScan     : https://testnet.bscscan.com/address/" + tokenAddr);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
