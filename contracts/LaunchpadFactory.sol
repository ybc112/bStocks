// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./StocksToken.sol";
import "./TokenDeployer.sol";
import "./FeeReceiver.sol";

contract LaunchpadFactory {
    string public constant platformName = "bStocks";
    string public constant platformSymbol = "BSTK";
    uint8 public constant platformDecimals = 18;
    uint256 public platformTotalSupply;
    mapping(address => uint256) public platformBalance;
    mapping(address => mapping(address => uint256)) public platformAllowance;

    event PlatformTransfer(address indexed from, address indexed to, uint256 value);
    event PlatformApproval(address indexed owner, address indexed spender, uint256 value);
    event ProjectLaunched(address indexed token, address indexed dev, address baseToken);
    event ProjectLaunched2(address indexed token, address indexed dev, address indexed baseToken, bytes32 salt, bool deterministic, string name, string symbol);
    event FeeCollected(address indexed project, uint256 value, uint256 community, uint256 referral);
    event FeeReceiverAttached(address indexed token, address indexed receiver);
    event ReferralAccrued(address indexed account, uint256 amount);
    event ReferralClaimed(address indexed account, uint256 amount);

    uint256 public platformAccPerShare;
    uint256 public platformTotalShares;
    uint256 public platformDivReserve;
    uint256 public constant DIV_PRECISION = 1e18;
    mapping(address => uint256) public platformShares;
    mapping(address => uint256) public platformPaidPerShare;
    // Rewards which have accrued to an account but could not be sent (for
    // example, a contract that rejects native BNB).  Keeping this separate
    // prevents a failed payout from being silently erased when the account
    // transfers its BSTK.
    mapping(address => uint256) public platformClaimable;
    // Integer-division dust and rewards received while there was no holder.
    // They remain in the platform reserve and are flushed when shares exist.
    uint256 public platformUnallocated;

    address public owner;
    address public pendingOwner;
    IPancakeRouter public router;
    TokenDeployer public deployer;
    address public factoryERC20;
    address public WBNB;
    // A single FeeReceiver implementation is shared by cheap EIP-1167 clones.
    // Keeping the implementation outside this contract avoids embedding the
    // whole fee engine in Factory runtime bytecode (and keeps it deployable
    // under the EVM 24KB limit).
    address public feeReceiverImplementation;
    address[] public projects;
    mapping(address => bool) public isProject;
    mapping(address => bool) public baseTokenWhitelist;
    mapping(address => address) public tokenCreator;

    mapping(address => address) public parentOf;
    mapping(address => bool) public registered;
    // Referral payouts are credited per recipient when a recipient contract
    // rejects a push payment.  Keeping an owed ledger prevents the owner from
    // withdrawing those funds through the aggregate reserve.
    mapping(address => uint256) public referralClaimable;
    uint256 public referralOwedTotal;

    uint256 public communityPool;
    uint256 public referralReserve;
    // Community funds are represented by the platform dividend reserve once
    // received.  This field is intentionally kept separate for future
    // governance-controlled, not-yet-accrued funds and is included in the
    // withdrawal reserve calculation.
    uint256 public communityReserve;

    modifier onlyOwner() { require(msg.sender == owner, "NO"); _; }
    modifier onlyProjectOwner(address t) {
        require(isProject[t], "PRJ");
        require(tokenCreator[t] == msg.sender || msg.sender == owner, "NA");
        _;
    }
    modifier nonReentrant() { require(!_inReentrant, "RE"); _inReentrant = true; _; _inReentrant = false; }
    bool internal _inReentrant;

    function _requireBase(address base) internal view {
        require(baseTokenWhitelist[base], "BASE");
        // Mirror pools need a WBNB bridge for Mint conversion and for the
        // platform's fixed-BNB share.  Rejecting a base with no bridge here is
        // much clearer than creating a token that can never mint or settle its
        // platform bucket.
        if (base != WBNB) require(IPancakeFactory(factoryERC20).getPair(base, WBNB) != address(0), "ROUTE");
    }

    constructor(address _router, address _factory, address _deployer) {
        require(_router != address(0) && _factory != address(0), "DEX");
        owner = msg.sender;
        router = IPancakeRouter(_router);
        factoryERC20 = _factory;
        WBNB = router.WETH();
        require(WBNB != address(0), "WBNB");
        deployer = TokenDeployer(_deployer);
        // The receiver implementation is deployed as a separate transaction
        // and attached via setFeeReceiverImplementation before the first
        // launch.  Embedding `new FeeReceiver()` here inflates this factory's
        // creation-code to ~46KB (+24KB impl initcode) and triples the deploy
        // gas/fee for every project built on top of it.  attachFeeEngine()
        // keeps the old "fail-fast if any launch runs without an impl" guard.
        // The implementation is independent of CREATE2 token addresses, so
        // this does not change vanity predictions.
        baseTokenWhitelist[WBNB] = true;
        _platformMint(msg.sender, 10000 * (10 ** platformDecimals));
        _setPlatformShares(msg.sender);
    }

    receive() external payable {}

    function _platformMint(address to, uint256 amount) internal { platformTotalSupply += amount; platformBalance[to] += amount; emit PlatformTransfer(address(0), to, amount); }
    function platformTransfer(address to, uint256 amount) public returns (bool) { _platformTransfer(msg.sender, to, amount); return true; }
    function platformApprove(address spender, uint256 amount) public returns (bool) { platformAllowance[msg.sender][spender] = amount; emit PlatformApproval(msg.sender, spender, amount); return true; }

    function platformTransferFrom(address from, address to, uint256 amount) public returns (bool) {
        uint256 a = platformAllowance[from][msg.sender];
        if (a != type(uint256).max) { require(a >= amount, "AL"); platformAllowance[from][msg.sender] = a - amount; }
        _platformTransfer(from, to, amount);
        return true;
    }

    function _platformTransfer(address from, address to, uint256 amount) internal nonReentrant {
        require(platformBalance[from] >= amount, "BAL");
        require(to != address(0), "ZERO");
        _settlePlatform(from);
        _settlePlatform(to);
        platformBalance[from] -= amount;
        platformBalance[to] += amount;
        _setPlatformShares(from);
        _setPlatformShares(to);
        emit PlatformTransfer(from, to, amount);
    }

    function _setPlatformShares(address account) internal {
        uint256 b = platformBalance[account];
        uint256 old = platformShares[account];
        if (old == b) {
            _flushPlatformUnallocated();
            _accruePlatformAccount(account);
            return;
        }

        // Allocate rounding dust to the holders that existed before changing
        // the denominator, then settle this account's old position.
        _flushPlatformUnallocated();
        _accruePlatformAccount(account);
        uint256 accBefore = platformAccPerShare;
        if (old > 0) platformTotalShares -= old;
        platformShares[account] = b;
        if (b > 0) {
            bool wasEmpty = platformTotalShares == 0;
            platformTotalShares += b;
            if (wasEmpty) {
                // The first holder receives rewards accumulated while the
                // denominator was empty; use the pre-flush index as baseline.
                _flushPlatformUnallocated();
                platformPaidPerShare[account] = (b * accBefore) / DIV_PRECISION;
            } else {
                platformPaidPerShare[account] = (b * platformAccPerShare) / DIV_PRECISION;
            }
        } else {
            platformPaidPerShare[account] = 0;
        }
    }

    function _settlePlatform(address account) internal {
        _accruePlatformAccount(account);
        uint256 due = platformClaimable[account];
        if (due == 0 || due > platformDivReserve) return;
        (bool success,) = payable(account).call{value: due}("");
        if (success) {
            platformClaimable[account] = 0;
            platformDivReserve -= due;
        }
    }

    function _accruePlatformAccount(address account) internal {
        uint256 share = platformShares[account];
        if (share == 0) return;
        uint256 gross = (share * platformAccPerShare) / DIV_PRECISION;
        uint256 paid = platformPaidPerShare[account];
        if (gross > paid) {
            platformClaimable[account] += gross - paid;
            platformPaidPerShare[account] = gross;
        }
    }

    function _flushPlatformUnallocated() internal {
        if (platformUnallocated == 0 || platformTotalShares == 0) return;
        uint256 delta = (platformUnallocated * DIV_PRECISION) / platformTotalShares;
        if (delta == 0) return;
        platformAccPerShare += delta;
        uint256 assigned = (delta * platformTotalShares) / DIV_PRECISION;
        platformUnallocated = assigned >= platformUnallocated
            ? 0
            : platformUnallocated - assigned;
    }

    function setBaseTokenWhitelist(address[] calldata tokens, bool f) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) baseTokenWhitelist[tokens[i]] = f;
    }

    function setDeployer(address d) external onlyOwner {
        require(d != address(0) && d.code.length > 0, "DEP");
        deployer = TokenDeployer(d);
    }
    function setFeeReceiverImplementation(address a) external onlyOwner {
        require(a != address(0) && a.code.length > 0, "FR0");
        require(feeReceiverImplementation == address(0) || projects.length == 0, "FRLOCK");
        feeReceiverImplementation = a;
    }

    function launchProject(
        bytes calldata initCode,
        string calldata _name,
        string calldata _symbol,
        address _dev,
        address _marketing,
        address _baseToken
    ) external returns (address) {
        require(_dev != address(0) && _marketing != address(0), "WALLET");
        address base = _baseToken == address(0) ? WBNB : _baseToken;
        _requireBase(base);
        bytes32 salt = keccak256(abi.encodePacked(address(this), msg.sender, _name, _symbol, block.number, block.prevrandao));
        bytes32 commitment = keccak256(abi.encode(address(this), salt, initCode));
        deployer.commitSalt(commitment);
        address tokenAddr = deployer.revealAndDeploy(initCode, salt, address(this));
        StocksToken t = StocksToken(payable(tokenAddr));
        require(keccak256(bytes(t.name())) == keccak256(bytes(_name)) && keccak256(bytes(t.symbol())) == keccak256(bytes(_symbol)), "META");
        require(address(t.router()) == address(router) && address(t.pancakeFactory()) == factoryERC20, "DEX");
        require(t.devWallet() == _dev && t.marketingWallet() == _marketing && t.baseToken() == base, "ARGS");
        t.acceptOwnership();
        _attachFeeReceiver(t);
        t.setLaunchpad(address(this));
        projects.push(tokenAddr);
        isProject[tokenAddr] = true;
        tokenCreator[tokenAddr] = msg.sender;
        emit ProjectLaunched(tokenAddr, _dev, base);
        return tokenAddr;
    }

    function launchProjectDeterministic(
        bytes calldata initCode,
        string calldata _name,
        string calldata _symbol,
        address _dev,
        address _marketing,
        address _baseToken,
        bytes32 salt,
        address user
    ) external returns (address) {
        require(user == msg.sender, "USER");
        require(_dev != address(0) && _marketing != address(0), "WALLET");
        address base = _baseToken == address(0) ? WBNB : _baseToken;
        _requireBase(base);
        address tokenAddr = deployer.revealAndDeploy(initCode, salt, user);
        require(uint16(uint160(tokenAddr)) == 0xbbbb, "VANITY");
        StocksToken t = StocksToken(payable(tokenAddr));
        require(keccak256(bytes(t.name())) == keccak256(bytes(_name)) && keccak256(bytes(t.symbol())) == keccak256(bytes(_symbol)), "META");
        require(address(t.router()) == address(router) && address(t.pancakeFactory()) == factoryERC20, "DEX");
        require(t.devWallet() == _dev && t.marketingWallet() == _marketing && t.baseToken() == base, "ARGS");
        t.acceptOwnership();
        _attachFeeReceiver(t);
        t.setLaunchpad(address(this));
        projects.push(tokenAddr);
        isProject[tokenAddr] = true;
        tokenCreator[tokenAddr] = msg.sender;
        emit ProjectLaunched2(tokenAddr, _dev, base, salt, true, _name, _symbol);
        emit ProjectLaunched(tokenAddr, _dev, base);
        return tokenAddr;
    }


    function handover(address t, address dev) external onlyOwner { _token(t).transferOwnership(dev); }

    function _token(address t) internal pure returns (StocksToken) { return StocksToken(payable(t)); }

    // The receiver must be owned by the token itself: StocksToken calls
    // withdraw() after Router sends BNB there, while the Pair rejects sending
    // WBNB/BNB directly to the token contract.
    function _attachFeeReceiver(StocksToken t) internal {
        address implementation = feeReceiverImplementation;
        require(implementation != address(0), "FRIMPL");
        FeeReceiverProxy receiver = new FeeReceiverProxy(implementation, address(t));
        // Fail the launch immediately if the proxy did not bind to this token;
        // otherwise every later fee/dividend call would only fail silently.
        (bool ownerOk, bytes memory ownerData) = address(receiver).staticcall(abi.encodeWithSignature("owner()"));
        (bool tokenOk, bytes memory tokenData) = address(receiver).staticcall(abi.encodeWithSignature("token()"));
        require(ownerOk && tokenOk && ownerData.length >= 32 && tokenData.length >= 32
            && abi.decode(ownerData, (address)) == address(t)
            && abi.decode(tokenData, (address)) == address(t), "FRBIND");
        t.setFeeReceiver(address(receiver));
        emit FeeReceiverAttached(address(t), address(receiver));
    }

    function configMint(address t, bool wl, uint256 poolPct, uint256 lpRatio, uint256 minM, uint256 maxM, uint256 wCap, uint256 cap, uint256 duration) external onlyProjectOwner(t) {
        _token(t).setMintConfig(wl, poolPct, lpRatio, minM, maxM, wCap, cap, duration);
    }
    function configTax(address t, uint256 b, uint256 s, uint256 tr) external onlyProjectOwner(t) { _token(t).setTax(b, s, tr); }
    function configFeeDistribution(address t, uint256 m, uint256 bb, uint256 l, uint256 d) external onlyProjectOwner(t) { _token(t).setFeeDistribution(m, bb, l, d); }
    function configExclude(address t, address a, bool f) external onlyOwner { _token(t).setExcluded(a, f); }
    // 分红排除名单：把交易所/锁仓等地址排除出分红(黑洞/池子/合约/路由已链上自动排除)
    function configExcludeDiv(address t, address a, bool f) external onlyProjectOwner(t) { _token(t).setDividendExcluded(a, f); }
    function configWhitelist(address t, address[] calldata addrs, bool f) external onlyProjectOwner(t) { _token(t).setWhitelist(addrs, f); }
    function configDiv(address t, uint8 id, address rewardToken, uint256 minEligible, bool f) external onlyProjectOwner(t) { _token(t).enableDiv(id, rewardToken, minEligible, f); }
    function configPool(address t, address p) external onlyProjectOwner(t) {
        address expected = IPancakeFactory(factoryERC20).getPair(t, _token(t).baseToken());
        require(expected != address(0) && expected == p, "PAIR");
        _token(t).setPair(p);
    }
    function configAddPool(address t, address p) external onlyProjectOwner(t) { _token(t).addPool(p); }
// Atomic launch: deterministic deploy + full configuration in ONE tx. After
    // acceptOwnership() THIS factory is the token owner, so all onlyOwner setters
    // apply here. Fee distribution must sum to 800 (platform fixed at 200).
    function launchProjectDeterministicAndConfigure(
        bytes calldata initCode,
        string calldata _name,
        string calldata _symbol,
        address _dev,
        address _marketing,
        address _baseToken,
        bytes32 salt,
        address user,
        bool _wl,
        uint256 _poolPct,
        uint256 _lpRatio,
        uint256 _minM,
        uint256 _maxM,
        uint256 _wCap,
        uint256 _cap,
        uint256 _duration,
        uint256 _buy,
        uint256 _sell,
        uint256 _transfer,
        uint256 _m,
        uint256 _bb,
        uint256 _l,
        uint256 _d,
        uint8 _divId,
        address _divReward,
        uint256 _divMin
    ) external returns (address tokenAddr) {
        require(user == msg.sender, "USER");
        require(_dev != address(0) && _marketing != address(0), "WALLET");
        require(_m + _bb + _l + _d == 800, "DIST80");
        require(_d == 0 || (_divId >= 1 && _divId <= 3), "DIV");
        address base = _baseToken == address(0) ? WBNB : _baseToken;
        require(base != address(0) && base != address(this), "BASE");
        _requireBase(base);
        tokenAddr = deployer.revealAndDeploy(initCode, salt, user);
        // This atomic entry point is the vanity path.  A random/non-vanity
        // launch uses launchProjectDeterministic plus the explicit config
        // wrappers below, so the UI can never display a false bbbb result.
        require(uint16(uint160(tokenAddr)) == 0xbbbb, "VANITY");
        StocksToken t = _token(tokenAddr);
        require(keccak256(bytes(t.name())) == keccak256(bytes(_name)) && keccak256(bytes(t.symbol())) == keccak256(bytes(_symbol)), "META");
        require(address(t.router()) == address(router) && address(t.pancakeFactory()) == factoryERC20, "DEX");
        require(t.devWallet() == _dev && t.marketingWallet() == _marketing && t.baseToken() == base, "ARGS");
        t.acceptOwnership();
        _attachFeeReceiver(t);
        t.setLaunchpad(address(this));
        projects.push(tokenAddr);
        isProject[tokenAddr] = true;
        tokenCreator[tokenAddr] = user;
        t.setMintConfig(_wl, _poolPct, _lpRatio, _minM, _maxM, _wCap, _cap, _duration);
        t.setTax(_buy, _sell, _transfer);
        t.setFeeDistribution(_m, _bb, _l, _d);
        if (_divId != 0) t.enableDiv(_divId, _divReward, _divMin, true);
        emit ProjectLaunched2(tokenAddr, _dev, base, salt, true, _name, _symbol);
        emit ProjectLaunched(tokenAddr, _dev, base);
    }

    // Ordinary (non-vanity) atomic launch.  The previous UI path deployed a
    // token first and then sent four or five independent configuration
    // transactions; a wallet rejection or RPC timeout could leave a live but
    // unusable half-configured token.  This entry point uses the same internal
    // commit/reveal flow as launchProject and applies the complete immutable
    // launch configuration in one transaction.
    function launchProjectAndConfigure(
        bytes calldata initCode,
        string calldata _name,
        string calldata _symbol,
        address _dev,
        address _marketing,
        address _baseToken,
        bool _wl,
        uint256 _poolPct,
        uint256 _lpRatio,
        uint256 _minM,
        uint256 _maxM,
        uint256 _wCap,
        uint256 _cap,
        uint256 _duration,
        uint256 _buy,
        uint256 _sell,
        uint256 _transfer,
        uint256 _m,
        uint256 _bb,
        uint256 _l,
        uint256 _d,
        uint8 _divId,
        address _divReward,
        uint256 _divMin
    ) external returns (address tokenAddr) {
        require(_dev != address(0) && _marketing != address(0), "WALLET");
        require(_m + _bb + _l + _d == 800, "DIST80");
        require(_d == 0 || (_divId >= 1 && _divId <= 3), "DIV");
        address base = _baseToken == address(0) ? WBNB : _baseToken;
        _requireBase(base);

        bytes32 salt = keccak256(abi.encodePacked(address(this), msg.sender, _name, _symbol, block.number, block.prevrandao));
        bytes32 commitment = keccak256(abi.encode(address(this), salt, initCode));
        deployer.commitSalt(commitment);
        tokenAddr = deployer.revealAndDeploy(initCode, salt, address(this));

        StocksToken t = StocksToken(payable(tokenAddr));
        require(keccak256(bytes(t.name())) == keccak256(bytes(_name)) && keccak256(bytes(t.symbol())) == keccak256(bytes(_symbol)), "META");
        require(address(t.router()) == address(router) && address(t.pancakeFactory()) == factoryERC20, "DEX");
        require(t.devWallet() == _dev && t.marketingWallet() == _marketing && t.baseToken() == base, "ARGS");

        t.acceptOwnership();
        _attachFeeReceiver(t);
        t.setLaunchpad(address(this));
        projects.push(tokenAddr);
        isProject[tokenAddr] = true;
        tokenCreator[tokenAddr] = msg.sender;

        t.setMintConfig(_wl, _poolPct, _lpRatio, _minM, _maxM, _wCap, _cap, _duration);
        t.setTax(_buy, _sell, _transfer);
        t.setFeeDistribution(_m, _bb, _l, _d);
        if (_divId != 0) t.enableDiv(_divId, _divReward, _divMin, true);

        emit ProjectLaunched2(tokenAddr, _dev, base, salt, false, _name, _symbol);
        emit ProjectLaunched(tokenAddr, _dev, base);
    }

    function register(address parent) external {
        require(parent != address(0) && parent != msg.sender, "PR");
        require(!registered[msg.sender], "DONE");
        require(registered[parent], "PREG");
        parentOf[msg.sender] = parent;
        registered[msg.sender] = true;
    }
    function registerFirst(address user) external onlyOwner { registered[user] = true; }

    function onProjectFee(address project, address contributor, uint256 bnbValue) external payable nonReentrant {
        require(msg.sender == project || msg.sender == owner, "ONLY_PROJECT");
        require(isProject[project], "PRJ");
        require(bnbValue == msg.value && bnbValue > 0, "BAL");
        uint256 value = bnbValue;

        uint256 community = (value * 75) / 100;
        uint256 r1 = (value * 15) / 100;
        uint256 r2 = value - community - r1;

        communityPool += community;
        // The community share is the 15% (of total tax) platform dividend
        // described by the product: it must enter the BSTK dividend ledger,
        // not sit in an owner-controlled pool.
        _accruePlatform(community);

        address l1 = registered[contributor] ? parentOf[contributor] : address(0);
        if (l1 != address(0) && registered[l1]) {
            (bool ok1,) = payable(l1).call{value: r1}("");
            if (!ok1) _creditReferral(l1, r1);
        } else referralReserve += r1;
        address l2 = (l1 != address(0) && registered[l1]) ? parentOf[l1] : address(0);
        if (l2 != address(0) && registered[l2]) {
            (bool ok2,) = payable(l2).call{value: r2}("");
            if (!ok2) _creditReferral(l2, r2);
        } else referralReserve += r2;

        emit FeeCollected(project, value, community, r1 + r2);
    }

    function fundPlatformDiv() external payable {
        if (msg.value == 0) return;
        _accruePlatform(msg.value);
    }

    function _accruePlatform(uint256 amount) internal {
        if (amount == 0) return;
        platformDivReserve += amount;
        uint256 distributable = amount + platformUnallocated;
        if (platformTotalShares == 0) {
            platformUnallocated = distributable;
            return;
        }
        uint256 delta = (distributable * DIV_PRECISION) / platformTotalShares;
        if (delta == 0) {
            platformUnallocated = distributable;
            return;
        }
        platformAccPerShare += delta;
        uint256 assigned = (delta * platformTotalShares) / DIV_PRECISION;
        platformUnallocated = assigned >= distributable ? 0 : distributable - assigned;
    }

    function claimPlatformDiv() external nonReentrant { _settlePlatform(msg.sender); }

    function _creditReferral(address account, uint256 amount) internal {
        if (amount == 0) return;
        referralClaimable[account] += amount;
        referralOwedTotal += amount;
        emit ReferralAccrued(account, amount);
    }

    function claimReferral() external nonReentrant {
        uint256 amount = referralClaimable[msg.sender];
        require(amount > 0 && address(this).balance >= amount, "NONE");
        referralClaimable[msg.sender] = 0;
        referralOwedTotal -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) {
            referralClaimable[msg.sender] = amount;
            referralOwedTotal += amount;
            revert("PAY");
        }
        emit ReferralClaimed(msg.sender, amount);
    }

    // The community share is already accounted for in platformDivReserve and
    // distributed to BSTK holders.  It must never be withdrawn a second time
    // through an owner-controlled maintenance bucket.
    function releaseCommunity(uint256 amount) external onlyOwner {
        require(amount == 0, "COMMUNITY_LOCKED");
    }
    function releaseReserve(uint256 amount) external onlyOwner {
        require(amount <= referralReserve, "POOL");
        referralReserve -= amount;
        (bool ok,) = payable(owner).call{value: amount}("");
        require(ok, "PAY");
    }
    function rescueToken(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "ZERO");
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, owner, amount));
        require(ok && (ret.length == 0 || (ret.length >= 32 && abi.decode(ret, (bool)))), "TOKEN");
    }
    function withdrawBNB(uint256 amount) external onlyOwner {
        uint256 reserved = communityReserve + referralReserve + referralOwedTotal + platformDivReserve;
        uint256 bal = address(this).balance;
        require(amount <= bal && bal - amount >= reserved, "BAL");
        (bool ok,) = payable(owner).call{value: amount}("");
        require(ok, "PAY");
    }
    function transferOwnership(address a) external onlyOwner { pendingOwner = a; }
    function acceptOwnership() external { require(msg.sender == pendingOwner, "NP"); owner = pendingOwner; pendingOwner = address(0); }
}
