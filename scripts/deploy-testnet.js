const hre = require("hardhat");

// PancakeSwap V2 on BSC TESTNET (chainId 97)
const TESTNET_ROUTER = "0xd99d1c33f9fc3444f8101754abc46c52416550d1";
const TESTNET_FACTORY = "0x6725f303b657a9451d8ba641348b6761a6cc7a17";

// Same base-token whitelist as mainnet (mainnet token addresses; used for config parity)
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
  const net = hre.network.name;
  console.log("Network:", net, "| ChainID:", (await hre.ethers.provider.getNetwork()).chainId.toString());
  console.log("Deployer:", deployer.address);
  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(bal), "BNB");
  if (bal === 0n) throw new Error("Deployer has 0 BNB - fund the wallet with testnet BNB first");

  // Step 1: LaunchpadFactory (deployer wired later)
  const Factory = await hre.ethers.getContractFactory("LaunchpadFactory");
  const fac = await Factory.deploy(TESTNET_ROUTER, TESTNET_FACTORY, hre.ethers.ZeroAddress);
  await fac.waitForDeployment();
  const facAddr = await fac.getAddress();
  console.log("LaunchpadFactory:", facAddr);

  // Step 2: TokenDeployer owned by factory
  const Deployer = await hre.ethers.getContractFactory("TokenDeployer");
  const tokenArtifact = await hre.artifacts.readArtifact("StocksToken");
  const creationCode = hre.ethers.getBytes(tokenArtifact.bytecode);
  const creationCodeHash = hre.ethers.keccak256(creationCode);
  const dep = await Deployer.deploy(facAddr, creationCodeHash, creationCode.length);
  await dep.waitForDeployment();
  const depAddr = await dep.getAddress();
  console.log("TokenDeployer:", depAddr);

  // Step 3: wire deployer into factory
  await (await fac.setDeployer(depAddr)).wait();
  console.log("Deployer wired into factory");

  // Step 4: base token whitelist (16 tokens + WBNB auto-whitelisted in constructor)
  await (await fac.setBaseTokenWhitelist(BASE_TOKENS, true)).wait();
  const wbnb = await fac.WBNB();
  console.log("Base token whitelist configured: 16 + WBNB =", wbnb);

  console.log("\n=== Deployment summary ===");
  console.log("LaunchpadFactory:", facAddr);
  console.log("TokenDeployer   :", depAddr);
  console.log("Router          :", TESTNET_ROUTER);
  console.log("PancakeFactory  :", TESTNET_FACTORY);

  // Step 5: verify contracts on BSCScan testnet
  if (process.env.BSCSCAN_API_KEY) {
    console.log("\nVerifying on BscScan testnet...");
    for (const [name, addr, args] of [
      ["LaunchpadFactory", facAddr, [TESTNET_ROUTER, TESTNET_FACTORY, hre.ethers.ZeroAddress]],
      ["TokenDeployer", depAddr, [facAddr, creationCodeHash, creationCode.length]],
    ]) {
      try {
        await hre.run("verify:verify", { address: addr, constructorArguments: args });
        console.log("Verified:", name, addr);
      } catch (e) {
        console.log("Verify failed:", name, (e.message || "").slice(0, 200));
      }
    }
  } else {
    console.log("\nBSCSCAN_API_KEY not set - skip verification");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
