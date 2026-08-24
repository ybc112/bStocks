const hre = require("hardhat");
async function main() {
  const FAC = "0x95e3358f860997E8F365d0b7f7DddE11C7A79819";
  const TOKEN = "0xE5473aec656b785f25D0b4BD7B607fBa4bf9BBbB";
  const fac = await hre.ethers.getContractAt("LaunchpadFactory", FAC);
  const router = await fac.router();
  const pfac = await fac.factoryERC20();
  const wbnb = await fac.WBNB();
  const t = await hre.ethers.getContractAt("StocksToken", TOKEN);
  const dev = await t.devWallet();
  try {
    await hre.run("verify:verify", {
      address: TOKEN,
      constructorArguments: [await t.name(), await t.symbol(), router, pfac, dev, dev, wbnb],
    });
    console.log("VERIFIED token:", TOKEN);
  } catch (e) {
    const m = e.message || "";
    console.log(m.includes("Already Verified") || m.includes("already verified") ? "ALREADY VERIFIED" : "FAILED: " + m.slice(0, 200));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
