const hre = require("hardhat");

const BSC_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const BSC_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const BASE_TOKENS = [
  "0x55d398326f99059ff775485246999027b3197955",
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d",
  "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1",
  "0xca750ef65f295bbecd685abf54e82caf297bdb61",
  "0x7138b48df7d98d7e3cc221bfe7192d0a178182d8",
  "0x21caef8a43163eea865baee23b9c2e327696a3bf",
  "0x205812cdbed920aff76c6580abd681a46d11efc7",
  "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
  "0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a",
  "0x5b1910eaad6450e50f816082aa078c41f10c292f",
  "0x80106cb3ead06659a5ad19df39d9b4733863b9b0",
  "0x3f53de71c126bdabae20f9cd64848d317f6c3238",
  "0x4ef9d3062c7f6eba4aae4990c5036598c6eff4ec",
  "0x46ceefda28dd7207059ed19b0acdc026955bb15c",
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
  "0x2170ed0880ac9a755fd29b2688956bd959f933f8"
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const router = BSC_ROUTER;
  const factory = BSC_FACTORY;
  console.log(`Deploying on ${hre.network.name} with ${deployer.address}`);

  const Factory = await hre.ethers.getContractFactory("LaunchpadFactory");
  const fac = await Factory.deploy(router, factory, ethers.ZeroAddress);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();
  console.log("LaunchpadFactory:", facAddr);

  const Deployer = await hre.ethers.getContractFactory("TokenDeployer");
  const tokenArtifact = await hre.artifacts.readArtifact("StocksToken");
  const creationCode = hre.ethers.getBytes(tokenArtifact.bytecode);
  const dep = await Deployer.deploy(facAddr, hre.ethers.keccak256(creationCode), creationCode.length);
  await dep.waitForDeployment();
  console.log("TokenDeployer:", await dep.getAddress());

  await (await fac.setDeployer(await dep.getAddress())).wait();

  await (await fac.setBaseTokenWhitelist(BASE_TOKENS, true)).wait();
  console.log("Base token whitelist configured:", BASE_TOKENS.length, "tokens");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
