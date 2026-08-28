const hre = require("hardhat");
const { ethers } = hre;
const E = ethers.parseEther;
const RATE = 10n ** 12n;

async function main() {
  const [d, dev, mkt, userA, userB] = await ethers.getSigners();
  const Mf = await ethers.getContractFactory("MockFactory");
  const mf = await Mf.deploy();
  const Mr = await ethers.getContractFactory("MockRouter");
  const mr = await Mr.deploy();
  await mr.setup(d.address, await mf.getAddress());
  const lp = await mr.lpToken();
  await (await d.sendTransaction({ to: await mr.getAddress(), value: E("100") })).wait();
  const F = await ethers.getContractFactory("LaunchpadFactory");
  const fac = await F.deploy(await mr.getAddress(), await mf.getAddress(), ethers.ZeroAddress);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();
  const Dep = await ethers.getContractFactory("TokenDeployer");
  const dep = await Dep.deploy(facAddr);
  await fac.setDeployer(await dep.getAddress());

  const tx = await fac.launchProject("T", "T", dev.address, mkt.address, ethers.ZeroAddress);
  const r = await tx.wait();
  const t = await ethers.getContractAt("StocksToken", r.logs.find((l) => l.fragment && l.fragment.name === "ProjectLaunched").args.token);
  const ta = await t.getAddress();
  await mf.setPair(ta, d.address, lp);
  await (await fac.configMint(ta, false, 1000, 1000, E("0.001"), E("0.1"), E("0"), E("0.1"), 3600)).wait();
  await (await t.connect(userA).swapIn(E("0.1"), { value: E("0.1") })).wait();
  await (await fac.configTax(ta, 100, 100, 0)).wait();
  await (await fac.configDiv(ta, 1, ethers.ZeroAddress, 0, true)).wait();
  await (await t.connect(userA).transfer(userB.address, 10n ** 24n)).wait();
  const info = await t.divInfo(1);
  console.log("DIV_HOLD: enabled=%s totalShares=%s pendingReward=%s accPerShare=%s", info.enabled, info.totalShares, info.pendingReward, info.accPerShare);
  console.log("userB shares:", await t.divShares(1, userB.address));
  await (await t.connect(userA).transfer(lp, 10n ** 25n)).wait();
  const info2 = await t.divInfo(1);
  console.log("After sell: pendingReward=%s accPerShare=%s", info2.pendingReward, info2.accPerShare);
  const pend = await t.pendingDiv(1, userB.address);
  console.log("pendingDiv:", pend.toString());
  const bal0 = await t.balanceOf(userB.address);
  const contractBal = await t.balanceOf(ta);
  console.log("contract bal:", contractBal.toString(), "pendingReward:", info2.pendingReward.toString());
  console.log("userB bal before claim:", bal0.toString());
  try {
    await (await t.connect(userB).claimDiv(1)).wait();
    console.log("claimDiv OK");
    const bal1 = await t.balanceOf(userB.address);
    console.log("userB bal after claim:", bal1.toString(), "diff:", (bal1 - bal0).toString());
  } catch (e) {
    console.log("claimDiv ERR:", e.info?.error?.message || e.message);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });