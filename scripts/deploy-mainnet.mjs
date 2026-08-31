import hre from "hardhat";
const { ethers } = hre;
const ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PFACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"; // PancakeSwap V2 mainnet
const WBNB_MAINNET = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
async function main() {
  const [owner] = await ethers.getSigners();
  console.log("owner(mainnet):", owner.address);

  const StocksToken = await ethers.getContractFactory("StocksToken");
  const cc = StocksToken.bytecode;
  const cch = ethers.keccak256(cc);
  const ccl = cc.length > 2 ? (cc.length - 2) / 2 : 0;
  console.log("token init code hash:", cch.slice(0, 18) + "...", `len ${ccl}`);

  const Factory = await ethers.getContractFactory("LaunchpadFactory");
  const fac = await Factory.deploy(ROUTER, PFACTORY, ethers.ZeroAddress);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();

  const Deployer = await ethers.getContractFactory("TokenDeployer");
  const dep = await Deployer.deploy(facAddr, cch, ccl);
  await dep.waitForDeployment();
  const depAddr = await dep.getAddress();

  await (await fac.setDeployer(depAddr)).wait();

  const wbnb = await fac.WBNB();
  const router = await fac.router();
  const pfac = await fac.factoryERC20();
  console.log("\n=== MAINNET DEPLOY ===");
  console.log("NEW_FACTORY ", facAddr);
  console.log("NEW_DEPLOYER", depAddr);
  console.log("WBNB       ", wbnb, wbnb.toLowerCase() === WBNB_MAINNET ? "✓ mainnet" : "✗ MISMATCH");
  console.log("router     ", router, router.toLowerCase() === ROUTER.toLowerCase() ? "✓" : "✗");
  console.log("factoryV2  ", pfac, pfac.toLowerCase() === PFACTORY.toLowerCase() ? "✓" : "✗");
  console.log("deployer() ", await fac.deployer());
}
main().catch((e) => { console.error(e); process.exitCode = 1; });