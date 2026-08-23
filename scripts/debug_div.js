const hre = require("hardhat");
const { ethers } = hre;
const E = ethers.parseEther;
const RATE = 10n ** 12n;
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function main() {
  const [deployer, dev, userA, userB, userC, mkt] = await ethers.getSigners();
  const Mf = await ethers.getContractFactory("MockFactory");
  const mf = await Mf.deploy();
  const Mr = await ethers.getContractFactory("MockRouter");
  const mr = await Mr.deploy();
  await mr.setup(deployer.address, await mf.getAddress());
  const lp = await mr.lpToken();
  await (await deployer.sendTransaction({ to: await mr.getAddress(), value: E("100") })).wait();
  const F = await ethers.getContractFactory("LaunchpadFactory");
  const fac = await F.deploy(await mr.getAddress(), await mf.getAddress(), ethers.ZeroAddress);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();
  const Dep = await ethers.getContractFactory("TokenDeployer");
  const dep = await Dep.deploy(facAddr);
  await fac.setDeployer(await dep.getAddress());

  const tx = await fac.launchProject("T", "T", dev.address, mkt.address, ethers.ZeroAddress);
  const r = await tx.wait();
  const ft = await ethers.getContractAt("StocksToken", r.logs.find((l) => l.fragment && l.fragment.name === "ProjectLaunched").args.token);
  const ftAddr = await ft.getAddress();
  await mf.setPair(ftAddr, await ft.WBNB(), lp);
  await (await fac.configMint(ftAddr, false, RATE, 1000, 1000, E("0.001"), E("0.1"), E("0"), E("0.1"), 3600)).wait();
  await (await ft.connect(userA).swapIn(E("0.1"), { value: E("0.1") })).wait();
  await (await fac.configTax(ftAddr, 100, 100, 0)).wait();

  // Setup: buy tax test
  await (await fac.configExclude(ftAddr, userB.address, true)).wait();
  await (await ft.connect(userA).transfer(userB.address, 10n ** 26n)).wait();
  await (await fac.configExclude(ftAddr, userB.address, false)).wait();
  await (await fac.configPool(ftAddr, userB.address)).wait();
  await (await ft.connect(userB).transfer(userA.address, 10n ** 26n)).wait();
  // Sell tax test
  await (await deployer.sendTransaction({ to: await mr.getAddress(), value: E("5") })).wait();
  await (await ft.connect(userA).transfer(lp, 10n ** 26n)).wait();

  // Dividend test
  console.log("\\n=== DIVIDEND TEST ===");
  await (await fac.configDiv(ftAddr, 1, ethers.ZeroAddress, 0, true)).wait();
  console.log("DIV_HOLD enabled");

  await (await ft.connect(userA).transfer(userB.address, 10n ** 24n)).wait();
  console.log("userB balance:", (await ft.balanceOf(userB.address)).toString());

  const sharesB = await ft.divShares(1, userB.address);
  console.log("userB shares:", sharesB.toString());
  const totalShares = await (await ft.divInfo(1)).totalShares;
  console.log("totalShares:", totalShares.toString());

  const pend = await ft.pendingDiv(1, userB.address);
  console.log("pendingDiv before:", pend.toString());

  // Listen for DebugLog events
  ft.on("DebugLog", (msg, val) => {
    console.log("  DEBUG:", msg, val.toString());
  });

  const tx2 = await ft.connect(userA).transfer(lp, 10n ** 25n);
  const receipt = await tx2.wait();
  console.log("\\nTransfer done, gas used:", receipt.gasUsed.toString());

  // Check events
  for (const log of receipt.logs) {
    try {
      const parsed = ft.interface.parseLog(log);
      if (parsed) {
        console.log("Event:", parsed.name, parsed.args.map(a => a.toString()).join(", "));
      }
    } catch (e) {}
  }

  const accPerShare = (await ft.divInfo(1)).accPerShare;
  console.log("\\naccPerShare:", accPerShare.toString());

  const pend2 = await ft.pendingDiv(1, userB.address);
  console.log("pendingDiv after:", pend2.toString());

  const bal0 = await ft.balanceOf(userB.address);
  await (await ft.connect(userB).claimDiv(1)).wait();
  const bal1 = await ft.balanceOf(userB.address);
  console.log("claimDiv: bal before", bal0.toString(), "after", bal1.toString(), "diff", (bal1 - bal0).toString());
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
