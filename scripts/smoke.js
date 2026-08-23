const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  let pass = 0, fail = 0;
  const ok = (n) => { pass++; console.log("  PASS: " + n); };
  const bad = (n) => { fail++; console.log("  FAIL: " + n); };
  const E = ethers.parseEther;
  const RATE = 10n ** 12n;

  const [deployer, dev, user, mkt] = await ethers.getSigners();
  const Mf = await ethers.getContractFactory("MockFactory");
  const mf = await Mf.deploy();
  const Mr = await ethers.getContractFactory("MockRouter");
  const mr = await Mr.deploy();
  await mr.setup(deployer.address, await mf.getAddress());
  const lp = await mr.lpToken();
  await (await deployer.sendTransaction({ to: await mr.getAddress(), value: E("100") })).wait();
  const LP = await ethers.getContractAt("MockERC20", lp);

  const F = await ethers.getContractFactory("LaunchpadFactory");
  const fac = await F.deploy(await mr.getAddress(), await mf.getAddress(), ethers.ZeroAddress);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();
  const Dep = await ethers.getContractFactory("TokenDeployer");
  const dep = await Dep.deploy(facAddr);
  await fac.setDeployer(await dep.getAddress());
  const wbnb = await fac.WBNB();

  (await fac.platformTotalSupply()) === 10000n * 10n ** 18n ? ok("工厂部署 + 平台币 10000") : bad("平台币");
  (await fac.platformBalance(deployer.address)) === 10000n * 10n ** 18n ? ok("平台币归部署者") : bad("归属");

  const tx = await fac.launchProject("BStock", "BST", dev.address, mkt.address, ethers.ZeroAddress);
  const r = await tx.wait();
  const tokenAddr = r.logs.find((l) => l.fragment && l.fragment.name === "ProjectLaunched").args.token;
  const token = await ethers.getContractAt("StocksToken", tokenAddr);
  (await token.decimals()) === 30n ? ok("代币 decimals = 30") : bad("精度");
  await mf.setPair(tokenAddr, wbnb, lp);

  await (await fac.configMint(tokenAddr, false, RATE, 1000, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600)).wait();
  ok("Mint 配置（cap 0.1 BNB = 门槛下限）");

  await (await token.connect(user).swapIn(E("0.05"), { value: E("0.05") })).wait();
  (await token.mintCapped()) === false ? ok("0.05/0.1 未毕业") : bad("提前毕业");
  await (await token.connect(dev).swapIn(E("0.05"), { value: E("0.05") })).wait();
  ((await token.mintCapped()) && (await token.graduated())) ? ok("打满 0.1 BNB 触发毕业") : bad("毕业失败");
  (await LP.balanceOf("0x000000000000000000000000000000000000dEaD")) > 0n ? ok("毕业 LP 进黑洞") : bad("LP 未销毁");
  (await token.mintedBNB(user.address)) === E("0.05") ? ok("mint 记账正确") : bad("记账");

  await (await fac.registerFirst(deployer.address)).wait();
  await (await fac.connect(user).register(deployer.address)).wait();
  ok("返佣注册成功");

  await (await fac.configTax(tokenAddr, 50, 50, 0)).wait();
  ok("交易税设置：买/卖 5%");

  console.log(fail === 0 ? "\n✅ 冒烟全部通过 (" + pass + ")" : "\n❌ 失败 " + fail);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });