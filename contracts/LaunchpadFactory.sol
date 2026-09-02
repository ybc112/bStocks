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

    uint256 public platformAccPerShare;
    uint256 public platformTotalShares;
    uint256 public platformDivReserve;
    uint256 public constant DIV_PRECISION = 1e18;
    mapping(address => uint256) public platformShares;
    mapping(address => uint256) public platformPaidPerShare;

    address public owner;
    address public pendingOwner;
    IPancakeRouter public router;
    TokenDeployer public deployer;
    address public factoryERC20;
    address public WBNB;
    address[] public projects;
    mapping(address => bool) public isProject;
    mapping(address => bool) public baseTokenWhitelist;
    mapping(address => address) public tokenCreator;

    mapping(address => address) public parentOf;
    mapping(address => bool) public registered;

    uint256 public communityPool;
    uint256 public referralReserve;

    modifier onlyOwner() { require(msg.sender == owner, "NO"); _; }
    modifier onlyProjectOwner(address t) {
        require(isProject[t], "PRJ");
        require(tokenCreator[t] == msg.sender || msg.sender == owner, "NA");
        _;
    }
    modifier nonReentrant() { require(!_inReentrant, "RE"); _inReentrant = true; _; _inReentrant = false; }
    bool internal _inReentrant;

    constructor(address _router, address _factory, address _deployer) {
        owner = msg.sender;
        router = IPancakeRouter(_router);
        factoryERC20 = _factory;
        WBNB = router.WETH();
        deployer = TokenDeployer(_deployer);
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
        platformTotalShares = platformTotalShares - platformShares[account] + b;
        platformShares[account] = b;
        platformPaidPerShare[account] = (b * platformAccPerShare) / DIV_PRECISION;
    }

    function _settlePlatform(address account) internal {
        uint256 share = platformShares[account];
        if (share == 0) return;
        uint256 due = (share * platformAccPerShare) / DIV_PRECISION - platformPaidPerShare[account];
        platformPaidPerShare[account] = (share * platformAccPerShare) / DIV_PRECISION;
        if (due > 0) {
            platformDivReserve -= due;
            (bool success,) = payable(account).call{value: due}("");
            require(success, "PAYFAIL");
        }
    }

    function setBaseTokenWhitelist(address[] calldata tokens, bool f) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) baseTokenWhitelist[tokens[i]] = f;
    }

    function setDeployer(address d) external onlyOwner { deployer = TokenDeployer(d); }

    function launchProject(
        bytes calldata initCode,
        string calldata _name,
        string calldata _symbol,
        address _dev,
        address _marketing,
        address _baseToken
    ) external returns (address) {
        address base = _baseToken == address(0) ? WBNB : _baseToken;
        require(baseTokenWhitelist[base], "BASE");
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
        address base = _baseToken == address(0) ? WBNB : _baseToken;
        require(baseTokenWhitelist[base], "BASE");
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
        FeeReceiver receiver = new FeeReceiver(address(t));
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
    function configPool(address t, address p) external onlyProjectOwner(t) { _token(t).setPair(p); }
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
        require(_m + _bb + _l + _d == 800, "DIST80");
        address base = _baseToken == address(0) ? WBNB : _baseToken;
        require(baseTokenWhitelist[base], "BASE");
        tokenAddr = deployer.revealAndDeploy(initCode, salt, user);
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
        tokenCreator[tokenAddr] = msg.sender;
        t.setMintConfig(_wl, _poolPct, _lpRatio, _minM, _maxM, _wCap, _cap, _duration);
        t.setTax(_buy, _sell, _transfer);
        t.setFeeDistribution(_m, _bb, _l, _d);
        if (_divId != 0) t.enableDiv(_divId, _divReward, _divMin, true);
        emit ProjectLaunched2(tokenAddr, _dev, base, salt, true, _name, _symbol);
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
        require(isProject[project] || msg.sender == project, "PRJ");
        uint256 value = bnbValue == 0 ? msg.value : bnbValue;
        if (value == 0) return;
        require(msg.value >= value, "BAL");

        uint256 community = (value * 75) / 100;
        uint256 r1 = (value * 15) / 100;
        uint256 r2 = (value * 10) / 100;

        communityPool += community;

        address l1 = registered[contributor] ? parentOf[contributor] : address(0);
        if (l1 != address(0) && registered[l1]) {
            (bool ok1,) = payable(l1).call{value: r1}("");
            if (!ok1) referralReserve += r1;
        } else referralReserve += r1;
        address l2 = (l1 != address(0) && registered[l1]) ? parentOf[l1] : address(0);
        if (l2 != address(0) && registered[l2]) {
            (bool ok2,) = payable(l2).call{value: r2}("");
            if (!ok2) referralReserve += r2;
        } else referralReserve += r2;

        emit FeeCollected(project, value, community, r1 + r2);
    }

    function fundPlatformDiv() external payable {
        if (msg.value == 0) return;
        platformDivReserve += msg.value;
        _accruePlatform(msg.value);
    }

    function _accruePlatform(uint256 amount) internal {
        if (platformTotalShares > 0) platformAccPerShare += (amount * DIV_PRECISION) / platformTotalShares;
    }

    function claimPlatformDiv() external nonReentrant { _settlePlatform(msg.sender); }

    function releaseCommunity(uint256 amount) external onlyOwner { require(amount <= communityPool, "POOL"); communityPool -= amount; payable(owner).transfer(amount); }
    function releaseReserve(uint256 amount) external onlyOwner { require(amount <= referralReserve, "POOL"); referralReserve -= amount; payable(owner).transfer(amount); }
    function rescueToken(address token, uint256 amount) external onlyOwner { IERC20External(token).transfer(owner, amount); }
    function withdrawBNB(uint256 amount) external onlyOwner {
        uint256 reserved = communityPool + referralReserve + platformDivReserve;
        require(amount <= address(this).balance - reserved, "BAL");
        payable(owner).transfer(amount);
    }
    function transferOwnership(address a) external onlyOwner { pendingOwner = a; }
    function acceptOwnership() external { require(msg.sender == pendingOwner, "NP"); owner = pendingOwner; pendingOwner = address(0); }
}
