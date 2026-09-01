# 合约升级 / 字节码变化 全链路更新检查清单（SKILL）

> 用途：每次改动 `contracts/`（尤其是 `StocksToken.sol` 改变字节码）、升级 Factory/Deployer、或改 ABI/后端校验时，**按这个清单逐项执行**，避免漏改导致发射失败、售后坏账、验证不过。

> 目标环境：BSC 主网 chainId=56。部署钱包：`0x39bB78BAdEC9d906CA77aF6b0882D0114263544F`（私钥在项目 `.env` 的 `PRIVATE_KEY`）。
> 目标服务器：`38.190.206.234:54470` root，后端路径 `/opt/bstocks/backend`，**artifact 读取路径是 `/opt/bstocks/artifacts`（仓库根，不是 backend/artifacts）**。
> 前端：`frontend/src/contracts.ts` 的 `ENV_FACTORY`，部署走 GitHub push → Vercel。

---

## 0. 前置：改合约时记住的硬约束（来自项目历史教训）

- `StocksToken.sol` 的关键参数必须走链上 `configMint/configTax/...`，不要只在前端写死。
- 代币地址尾号 `bbbb`（Factory `require(uint16(uint160(token))==0xbbbb)`）。
- 税收分配四项 **m+bb+l+d == 800**（平台固定 200，合计 1000）→ 否则 `DIST80` 回退。
- 分红 HOLD/LIQ/BURN 互斥。
- `minCapBNB` 已降到 `0.001 ether`（支持 0.01 打款）。
- 卖出清税**必须非阻断**（`_processFees` 内部 swap 全部 `try/catch`），否则薄池会整笔回退。
- 打满即 `owner = DEAD`（自动丢权限）。

---

## 1. 重编译

```bash
npx hardhat compile
```

- 确认编译通过、且字节码确实变化（见第 2 步身份比对）。

---

## 2. 记录新字节码身份（后面反复用来核验一致性）

用 node 计算（`create-address` 用于预测工厂会用到的部署地址）：

```js
const {keccak256,getBytes,getCreateAddress}=require('ethers');
const art=require('./artifacts/contracts/StocksToken.sol/StocksToken.json');
console.log('creationHash=', keccak256(getBytes(art.bytecode)));
console.log('creationLen =', (art.bytecode.length-2)/2);
console.log('runtimeLen  =', (art.deployedBytecode.length-2)/2);
```

把这三个值存好。它们必须最终与“链上 TokenDeployer 的 `tokenCreationCodeHash / tokenCreationCodeLength`”一致。

---

## 3. 主网部署新的 Factory + Deployer（字节码变了就必须重部署）

> 要点（历史踩坑）：
> - 用稳定 RPC `https://bsc-dataseed.bnbchain.org` 广播；签名**必须带 `chainId:56`**，否则节点报 "invalid chain id for signer"。
> - **务必显式给 `gasLimit`**，否则 ethers `deploy()`/`getDeployTransaction` 会自动估算、走 `eth_call` 读回 `0x`，报 `cannot slice beyond data bounds`。
> - 不要用 hardhat 的 `deploy()` 读回（会 BAD_DATA）；用 `eth_sendRawTransaction` + 轮询 `getCode` 确认。
> - nonce 顺序问题：某个 nonce 卡在 mempool 会卡死后续，需要 `fee-bump` 覆盖（baseFee*2 + 3+ gwei）。

流程（Deployer 构造参数固定为 `[factoryAddr, creationHash, creationLen]`）：
1. `LaunchpadFactory.deploy(ROUTER=0x10ED…, PFACTORY=0xcA143…, ZERO)` → `NEW_FACTORY`
2. `TokenDeployer.deploy(NEW_FACTORY, keccak256(newBytecode), newBytecodeLen)` → `NEW_DEPLOYER`
3. `NEW_FACTORY.setDeployer(NEW_DEPLOYER)`

`ROUTER`/`PFACTORY` 拼写要精确（`0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` 不是 `…2fFC…`）。

部署后校验：
```
NEW_FACTORY.deployer()==NEW_DEPLOYER
NEW_FACTORY.WBNB()==0xbb4C… , router==0x10ED… , factoryERC20()==0xcA143…
NEW_DEPLOYER.tokenCreationCodeHash == 新 creationHash，tokenCreationCodeLength == 新 creationLen
```

---

## 4. 服务器同步（**最常漏**——两处 artifact 路径！）

服务器**从 `/opt/bstocks/artifacts`（仓库根）**读 artifact 和 build-info，**不是** `/opt/bstocks/backend/artifacts`。后者的 `../artifacts` 指向 `/opt/bstocks/artifacts`。

必须同步/更新的服务器文件：
1. `/opt/bstocks/artifacts/contracts/StocksToken.sol/StocksToken.json`（新 artifact）
2. `/opt/bstocks/artifacts/build-info/*.json`（**新 build-info**；旧的要清掉或确保不会被选中，见 §7 校验点）
3. `/opt/bstocks/backend/.env` 里 `FACTORY_ADDRESS=NEW_FACTORY`、`DEPLOYER_ADDRESS=NEW_DEPLOYER`（`CHAIN_ID=56` 保持不变）
4. **如果后端代码变了**（如 `server.mjs`）→ 上传 `/opt/bstocks/backend/server.mjs`
5. `pm2 restart bstocks-backend --update-env`

> 服务器 artifact 同步脚本：`scripts/_sync_mainnet.py`。它把本地 `artifacts/`（相对项目根）传到 `/opt/bstocks/artifacts`，并更新 env + `server.mjs` + 重启。运行前先改好脚本里的 `NEW_F/NEW_D`。

---

## 5. 前端同步

- `frontend/src/contracts.ts` → `export const ENV_FACTORY = "0x<NEW_FACTORY>"`（只改这一处地址）。
- 前端从服务器拿 `initCode`（`/api/vanity/init-code-hash`），所以服务器必须已同步（第 4 步）。
- build + commit + push 触发 Vercel：
  ```bash
  cd frontend && npm run build
  cd .. && git add frontend/src/contracts.ts && git commit -m "..." && git push origin master
  ```
- 让用户**清浏览器缓存/站点数据或开无痕**，确保加载新 bundle 和新 Factory。

---

## 6. 提交代码（安全红线）

- 只 `git add` 业务文件：`contracts/*.sol`、`backend/server.mjs`、`frontend/src/contracts.ts`。
- **绝不提交**含口令/私钥的临时工具脚本（`_*.py`/`_*.js` 诊断脚本、`deploy-*` 脚本），它们内含部署钱包私钥或服务器密码。用 `git status` 看清 untracked，只 add 指定文件。

---

## 7. 端到端核验（发射一个测试代币前必做）

1. 服务器与链上字节码一致：
   ```js
   // 服务器 /api/vanity/init-code-hash(7 个构造参数) 返回 initCode，
   // 取前 tokenCreationCodeLength 字节做 keccak256，必须 == 链上 deployer tokenCreationCodeHash
   ```
2. `/api/config` 返回 `factoryAddress/deployerAddress == 新地址`。
3. 后端 `build-info` 选择正确（防踩坑）：
   - 现在 `server.mjs` 会**只选“编译出的 StocksToken 创建字节码 == 当前离线 artifact 字节码”那份 build-info**。
   - 多份 build-info 并存时，确认选中那份的 hash == 部署用的 creationHash（`0x…0aafdbee` 之类）。若不符，清掉服务器 build-info 目录里旧的。
4. `resolveFactoryAddress()`（前端）返回新 Factory。
5. 发一个测试代币 → 走通 `commitSalt → launchProjectDeterministicAndConfigure`（不再 `CreateFailed`、不再 `DIST80`）。
6. **自动开源**：`/api/verify/submit` 返回 `submitted` + real GUID，随后 `/api/verify/status` 变 `verified`。若报 `Unable to locate ContractCode` → 是索引未就绪，等几秒会自动重试（backend 已加重试）。若报 `Compiled … does NOT match` → 是 build-info 选错（见第一条）。

---

## 8. 发射前端操作提醒（给用户的发射前清单）

- 清浏览器缓存/站点数据 / 无痕。
- 用 BSC 主网 RPC + 钱包 `0x39bB78BA`（余额充足）。
- 确认 `resolveFactoryAddress()` == 新 Factory。
- 税收四项 **m+bb+l+d=800**；参数无负数/无非法资产名。
- 打满后自动 `DEAD`（丢权限）+ 自动开源。

---

## 9. 常见报错 → 排查对照

| 报错 | 原因 | 处理 |
|---|---|---|
| `CreateFailed` (0x7e16b8cd) | 前端/服务器 `initCode` 与链上 deployer 的 creationCode 不一致 | 重编译 → 重部署 → 同步服务器 → 清前端缓存 |
| `DIST80` | 税收四项之和 ≠ 800 | 改参数再发射 |
| `VANITY` | 代币地址尾号非 bbbb | 重搜盐 |
| `Pancake:K` / 卖出整笔回退 | 池子太薄 or 清税重入 | 加池子深度 / 提高 swapThreshold |
| 自动开源 `does NOT match` | build-info 选错（旧字节码） | 见 §7-3，清服务器 build-info |
| 自动开源 `Unable to locate ContractCode` | BscScan 索引未就绪 | 已自动重试；或稍后手动重提 |

---

## 10. 下次改合约的“最小路径”速查

改 Solidity → `npx hardhat compile` → 记录 creationHash/len → 主网重部署 Factory+Deployer（gasLimit 显式、chainId:56、稳定 RPC）→ 更新 `scripts/_sync_mainnet.py` 的 `NEW_F/NEW_D` → `python scripts/_sync_mainnet.py`（传 artifact+build-info+server.mjs+env，正确路径 `/opt/bstocks/artifacts`，重启）→ 更新 `frontend/src/contracts.ts` ENV_FACTORY → build → commit(只加业务文件) → push → 用测试代币走通发射+自动开源。