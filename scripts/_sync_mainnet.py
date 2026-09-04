import paramiko, posixpath, glob, os
HOST="38.190.206.234"; PORT=54470; USER="root"; PWD="dp4fL26QcZYD"
LOCAL=os.path.abspath("artifacts")
REMOTE="/opt/bstocks/artifacts"
NEW_F="0xd7029BfA0fa29511395348E3CfB7aa5165098925"
NEW_D="0x34acAbc6bC0bCd25F4b6e9aB1A46f3aD2Fc1bC4B"
c=paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST,port=PORT,username=USER,password=PWD,timeout=30)
sftp=c.open_sftp()
def put(local,remote):
    sftp.put(local,remote); print("uploaded",remote)

# 2b) updated backend server.mjs (verify fix)
put(os.path.abspath("backend/server.mjs"), "/opt/bstocks/backend/server.mjs")

# 1) artifact json
c.exec_command(f"mkdir -p {REMOTE}/contracts/StocksToken.sol")[1].read()
put(f"{LOCAL}/contracts/StocksToken.sol/StocksToken.json", f"{REMOTE}/contracts/StocksToken.sol/StocksToken.json")
# 2) all build-info
c.exec_command(f"rm -rf {REMOTE}/build-info && mkdir -p {REMOTE}/build-info")[1].read()
for f in glob.glob(f"{LOCAL}/build-info/*.json"):
    put(f, f"{REMOTE}/build-info/{os.path.basename(f)}")
# 3) env
ENV="/opt/bstocks/backend/.env"
c.exec_command(f"cp {ENV} {ENV}.pre-cap && sed -i 's|^FACTORY_ADDRESS=.*|FACTORY_ADDRESS={NEW_F}|; s|^DEPLOYER_ADDRESS=.*|DEPLOYER_ADDRESS={NEW_D}|' {ENV}")[1].read()
# 4) restart
c.exec_command("pm2 restart bstocks-backend --update-env")[1].read()
import time; time.sleep(4)
# 5) verify
_,o,_=c.exec_command(f"grep -E 'FACTORY_ADDRESS|DEPLOYER_ADDRESS|CHAIN_ID' {ENV}")
print("--- env ---"); print(o.read().decode().strip())
_,o,_=c.exec_command("curl -s http://127.0.0.1:3011/api/config"); print("--- /api/config ---"); print(o.read().decode().strip()[:300])
_,o,_=c.exec_command("curl -s http://127.0.0.1:3011/api/vanity/init-code-hash | head -c 200"); print("--- init-code-hash ---"); print(o.read().decode().strip()[:200])
sftp.close(); c.close()