const hre = require("hardhat");
const { ethers } = hre;

const FACTORY = "0xE519DB58FF334AA3f83a7Fb7B584279BBecd9993";
const API = "https://bstocks-api.kimi-vault.com";

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
  const args = [name, symbol, router, pancakeFactory, user.address, user.address, wbnb];

  const response = await fetch(`${API}/api/vanity/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ suffix: "bbbb", deployer: deployerAddress, maxAttempts: 5000000, constructorArgs: args }),
  });
  const found = await response.json();
  if (!response.ok || !found.found) throw new Error(JSON.stringify(found));
  console.log("Predicted:", found.address, "salt:", found.salt, "attempts:", found.attempts);

  const abi = ethers.AbiCoder.defaultAbiCoder();
  const commitment = ethers.keccak256(abi.encode(
    ["address", "bytes32", "string", "string", "address"],
    [user.address, found.salt, name, symbol, wbnb]
  ));
  const dep = await ethers.getContractAt("TokenDeployer", deployerAddress);
  await (await dep.commitSalt(commitment)).wait();
  const receipt = await (await fac.launchProjectDeterministic(
    name, symbol, user.address, user.address, ethers.ZeroAddress, found.salt, user.address
  )).wait();

  let actual = "";
  for (const log of receipt.logs) {
    try {
      const event = fac.interface.parseLog(log);
      if (event?.name === "ProjectLaunched2") actual = event.args.token;
    } catch {}
  }
  if (!actual) throw new Error("ProjectLaunched2 missing");
  console.log("Actual   :", actual);
  console.log("Matches  :", actual.toLowerCase() === found.address.toLowerCase());
  console.log("Ends bbbb:", actual.toLowerCase().endsWith("bbbb"));
  if (actual.toLowerCase() !== found.address.toLowerCase() || !actual.toLowerCase().endsWith("bbbb")) {
    throw new Error("VANITY_MISMATCH");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
