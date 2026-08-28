const hre = require("hardhat");

// Reuses the existing LaunchpadFactory (bytecode unchanged); only the
// StocksToken creation-code hash changed (poolPercent floor 600), so we
// redeploy TokenDeployer with the new hash and wire it into the factory.
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const net = hre.network.name;
  console.log("Network:", net, "| ChainID:", (await hre.ethers.provider.getNetwork()).chainId.toString());
  console.log("Deployer:", deployer.address);

  const Factory = await hre.ethers.getContractFactory("LaunchpadFactory");
  const fac = await Factory.attach("0xA9EE5CF589c848fd6d27bf8F85c7f0997085912a");
  const tokenArtifact = await hre.artifacts.readArtifact("StocksToken");
  const creationCode = hre.ethers.getBytes(tokenArtifact.bytecode);
  const creationCodeHash = hre.ethers.keccak256(creationCode);
  console.log("creationCodeHash:", creationCodeHash, "| len:", creationCode.length);

  const Deployer = await hre.ethers.getContractFactory("TokenDeployer");
  const dep = await Deployer.deploy(await fac.getAddress(), creationCodeHash, creationCode.length);
  await dep.waitForDeployment();
  const depAddr = await dep.getAddress();
  console.log("New TokenDeployer:", depAddr);

  await (await fac.setDeployer(depAddr)).wait();
  console.log("setDeployer ->", depAddr, "confirmed. Factory deployer now:", await fac.deployer());

  if (process.env.BSCSCAN_API_KEY) {
    try {
      await hre.run("verify:verify", { address: depAddr, constructorArguments: [await fac.getAddress(), creationCodeHash, creationCode.length] });
      console.log("Verified TokenDeployer:", depAddr);
    } catch (e) { console.log("Verify failed:", (e.message || "").slice(0, 200)); }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });