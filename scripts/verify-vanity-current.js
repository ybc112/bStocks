const hre = require("hardhat");
const { ethers } = hre;

const FACTORY = process.env.FACTORY_ADDRESS || "0xCfd307a259181103Bf6A86Db8D4aaF48882eAAc1";

async function main() {
  const [user] = await ethers.getSigners();
  const fac = await ethers.getContractAt("LaunchpadFactory", FACTORY);
  const deployerAddress = await fac.deployer();
  const router = await fac.router();
  const pancakeFactory = await fac.factoryERC20();
  const wbnb = await fac.WBNB();
  const nonce = Date.now().toString().slice(-8);
  const name = `Vanity Proof ${nonce}`;
  const symbol = `VP${nonce.slice(-4)}`;
  const artifact = await hre.artifacts.readArtifact("StocksToken");
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "address", "address", "address", "address", "address"],
    [name, symbol, router, pancakeFactory, user.address, user.address, wbnb]
  );
  const initCode = artifact.bytecode + encoded.slice(2);
  const initCodeHash = ethers.keccak256(initCode);

  let found;
  for (let i = 0; i < 5_000_000; i++) {
    const salt = ethers.zeroPadValue(ethers.toBeHex(i), 32);
    const address = ethers.getCreate2Address(deployerAddress, salt, initCodeHash);
    if (address.toLowerCase().endsWith("bbbb")) { found = { salt, address, attempts: i + 1 }; break; }
  }
  if (!found) throw new Error("vanity not found");
  console.log("Predicted:", found.address, "attempts:", found.attempts);

  const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "bytes"], [user.address, found.salt, initCode]
  ));
  const dep = await ethers.getContractAt("TokenDeployer", deployerAddress);
  await (await dep.commitSalt(commitment)).wait();
  const receipt = await (await fac.launchProjectDeterministic(
    initCode, name, symbol, user.address, user.address, ethers.ZeroAddress, found.salt, user.address
  )).wait();

  let actual = "";
  for (const log of receipt.logs) {
    try {
      const event = fac.interface.parseLog(log);
      if (event?.name === "ProjectLaunched2") actual = event.args.token;
    } catch {}
  }
  if (!actual) throw new Error("ProjectLaunched2 missing");
  const token = await ethers.getContractAt("StocksToken", actual);
  console.log("Actual   :", actual);
  console.log("Matches  :", actual.toLowerCase() === found.address.toLowerCase());
  console.log("Ends bbbb:", actual.toLowerCase().endsWith("bbbb"));
  console.log("Supply   :", (await token.totalSupply()).toString());
  console.log("Decimals :", (await token.decimals()).toString());
  console.log("Registered:", await fac.isProject(actual));
  if (actual.toLowerCase() !== found.address.toLowerCase() || !actual.toLowerCase().endsWith("bbbb")) throw new Error("VANITY_MISMATCH");
  if ((await token.totalSupply()) !== 10n ** 30n || (await token.decimals()) !== 0n) throw new Error("SUPPLY_MISMATCH");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
