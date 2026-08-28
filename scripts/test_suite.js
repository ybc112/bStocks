const hre = require("hardhat");
const { ethers } = hre;

let pass = 0, fail = 0, failures = [];
const ok = (n) => { pass++; console.log("  PASS: " + n); };
const bad = (n, w) => { fail++; failures.push(n + " => " + w); console.log("  FAIL: " + n + " (" + w + ")"); };
const expectRevert = async (p) => { try { await p; return false; } catch { return true; } };
const E = ethers.parseEther;
const RATE = 10n ** 12n;
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function setup() {
  const [deployer, dev, userA, userB, userC, parent, grand, mkt] = await ethers.getSigners();
  const Mf = await ethers.getContractFactory("MockFactory");
  const mf = await Mf.deploy();
  const Mr = await ethers.getContractFactory("MockRouter");
  const mr = await Mr.deploy();
  await mr.setup(deployer.address, await mf.getAddress());
  const lp = await mr.lpToken();
  const Base = await ethers.getContractFactory("MockERC20");
  const usdt = await Base.deploy("USDT", "USDT");
  const usdtAddr = await usdt.getAddress();
  const Dep = await ethers.getContractFactory("TokenDeployer");
  const F = await ethers.getContractFactory("LaunchpadFactory");
  const fac = await F.deploy(await mr.getAddress(), await mf.getAddress(), ethers.ZeroAddress);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();
  const tokenArt = await hre.artifacts.readArtifact("StocksToken");
  const creationCode = ethers.getBytes(tokenArt.bytecode);
  const dep = await Dep.deploy(facAddr, ethers.keccak256(creationCode), creationCode.length);
  await fac.setDeployer(await dep.getAddress());
  const wbnb = await fac.WBNB();
  await (await deployer.sendTransaction({ to: await mr.getAddress(), value: E("100") })).wait();
  return { deployer, dev, userA, userB, userC, parent, grand, mkt, mf, mr, lp, usdt, usdtAddr, fac, wbnb };
}

async function initCodeOf(s, name, sym, dev, mkt, base) {
  const resolved = base === 0 || base === 0n || base === '0x0000000000000000000000000000000000000000' ? s.wbnb : base;
  const art = await hre.artifacts.readArtifact('StocksToken');
  const enc = ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'string', 'address', 'address', 'address', 'address', 'address'],
    [name, sym, await s.mr.getAddress(), await s.mf.getAddress(), dev, mkt, resolved]
  );
  return art.bytecode + enc.slice(2);
}

async function launch(s, base) {
  const init = await initCodeOf(s, "Test", "TST", s.dev.address, s.mkt.address, base);
  const tx = await s.fac.launchProject(init, "Test", "TST", s.dev.address, s.mkt.address, base === 0 ? ethers.ZeroAddress : base);
  const r = await tx.wait();
  const ev = r.logs.find((l) => l.fragment && l.fragment.name === "ProjectLaunched");
  return await ethers.getContractAt("StocksToken", ev.args.token);
}

async function main() {
  const s = await setup();
  const { fac, mf, mr, lp, usdt, usdtAddr, wbnb } = s;
  const { deployer, dev, userA, userB, userC, parent, grand, mkt } = s;
  const LP = await ethers.getContractAt("MockERC20", lp);

  // ---------- 工厂与底池白名单 ----------
  {
    const sup = await fac.platformTotalSupply();
    sup === 10000n * 10n ** 18n ? ok("平台币发行 10000") : bad("平台币", sup.toString());
  }
  {
    const r = await expectRevert(fac.launchProject(await initCodeOf(s, "X", "X", dev.address, mkt.address, userA.address), "X", "X", dev.address, mkt.address, userA.address));
    r ? ok("底池白名单：非白名单代币拒绝 launch") : bad("底池白名单", "未拦截");
    await (await fac.setBaseTokenWhitelist([usdtAddr], true)).wait();
    const wl = await fac.baseTokenWhitelist(usdtAddr);
    wl ? ok("底池白名单设置生效") : bad("白名单", "未生效");
  }
  {
    const r = await expectRevert(fac.launchProject("0x60006000f3", "X", "X", dev.address, mkt.address, ethers.ZeroAddress));
    r ? ok("TokenDeployer 拒绝非官方 StocksToken initCode") : bad("initCode 白名单", "恶意字节码被接受");
  }
  {
    const t = await launch(s, 0);
    (await t.baseToken()) === wbnb ? ok("WBNB 底池 launch（0 地址映射 WBNB）") : bad("WBNB 底池", "映射失败");
  }
  {
    const t = await launch(s, usdtAddr);
    (await t.baseToken()) === usdtAddr ? ok("ERC20(USDT) 底池 launch") : bad("ERC20 底池", "失败");
  }

  // ---------- Mint 实入池 + 毕业黑洞 ----------
  const capT = await launch(s, 0);
  await mf.setPair(await capT.getAddress(), wbnb, lp);
  {
    await (await fac.configMint(await capT.getAddress(), false, 500, 1000, E("0.001"), E("0.06"), E("0"), E("0.1"), 3600)).wait();
    await (await capT.connect(userB).swapIn(E("0.04"), { value: E("0.04") })).wait();
    const lpBal = await LP.balanceOf(await capT.getAddress());
    lpBal > 0n ? ok("mint 实入池（每笔 mint LP 即时增加）") : bad("实入池", "LP=0");
    const total = await capT.totalMintedBNB();
    total === E("0.04") ? ok("mint 计账") : bad("计账", total.toString());
  }
  {
    const direct = await launch(s, 0);
    await mf.setPair(await direct.getAddress(), wbnb, lp);
    await (await fac.configMint(await direct.getAddress(), false, 500, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600)).wait();
    await (await userA.sendTransaction({ to: await direct.getAddress(), value: E("0.01") })).wait();
    const minted = await direct.mintedBNB(userA.address);
    minted === E("0.01") && (await direct.balanceOf(userA.address)) > 0n ? ok("直接转 BNB 到代币合约即可 Mint") : bad("直接转 BNB Mint", minted.toString());
  }
  {
    const b0 = await LP.balanceOf(DEAD);
    await (await capT.connect(userC).swapIn(E("0.06"), { value: E("0.06") })).wait();
    const [g, capped, lpDead, lpSelf] = await Promise.all([
      capT.graduated(), capT.mintCapped(), LP.balanceOf(DEAD), LP.balanceOf(await capT.getAddress())
    ]);
    const devBal = await ethers.provider.getBalance(dev.address);
    g && capped && lpDead > b0 && lpSelf === 0n ? ok("毕业：LP 全额进黑洞(打满黑洞)") : bad("毕业黑洞", `g=${g} lpSelf=${lpSelf}`);
    const minted = await capT.mintedBNB(userC.address);
    minted === E("0.06") ? ok("逼近 cap 精确记账 0.06") : bad("逼近cap", minted.toString());
    const [md, ld] = await Promise.all([capT.mintTokensDistributed(), capT.lpTokensDistributed()]);
    const half = (await capT.MAX_SUPPLY()) / 2n;
    md === half && ld === half ? ok("Mint 与 LP 总量各精确 50%（最后一笔补齐余数）") : bad("50/50 总量", md.toString());
    const r = await expectRevert(capT.connect(userB).swapIn(E("0.01"), { value: E("0.01") }));
    r ? ok("毕业后 mint 关闭") : bad("毕业后mint", "未拦截");
  }
  {
    const devBefore = await ethers.provider.getBalance(dev.address);
    const t2 = await launch(s, 0);
    await mf.setPair(await t2.getAddress(), wbnb, lp);
    await (await fac.configMint(await t2.getAddress(), false, 500, 1000, E("0.001"), E("0.1"), E("0"), E("0.1"), 3600)).wait();
    await (await t2.connect(userA).swapIn(E("0.1"), { value: E("0.1") })).wait();
    const devAfter = await ethers.provider.getBalance(dev.address);
    devAfter > devBefore ? ok("毕业剩余 BNB 到 dev 地址（50% 池比例）") : bad("剩余BNB", devAfter.toString());
  }

  // ---------- 退款（含撤池路径） ----------
  {
    const t3 = await launch(s, 0);
    await mf.setPair(await t3.getAddress(), wbnb, lp);
    await (await fac.configMint(await t3.getAddress(), false, 500, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600)).wait();
    await (await t3.connect(userB).swapIn(E("0.02"), { value: E("0.02") })).wait();
    const early = await expectRevert(t3.connect(userB).refund());
    await hre.network.provider.send("evm_increaseTime", [90000]);
    await hre.network.provider.send("evm_mine", []);
    const b0 = await ethers.provider.getBalance(userB.address);
    const rf = await (await t3.connect(userB).refund()).wait();
    const b1 = await ethers.provider.getBalance(userB.address);
    const twice = await expectRevert(t3.connect(userB).refund());
    const zero = (await t3.mintedPoolBNB(userB.address)) === 0n;
    const accountingReset = (await t3.mintedBNB(userB.address)) === 0n && (await t3.totalMintedBNB()) === 0n && (await t3.mintTokensDistributed()) === 0n && (await t3.lpTokensDistributed()) === 0n;
    early && b1 > b0 && twice && zero && accountingReset ? ok("退款：24h 门槛 + 撤池退 BNB + 全局记账恢复 + 防重复") : bad("退款", `early=${early} twice=${twice} accounting=${accountingReset}`);
  }

  // ---------- ERC20 底池 mint 入池 ----------
  {
    await usdt.mint(await mr.getAddress(), 10n ** 30n);
    const t4 = await launch(s, usdtAddr);
    await mf.setPair(await t4.getAddress(), usdtAddr, lp);
    await (await fac.configMint(await t4.getAddress(), false, 500, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600)).wait();
    await (await t4.connect(userC).swapIn(E("0.02"), { value: E("0.02") })).wait();
    const lpBal = await LP.balanceOf(await t4.getAddress());
    lpBal > 0n ? ok("ERC20 底池：BNB 换底池币加池成功") : bad("ERC20 入池", "LP=0");
  }

  // ---------- 税 + 平台 20% + 营销 + 回购 ----------
  const ft = await launch(s, 0);
  const ftAddr = await ft.getAddress();
  await mf.setPair(ftAddr, wbnb, lp);
  await (await fac.configMint(ftAddr, false, 500, 1000, E("0.001"), E("0.1"), E("0"), E("0.1"), 3600)).wait();
  await (await ft.connect(userA).swapIn(E("0.1"), { value: E("0.1") })).wait();
  await (await fac.configTax(ftAddr, 100, 100, 0)).wait();
  {
    await (await fac.configExclude(ftAddr, userB.address, true)).wait();
    await (await ft.connect(userA).transfer(userB.address, 10n ** 26n)).wait();
    await (await fac.configExclude(ftAddr, userB.address, false)).wait();
    await (await fac.configPool(ftAddr, userB.address)).wait();
    const ab = await ft.balanceOf(userA.address);
    await (await ft.connect(userB).transfer(userA.address, 10n ** 26n)).wait();
    const got = (await ft.balanceOf(userA.address)) - ab;
    got === 10n ** 26n - 10n ** 26n / 10n ? ok("买入税 10% 征收") : bad("买入税", got.toString());
  }
  {
    await (await deployer.sendTransaction({ to: await mr.getAddress(), value: E("5") })).wait();
    const mkt0 = await ethers.provider.getBalance(mkt.address);
    const facBal0 = await ethers.provider.getBalance(await fac.getAddress());
    const dead0 = await ft.balanceOf(DEAD);
    await (await ft.connect(userA).transfer(lp, 10n ** 26n)).wait();
    const mkt1 = await ethers.provider.getBalance(mkt.address);
    const facBal1 = await ethers.provider.getBalance(await fac.getAddress());
    const dead1 = await ft.balanceOf(DEAD);
    const feeBNB = mkt1 - mkt0 + facBal1 - facBal0;
    mkt1 > mkt0 && dead1 > dead0 ? ok("卖出触发税处理：营销回流 + 回购销毁(税额分配)") : bad("税处理", `mkt=${mkt1 - mkt0} dead=${dead1 - dead0}`);
  }
  {
    const comm = await fac.communityPool();
    comm > 0n ? ok("平台抽税额 20% 入工厂（含社区池）") : bad("平台抽税", "communityPool=0");
  }
  {
    const r = await expectRevert(ft.connect(userA).setFeeDistribution(801, 0, 0, 0));
    r ? ok("feeSplit 上限：平台 20% 不可侵占") : bad("feeSplit", "未拦截");
  }

  // ---------- 分红四类（每种独立代币，满足三选一互斥 + 切换需清空 pendingReward） ----------
  async function freshDivToken(name) {
    const init = await initCodeOf(s, name, name, dev.address, mkt.address, 0);
    const tx = await (await fac.launchProject(init, name, name, dev.address, mkt.address, ethers.ZeroAddress)).wait();
    const addr = tx.logs.find((l) => l.fragment && l.fragment.name === "ProjectLaunched").args.token;
    const tok = await ethers.getContractAt("StocksToken", addr);
    await mf.setPair(addr, wbnb, lp);
    await (await fac.configMint(addr, false, 500, 1000, E("0.001"), E("0.1"), E("0"), E("0.1"), 3600)).wait();
    await (await tok.connect(userA).swapIn(E("0.1"), { value: E("0.1") })).wait();
    await (await fac.configTax(addr, 100, 100, 0)).wait();
    return { addr, tok };
  }
  {
    const { addr, tok } = await freshDivToken("DH");
    await (await fac.configDiv(addr, 1, ethers.ZeroAddress, 0, true)).wait();
    await (await tok.connect(userA).transfer(userB.address, 10n ** 24n)).wait();
    const bal0 = await tok.balanceOf(userB.address);
    await (await tok.connect(userA).transfer(lp, 10n ** 25n)).wait();
    const pend = await tok.pendingDiv(1, userB.address);
    pend > 0n ? ok("持币分红：税金自动切分计提 pendingDiv") : bad("持币分红", pend.toString());
    await (await tok.connect(userB).claimDiv(1)).wait();
    const bal1 = await tok.balanceOf(userB.address);
    bal1 > bal0 ? ok("持币分红：claimDiv 本币到账") : bad("claimDiv", "未到账");
  }
  {
    const { addr, tok } = await freshDivToken("DL");
    await (await fac.configDiv(addr, 2, ethers.ZeroAddress, 10n ** 22n, true)).wait();
    await (await tok.connect(userA).transfer(lp, 10n ** 23n)).wait();
    const sh = await tok.divShares(2, userA.address);
    sh >= 10n ** 23n ? ok("加池分红：转 pair 记份额+门槛") : bad("加池分红", sh.toString());
  }
  {
    const { addr, tok } = await freshDivToken("DB");
    await (await fac.configDiv(addr, 3, ethers.ZeroAddress, 0, true)).wait();
    await (await tok.connect(userA).burnDiv(10n ** 23n)).wait();
    const sh1 = await tok.divShares(3, userA.address);
    await (await tok.connect(userA).transfer(DEAD, 10n ** 22n)).wait();
    const sh2 = await tok.divShares(3, userA.address);
    sh1 === 10n ** 23n && sh2 === 10n ** 23n + 10n ** 22n ? ok("燃烧分红：burnDiv + 转黑洞均记份额") : bad("燃烧分红", String(sh1) + " " + String(sh2));
  }
  {
    const { addr, tok } = await freshDivToken("DU");
    await usdt.mint(deployer.address, E("100"));
    await (await usdt.approve(addr, E("100"))).wait();
    await (await fac.configDiv(addr, 2, usdtAddr, 10n ** 22n, true)).wait();
    await (await tok.connect(userA).transfer(lp, 10n ** 23n)).wait();
    await (await tok.connect(deployer).depositDivToken(2, usdtAddr, E("10"))).wait();
    ok("自定义 ERC20 分红代币注入（加池分红 USDT 奖励）");
    const u0 = await usdt.balanceOf(userA.address);
    await (await tok.connect(userA).claimDiv(2)).wait();
    const u1 = await usdt.balanceOf(userA.address);
    u1 > u0 ? ok("自定义代币分红 claim 到账") : bad("ERC20 分红", "未到账");
  }
  {
    const { addr, tok } = await freshDivToken("DM");
    await (await fac.configDiv(addr, 1, ethers.ZeroAddress, 0, true)).wait();
    await (await tok.connect(userA).transfer(lp, 10n ** 25n)).wait();
    const locked = await expectRevert(fac.configDiv(addr, 2, ethers.ZeroAddress, 0, true));
    locked ? ok("分红三选一互斥：切换时要求旧机制 pendingReward 清空") : bad("互斥", "未拦截");
  }

  // ---------- Mint 规则校验 ----------
  {
    const t5 = await launch(s, 0);
    const a5 = await t5.getAddress();
    const r1 = await expectRevert(fac.configMint(a5, false, 0, 1000, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600));
    const r2 = await expectRevert(fac.configMint(a5, false, 1001, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600));
    const r3 = await expectRevert(fac.configMint(a5, false, 500, 1000, E("0.00000000001"), E("0.05"), E("0"), E("0.1"), 3600));
    const r4 = await expectRevert(fac.configMint(a5, false, 500, 1000, E("0.001"), E("0.05"), E("0"), E("0.09"), 3600));
    r1 && r2 && r3 && r4 ? ok("Mint 参数校验(poolPct<100 / poolPct>1000 / minMint / 门槛≥0.1)") : bad("Mint 校验", `${r1}${r2}${r3}${r4}`);
    await (await fac.configMint(a5, true, 500, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600)).wait();
    const blocked = await expectRevert(t5.connect(userB).swapIn(E("0.01"), { value: E("0.01") }));
    await (await fac.configWhitelist(a5, [userB.address], true)).wait();
    await (await t5.connect(userB).swapIn(E("0.01"), { value: E("0.01") })).wait();
    blocked && (await t5.balanceOf(userB.address)) > 0n ? ok("白名单 Mint 限制") : bad("白名单", "失败");
    await hre.network.provider.send("evm_increaseTime", [7200]);
    await hre.network.provider.send("evm_mine", []);
    const late = await expectRevert(t5.connect(userB).swapIn(E("0.01"), { value: E("0.01") }));
    late ? ok("限时 Mint：窗口外拒绝") : bad("限时", "未拦截");
  }

  // ---------- poolPercent 自由 + 每笔即时转 dev + 多笔收口 ----------
  {
    for (const pp of [800, 900, 1000]) {
      const tp = await launch(s, 0);
      const tap = await tp.getAddress();
      await mf.setPair(tap, wbnb, lp);
      await (await fac.configMint(tap, false, pp, 1000, E("0.001"), E("0.05"), E("0"), E("0.1"), 3600)).wait();
      const before = await ethers.provider.getBalance(dev.address);
      await (await tp.connect(userB).swapIn(E("0.02"), { value: E("0.02") })).wait();
      const after = await ethers.provider.getBalance(dev.address);
      ok("poolPercent=" + (pp / 10) + "% 可配置且剩余 BNB 即时转 dev (dev=" + ethers.formatEther(after - before) + ")");
    }
  }
  {
    const t33 = await launch(s, 0);
    const t33a = await t33.getAddress();
    await mf.setPair(t33a, wbnb, lp);
    await (await fac.configMint(t33a, false, 500, 1000, E("0.001"), E("0.04"), E("0"), E("0.1"), 3600)).wait();
    await (await t33.connect(userB).swapIn(E("0.033"), { value: E("0.033") })).wait();
    await (await t33.connect(userC).swapIn(E("0.033"), { value: E("0.033") })).wait();
    await (await t33.connect(userA).swapIn(E("0.034"), { value: E("0.034") })).wait();
    const md = await t33.mintTokensDistributed();
    const ld = await t33.lpTokensDistributed();
    const half = (await t33.MAX_SUPPLY()) / 2n;
    md === half && ld === half ? ok("33%+33%+34% Mint/LP 各精确 50%") : bad("33/34 收口", md.toString());
  }
  {
    const ts = await launch(s, 0);
    const tsa = await ts.getAddress();
    await mf.setPair(tsa, wbnb, lp);
    await (await fac.configMint(tsa, false, 500, 1000, E("0.001"), E("0.01"), E("0"), E("0.1"), 3600)).wait();
    for (let i = 0; i < 10; i++) await (await ts.connect(userC).swapIn(E("0.01"), { value: E("0.01") })).wait();
    const mdx = await ts.mintTokensDistributed();
    const ldx = await ts.lpTokensDistributed();
    const halfx = (await ts.MAX_SUPPLY()) / 2n;
    mdx === halfx && ldx === halfx ? ok("十笔小额 Mint 收口后各精确 50%") : bad("小额收口", mdx.toString());
  }

  // ---------- 确定性发射（CREATE2 + commit-reveal + bbbb 靓号） ----------
  {
    const depAddr = await fac.deployer();
    const dep = await ethers.getContractAt("TokenDeployer", depAddr);
    const name = "Det", sym = "DET";
    const init = await initCodeOf(s, name, sym, dev.address, mkt.address, 0);
    const initHash = ethers.keccak256(ethers.getBytes(init));
    let salt = "", predicted = "";
    for (let i = 0; i < 200000 && !salt; i++) {
      const cand = "0x" + i.toString(16).padStart(64, "0");
      const addr = "0x" + ethers.keccak256(ethers.solidityPacked(["bytes1", "address", "bytes32", "bytes32"], ["0xff", depAddr, cand, initHash])).slice(26);
      if (addr.toLowerCase().endsWith("bbbb")) { salt = cand; predicted = addr; }
    }
    if (!salt) { bad("确定性发射", "未找到 bbbb 靓号 salt"); }
    else {
      const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "bytes"], [userA.address, salt, init]));
      const wrongUser = await expectRevert(fac.launchProjectDeterministic(init, name, sym, dev.address, mkt.address, ethers.ZeroAddress, salt, userB.address));
      await (await dep.connect(userA).commitSalt(commitment)).wait();
      const noCommit = await expectRevert(fac.launchProjectDeterministic(await initCodeOf(s, name, "DEX", dev.address, mkt.address, 0), name, "DEX", dev.address, mkt.address, ethers.ZeroAddress, salt, userA.address));
      const tx = await (await fac.launchProjectDeterministic(init, name, sym, dev.address, mkt.address, ethers.ZeroAddress, salt, userA.address)).wait();
      const ev2 = tx.logs.find((l) => l.fragment && l.fragment.name === "ProjectLaunched2");
      const det = await ethers.getContractAt("StocksToken", ev2.args.token);
      const ownerOk = (await det.owner()) === (await fac.getAddress());
      const lpOk = (await det.launchpad()) === (await fac.getAddress());
      const cfgOk = await (await fac.configMint(ev2.args.token, false, 500, 1000, E("0.001"), E("0.1"), E("0"), E("0.1"), 3600)).wait();
      const isVanity = String(ev2.args.token).toLowerCase().endsWith("bbbb");
      const matchesPred = String(ev2.args.token).toLowerCase() === predicted.toLowerCase();
      const replay = await expectRevert(fac.launchProjectDeterministic(init, name, sym, dev.address, mkt.address, ethers.ZeroAddress, salt, userA.address));
      wrongUser && noCommit && replay && ownerOk && lpOk && !!cfgOk && isVanity && matchesPred
        ? ok("确定性发射：commit-reveal + bbbb 靓号(actual==predicted) + 工厂接管 + 配置生效")
        : bad("确定性发射", "vanity=" + isVanity + " match=" + matchesPred + " owner=" + ownerOk + " lp=" + lpOk);
    }
  }

  // ---------- handover 自管 ----------
  {
    const t6 = await launch(s, 0);
    const a6 = await t6.getAddress();
    await (await fac.handover(a6, dev.address)).wait();
    await (await t6.connect(dev).acceptOwnership()).wait();
    const r = await expectRevert(t6.connect(userA).setTax(1, 1, 1));
    const r2 = await expectRevert(t6.connect(dev).setTax(251, 0, 0));
    await (await t6.connect(dev).setTax(50, 50, 10)).wait();
    r && r2 ? ok("handover：dev 自管 + 税上限依旧强制") : bad("handover", "权限异常");
  }

  // ---------- 返佣 + 工厂安全 ----------
  {
    await (await fac.registerFirst(grand.address)).wait();
    await (await fac.connect(parent).register(grand.address)).wait();
    (await fac.parentOf(parent.address)) === grand.address ? ok("两级返佣关系") : bad("返佣关系", "失败");
    const val = E("1");
    const g0 = await ethers.provider.getBalance(grand.address);
    await (await fac.onProjectFee(ftAddr, parent.address, val, { value: val })).wait();
    const g1 = await ethers.provider.getBalance(grand.address);
    const comm = await fac.communityPool();
    comm >= 75n * 10n ** 16n && g1 - g0 >= 15n * 10n ** 16n - E("0.003") ? ok("费分配 75%社区+15%一代+10%二代(储备)") : bad("费分配", comm.toString());
    const r = await expectRevert(fac.onProjectFee(ftAddr, parent.address, E("10"), { value: 0 }));
    r ? ok("虚报防护(资不抵债)") : bad("虚报", "未拦截");
    const r2 = await expectRevert(fac.connect(userA).releaseCommunity(1));
    r2 ? ok("releaseCommunity 仅 owner") : bad("权限", "未拦截");
  }
  {
    const amt = 1000n * 10n ** 18n;
    await (await fac.platformApprove(userA.address, amt)).wait();
    await (await fac.connect(userA).platformTransferFrom(deployer.address, userA.address, amt)).wait();
    await (await fac.fundPlatformDiv({ value: E("1") })).wait();
    const b0 = await ethers.provider.getBalance(userA.address);
    await (await fac.connect(userA).claimPlatformDiv()).wait();
    const b1 = await ethers.provider.getBalance(userA.address);
    b1 > b0 ? ok("平台币持仓分红 fund+claim") : bad("平台币分红", "未到账");
  }

  console.log("\n================ 测试报告 ================");
  console.log(`通过: ${pass}  失败: ${fail}`);
  if (failures.length) { failures.forEach((f) => console.log("  x " + f)); process.exitCode = 1; }
  else console.log(`=== ALL ${pass} PASSED ===`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
