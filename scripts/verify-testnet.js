const hre = require("hardhat");

const FAC = "0xA6c707Ed55CF0c827E496463B20C543bd0614bf4";
const DEP = "0x3BF04C618149c1AEB5Ef094d67bcA16129B58966";
const ROUTER = "0xd99d1c33f9fc3444f8101754abc46c52416550d1";
const PFACTORY = "0x6725f93bf852797fa38b818026b9d04d1684aae6";

async function main() {
  for (const [name, addr, args] of [
    ["LaunchpadFactory", FAC, [ROUTER, PFACTORY, hre.ethers.ZeroAddress]],
    ["TokenDeployer", DEP, [FAC]],
  ]) {
    try {
      await hre.run("verify:verify", { address: addr, constructorArguments: args });
      console.log("VERIFIED:", name, addr);
    } catch (e) {
      const m = e.message || "";
      if (m.includes("Already Verified") || m.includes("already verified")) console.log("ALREADY VERIFIED:", name);
      else console.log("FAILED:", name, m.slice(0, 300));
    }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
