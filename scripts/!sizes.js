const fs = require("fs");
const path = require("path");
function size(name){
  const p = path.join(__dirname,"..","artifacts","contracts",name+".sol",name+".json");
  if(!fs.existsSync(p)){ console.log(name, "NO ARTIFACT"); return; }
  const a = JSON.parse(fs.readFileSync(p,"utf8"));
  const deployed = (a.deployedBytecode?.object || "").length/2; // bytes
  const creation = (a.bytecode?.object||"").length/2;
  console.log(`${name}: deployed=${deployed} bytes, creation=${creation} bytes, within24k=${deployed<=24576}`);
}
size("TokenDeployer");
size("StocksToken");
size("LaunchpadFactory");