/**
 * Full deployment script with CREATE2 vanity support
 * 
 * Steps:
 * 1. Deploy TokenDeployer (with factory addr)
 * 2. Deploy LaunchpadFactory
 * 3. Set deployer on factory
 * 4. (Optional) Search for vanity salt
 * 5. (Optional) Deploy project with vanity
 * 
 * Usage: npx hardhat run scripts/deploy-full.mjs --network bsc
 */

import { ethers } from "hardhat";

const E = (n) => ethers.parseEther(n);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Step 1: Deploy LaunchpadFactory (with zero deployer first)
  const MockFactory = await ethers.getContractFactory("MockFactory");
  const mf = await MockFactory.deploy();

  const MockRouter = await ethers.getContractFactory("MockRouter");
  const mr = await MockRouter.deploy();
  await mr.setup(deployer.address, await mf.getAddress());

  const Factory = await ethers.getContractFactory("LaunchpadFactory");
  const fac = await Factory.deploy(await mr.getAddress(), await mf.getAddress(), ethers.ZeroAddress);
  await fac.waitForDeployment();
  console.log("LaunchpadFactory:", await fac.getAddress());

  // Step 2: Deploy TokenDeployer with factory address
  const Deployer = await ethers.getContractFactory("TokenDeployer");
  const dep = await Deployer.deploy(await fac.getAddress());
  await dep.waitForDeployment();
  console.log("TokenDeployer:", await dep.getAddress());

  // Step 3: Set deployer on factory
  await fac.setDeployer(await dep.getAddress());
  console.log("Deployer set on factory");

  // Step 4: Predict a vanity address (example with salt = 1) via CREATE2:
  //   address = keccak256(0xff ++ deployer ++ salt ++ keccak256(initCode))[12:]
  const salt = ethers.zeroPadValue(ethers.toBeHex(1), 32);
  const StocksToken = await ethers.getContractFactory("StocksToken");
  const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "address", "address", "address", "address", "address"],
    ["Test", "TST", await mr.getAddress(), await mf.getAddress(), deployer.address, deployer.address, ethers.ZeroAddress]
  );
  const initCode = StocksToken.bytecode + encodedArgs.slice(2);
  const initCodeHash = ethers.keccak256(initCode);
  const predicted = ethers.getCreate2Address(await dep.getAddress(), salt, initCodeHash);
  console.log("Predicted address (salt=1):", predicted);
  console.log("Ends with 7777?", predicted.toLowerCase().endsWith("7777"));

  console.log("\n=== Deployment Complete ===");
  console.log("Factory:", await fac.getAddress());
  console.log("Deployer:", await dep.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});