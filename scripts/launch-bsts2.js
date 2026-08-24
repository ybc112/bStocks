const hre = require("hardhat");
const { ethers } = hre;

const FAC = "0x95e3358f860997E8F365d0b7f7DddE11C7A79819";
const DEP = "0x7C98Ecac31d865367029729cDcECf2BABF01a5c3";
const ROUTER = "0xd99d1c33f9fc3444f8101754abc46c52416550d1";
const PFACTORY = "0x6725f303b657a9451d8ba641348b6761a6cc7a17";
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const SALT = "0x0000000000000000000000000000000000000000000000000000000000005c6e";

async function main() {
  const [dev] = await hre.ethers.getSigners();
  const fac = await hre.ethers.getContractAt("LaunchpadFactory", FAC);
  const dep = await hre.ethers.getContractAt("TokenDeployer", DEP);
  const name = "bStocks Test2", symbol = "BSTS2";

  const abi = ethers.AbiCoder.defaultAbiCoder();
  const commitment = ethers.keccak256(abi.encode(
    ["address", "bytes32", "string", "string", "address"],
    [dev.address, SALT, name, symbol, WBNB]));
  await (await dep.commitSalt(commitment)).wait();
  console.log("commitSalt: confirmed");

  const tx = await fac.launchProjectDeterministic(name, symbol, dev.address, dev.address, WBNB, SALT, dev.address);
  const rc = await tx.wait();
  let tokenAddr = null;
  for (const log of rc.logs) {
    try {
      const ev = fac.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (ev && ev.name === "ProjectLaunched2") { tokenAddr = ev.args.token; break; }
    } catch {}
  }
  console.log("Token:", tokenAddr, tokenAddr.toLowerCase().endsWith("bbbb") ? "(ends bbbb)" : "BAD");
  console.log("Tx   :", rc.transactionHash);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
