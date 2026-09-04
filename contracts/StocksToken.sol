// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPancakeRouter {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
    function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external returns (uint256 amountToken, uint256 amountETH);
    function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB);
    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external;
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts);
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external;
}

interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IERC20External {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ILaunchpad {
    function onProjectFee(address project, address contributor, uint256 bnbValue) external payable;
}
interface IFeeReceiver {
    function process(address contributor) external returns (
        uint256 platformTokens,
        uint256 marketingTokens,
        uint256 buybackTokens,
        uint256 liquidityTokens,
        uint256 dividendTokens
    );
    function activeDividend() external view returns (uint8 id, address reward);
    function configureDividend(uint8 id, address rewardToken, uint256 minEligible, bool enabled) external;
    function dividendInfo(uint8 id) external view returns (bool, address, uint256, uint256, uint256, uint256);
    function dividendShares(uint8 id, address account) external view returns (uint256);
    function pendingDividend(uint8 id, address account) external view returns (uint256);
    function syncDividendShare(uint8 id, address account, uint256 amount) external;
    function recordBurn(address account, uint256 amount) external;
    function setDividendExcluded(address account, bool excluded, uint256 holdBalance, uint256 lpBalance) external;
    function depositNative(uint8 id) external payable;
    function creditDividend(uint8 id, uint256 amount) external;
    function claimDividend(uint8 id, address account) external;
    function processDividend(uint8 id, uint256 maxIter) external;
}

contract StocksToken {
    error InvalidMintConfig();
    error NotOwner();
    error Reentrant();
    error Frozen();
    error Guard();
    error InvalidRoute();
    string public name;
    string public symbol;
    uint8 public constant decimals = 0;
    uint256 public totalSupply;
    uint256 public constant MAX_SUPPLY = 10 ** 30;
    // Fixed split: MINT_RESERVE (half) is distributed to minters; the other
    // half is the LP token reserve. poolPercent only controls the BNB split.
    uint256 public constant MINT_RESERVE = MAX_SUPPLY / 2;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public owner;
    address public pendingOwner;
    address public devWallet;
    address public marketingWallet;
    address public launchpad;
    address public immutable baseToken;
    address public immutable WBNB;
    IPancakeRouter public immutable router;
    IPancakeFactory public immutable pancakeFactory;
    address public pair;
    address public feeReceiver; // 独立 BNB 税币接收器(BNB 底自动税收)
    address public constant DEAD = address(0xdead);
    mapping(address => bool) public isPool;
    mapping(address => bool) public isExcludedFromFees;
    // 分红排除名单：被排除的地址(HOLD 持币/LIQ 加池/BURN 燃烧)不获取任何分红份额，
    // 用于黑洞、锁仓、加池(LP 合约/交易对)与交易所地址。池子与黑洞在链上自动排除。
    mapping(address => bool) public excludedFromDividends;

    mapping(address => uint256) public minAmountOut;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Minted(address indexed user, uint256 bnb, uint256 tokens);
    event Refunded(address indexed user, uint256 bnb);
    event Graduated(uint256 totalMinted, uint256 lpBurned, uint256 devBNB);
    event FeeProcessingFailed(uint8 indexed kind, uint256 amount);

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier nonReentrant() { if (_reentrancy) revert Reentrant(); _reentrancy = true; _; _reentrancy = false; }
    bool internal _reentrancy;
    bool internal _inSwap;
    bool internal _swappingFees;
    address internal _feeContributor;

    constructor(string memory _name, string memory _symbol, address _router, address _factory, address _dev, address _marketing, address _baseToken) {
        if (_router == address(0) || _factory == address(0) || _dev == address(0) || _marketing == address(0)) revert InvalidRoute();
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        devWallet = _dev;
        marketingWallet = _marketing;
        router = IPancakeRouter(_router);
        WBNB = router.WETH();
        if (WBNB == address(0) || router.factory() != _factory) revert InvalidRoute();
        pancakeFactory = IPancakeFactory(_factory);
        baseToken = _baseToken == address(0) ? WBNB : _baseToken;
        if (baseToken == address(this) || baseToken == address(0)) revert InvalidRoute();
        if (baseToken != WBNB && baseToken.code.length == 0) revert InvalidRoute();
        pair = pancakeFactory.getPair(address(this), baseToken);
        isExcludedFromFees[msg.sender] = true;
        isExcludedFromFees[address(this)] = true;
        isExcludedFromFees[_router] = true;
        isExcludedFromFees[DEAD] = true;
        // 分红默认排除：合约自身、黑洞、路由(以及池子，在创建/毕业时自动加)
        excludedFromDividends[address(this)] = true;
        excludedFromDividends[DEAD] = true;
        excludedFromDividends[_router] = true;
        if (pair != address(0)) excludedFromDividends[pair] = true;
        _mint(address(this), MAX_SUPPLY);
    }

    function transferOwnership(address a) external onlyOwner { pendingOwner = a; }
    function acceptOwnership() external { if (msg.sender != pendingOwner) revert Guard(); owner = pendingOwner; pendingOwner = address(0); }
    function setDev(address a) external onlyOwner { if (configFreeze) revert Frozen(); if (a == address(0)) revert Guard(); devWallet = a; }
    function setMarketing(address a) external onlyOwner { if (configFreeze) revert Frozen(); if (a == address(0)) revert Guard(); marketingWallet = a; }
    function setLaunchpad(address a) external onlyOwner {
        if (configFreeze || a == address(0)) revert Guard();
        launchpad = a;
    }
    function setFeeReceiver(address a) external onlyOwner {
        if (a == address(0) || feeReceiver != address(0) || configFreeze) revert Guard();
        feeReceiver = a;
        // The receiver must be fee/dividend neutral while it moves tax tokens
        // through the AMM; otherwise its internal transfer to the pair would
        // recursively create another tax charge.
        isExcludedFromFees[a] = true;
        excludedFromDividends[a] = true;
    }
    function setPair(address a) external onlyOwner {
        if (configFreeze) revert Frozen();
        if (a == address(0)) revert Guard();
        pair = a; isPool[a] = true; excludedFromDividends[a] = true;
        if (feeReceiver != address(0)) IFeeReceiver(feeReceiver).setDividendExcluded(a, true, 0, 0);
    }
    function addPool(address a) external onlyOwner {
        if (configFreeze) revert Frozen();
        if (a == address(0)) revert Guard();
        isPool[a] = true; excludedFromDividends[a] = true;
        if (feeReceiver != address(0)) IFeeReceiver(feeReceiver).setDividendExcluded(a, true, 0, 0);
    }
    function removePool(address a) external onlyOwner { if (configFreeze) revert Frozen(); isPool[a] = false; }
    function setExcluded(address a, bool f) external onlyOwner { if (configFreeze) revert Frozen(); isExcludedFromFees[a] = f; }
    // 分红排除名单设置：owners might use this to exclude a lock contract or an exchange
    // (cex) address so those never accrue dividends. 黑洞/池子/路由已默认自动排除。
    function setDividendExcluded(address a, bool f) external onlyOwner {
        if (configFreeze) revert Frozen();
        excludedFromDividends[a] = f;
        if (feeReceiver != address(0)) {
            uint256 lpBal;
            if (pair != address(0)) {
                try IERC20External(pair).balanceOf(a) returns (uint256 b) { lpBal = b; } catch {}
            }
            // Launch LP is locked in DEAD at graduation, so minters no longer
            // hold a live pair balance.  Keep their recorded contribution as
            // a virtual LP share and add any live LP they may subsequently
            // receive/hold; using only the live balance made DIV_LIQ silently
            // have zero holders after every normal graduation.
            lpBal += mintedLPUnits[a];
            IFeeReceiver(feeReceiver).setDividendExcluded(a, f, balanceOf[a], lpBal);
        }
    }
    function setMinAmountOut(address token, uint256 minOut) external onlyOwner { if (configFreeze) revert Frozen(); minAmountOut[token] = minOut; }

    function _mint(address to, uint256 amount) internal { if (totalSupply + amount > MAX_SUPPLY) revert Guard(); totalSupply += amount; balanceOf[to] += amount; emit Transfer(address(0), to, amount); }
    function _burn(address a, uint256 amount) internal { totalSupply -= amount; balanceOf[a] -= amount; emit Transfer(a, address(0), amount); }

    uint256 public buyTax;
    uint256 public sellTax;
    uint256 public transferTax;
    uint256 public constant TAX_DIVISOR = 1000;

    function setTax(uint256 b, uint256 s, uint256 t) external onlyOwner {
        if (configFreeze) revert Frozen();   // 首次 mint 起冻结税率
        if (b > 250 || s > 250 || t > 250) revert Guard();
        buyTax = b; sellTax = s; transferTax = t;
    }

    // The threshold is measured in project-token units.  A project can lower
    // it before the first mint when small trades should settle fees sooner;
    // zero is rejected because it would make every dust transfer execute AMM
    // swaps and create a predictable gas-denial vector.
    function setSwapThreshold(uint256 t) external onlyOwner {
        if (configFreeze || t == 0) revert Frozen();
        swapThreshold = t;
    }

    // Platform is fixed at 20% of the full tax. Project mechanisms fill the
    // remaining 80%: marketing + buyback + liquidity-backflow + dividend == 800.
    uint256 public constant platformShare = 200;
    uint256 public marketingShare = 400;
    uint256 public buyBackShare = 200;
    uint256 public liquidityBackflowShare = 200;
    uint256 public dividendShare = 0;
    uint256 public swapThreshold = 10 ** 24;

    // Reference-style fee buckets: collected tax is split and accumulated here, and
    // the flush only runs once the accumulated buckets clear the threshold — so fresh
    // or thin pools (small accumulated fees) simply skip the flush and keep user swaps
    // clean instead of corrupting the pool on every trade.
    uint256 public tokensForPlatform;
    uint256 public tokensForMarketing;
    uint256 public tokensForBuyBack;
    uint256 public tokensForLiquidityBackflow;
    uint256 public tokensForDividends;

    function _feeBucketsTotal() internal view returns (uint256) {
        return tokensForPlatform + tokensForMarketing + tokensForBuyBack
            + tokensForLiquidityBackflow + tokensForDividends;
    }

    function setFeeDistribution(uint256 m, uint256 bb, uint256 bf, uint256 dv) external onlyOwner {
        if (configFreeze) revert Frozen();   // 首次 mint 起冻结手续费分配
        require(m + bb + bf + dv == TAX_DIVISOR - platformShare);
        marketingShare = m;
        buyBackShare = bb;
        liquidityBackflowShare = bf;
        dividendShare = dv;
    }

    bool public mintEnabled;
    bool public whitelistOnly;
    // BNB-side split: poolPercent (permille) of each mint's BNB goes to the pool;
    // the rest is forwarded to devWallet immediately.
    uint256 public poolPercent = 1000;
    uint256 public lpTokenRatio = 1000;
    uint256 public minMint;
    uint256 public maxMint;
    uint256 public walletCap;
    uint256 public capBNB;
    uint256 public minCapBNB = 0.01 ether;
    uint256 public mintStart;
    uint256 public mintEnd;
    uint256 public refundDeadline;
    uint256 public constant MINT_REFUND_WINDOW = 24 hours;
    bool public mintCapped;
    bool public graduated;
    bool public configFreeze;   // 首次 mint 后为 true，冻结税/分配/营销/分红配置
    uint256 public totalMintedBNB;
    uint256 public totalPoolBNB;
    uint256 public totalLPToken;
    mapping(address => bool) public whitelist;
    mapping(address => uint256) public mintedBNB;
    mapping(address => uint256) public mintedPoolBNB;
    mapping(address => uint256) public mintedTokenAmount;
    mapping(address => uint256) public mintedLPTokenAmount;
    // Exact Pancake LP ERC20 units received for each user's live mint.  The
    // legacy mintedLPTokenAmount mapping is retained for ABI compatibility
    // and stores the project-token side used for LP; these units are what
    // refund() must actually withdraw.
    mapping(address => uint256) public mintedLPUnits;
    uint256 public totalLPUnits;
    uint256 public mintTokensDistributed;
    uint256 public lpTokensDistributed;
    mapping(address => bool) public refunded;

    event MintConfigSet(uint256 capBNB, uint256 poolPercent);

    function setMintConfig(bool wl, uint256 poolPct, uint256 lpRatio, uint256 minM, uint256 maxM, uint256 wCap, uint256 cap, uint256 duration) external onlyOwner {
        if (configFreeze) revert Frozen();   // 首次 mint 起冻结铸造参数
        if (poolPct < 600 || poolPct > TAX_DIVISOR || lpRatio != TAX_DIVISOR || minM < 0.001 ether || maxM < minM || maxM == 0 || (wCap != 0 && wCap < maxM) || cap < minCapBNB || cap < minM || duration == 0) revert InvalidMintConfig();
        whitelistOnly = wl;
        poolPercent = poolPct;
        lpTokenRatio = lpRatio;
        minMint = minM;
        maxMint = maxM;
        walletCap = wCap;
        capBNB = cap;
        mintEnabled = true;
        mintStart = block.timestamp;
        mintEnd = block.timestamp + duration;
        // The refund window starts with the first actual mint, not with a
        // configuration transaction that may happen days earlier.
        refundDeadline = 0;
        emit MintConfigSet(cap, poolPct);
    }
    function setWhitelist(address[] calldata addrs, bool f) external onlyOwner {
        if (configFreeze) revert Frozen();
        for (uint256 i = 0; i < addrs.length; i++) whitelist[addrs[i]] = f;
    }
    receive() external payable {
        if (msg.value > 0 && msg.sender != address(router) && msg.sender != WBNB && msg.sender != address(feeReceiver)) swapIn(msg.value);
    }

    function swapIn(uint256 bnbAmount) public payable nonReentrant {
        if (!mintEnabled) revert Guard();
        if (block.timestamp < mintStart || block.timestamp > mintEnd) revert Guard();
        if (mintCapped) revert Guard();
        // A dividend allocation without an active mechanism would otherwise
        // accumulate forever and could never be converted or claimed.
        if (dividendShare > 0 && _activeDivId() == 0) revert Guard();
        if (bnbAmount < minMint || bnbAmount > maxMint) revert Guard();
        if (whitelistOnly && !whitelist[msg.sender]) revert Guard();
        if (msg.value != bnbAmount) revert Guard();
        configFreeze = true;   // 首次 mint 起冻结全部配置(去中心化：发射后不能再改税率/分配/营销/分红)
        if (totalMintedBNB == 0) refundDeadline = block.timestamp + MINT_REFUND_WINDOW;

        uint256 toCap = capBNB - totalMintedBNB;
        uint256 use = bnbAmount > toCap ? toCap : bnbAmount;
        if (use == 0) revert Guard();

        totalMintedBNB += use;
        mintedBNB[msg.sender] += use;
        refunded[msg.sender] = false;
        if (walletCap > 0 && mintedBNB[msg.sender] > walletCap) revert Guard();

        // Fixed 50% token mint share, pro-rata by BNB.
        bool last = totalMintedBNB >= capBNB;
        uint256 tokens = last ? MINT_RESERVE - mintTokensDistributed : (MINT_RESERVE * use) / capBNB;
        if (balanceOf[address(this)] < tokens) revert Guard();
        balanceOf[address(this)] -= tokens;
        balanceOf[msg.sender] += tokens;
        mintedTokenAmount[msg.sender] += tokens;
        mintTokensDistributed += tokens;
        emit Transfer(address(this), msg.sender, tokens);
        // Mint transfers bypass _transfer, so explicitly refresh the holder
        // dividend position for newly minted accounts.
        _syncHold(msg.sender);

        // BNB split per the launch config (poolPercent): poolPercent% enters the
        // pool, the rest goes to the dev wallet now. Only the pool-entered BNB is
        // refundable; the dev cut is not (matches the refund() comment). LP tokens
        // pair 1:1 with the BNB that actually entered the pool, keeping the ratio
        // constant across mints (frontend default poolPercent = 60).
        uint256 poolBNB = (use * poolPercent) / TAX_DIVISOR;
        uint256 devBNB = use - poolBNB;
        uint256 lpTarget = last ? MINT_RESERVE - lpTokensDistributed : (MINT_RESERVE * use) / capBNB;
        // Pancake may use less than the requested side when the current pool
        // ratio is not exact (this is especially common for an ERC20/mirror
        // base after converting BNB).  The helper returns the amounts that
        // actually entered the pool; accounting must use those values rather
        // than the desired values.
        (uint256 lpUsed, uint256 lpUnits, uint256 poolUsedBNB) = _addLiquidityLive(poolBNB, lpTarget);
        totalPoolBNB += poolUsedBNB;
        mintedPoolBNB[msg.sender] += poolUsedBNB;
        mintedLPTokenAmount[msg.sender] += lpUsed;
        mintedLPUnits[msg.sender] += lpUnits;
        totalLPUnits += lpUnits;
        // The launch LP is locked in DEAD at graduation, so no account would
        // otherwise have a live LP-token balance to use for DIV_LIQ.  Record
        // each minter's actual LP contribution as a lazy liquidity-provider
        // share; syncLiqShare() later takes the larger of this contribution
        // and any live LP balance held by the account.
        _syncLiq(msg.sender);

        // Non-blocking: if the dev transfer fails, the BNB stays in the contract
        // and graduation forwards it to the dev wallet anyway.
        // Any native BNB that Pancake refunded because of an imbalanced
        // addLiquidity call is not part of the pool contribution and follows
        // the same dev split as the unused portion of the mint payment.
        if (poolUsedBNB < poolBNB) devBNB += poolBNB - poolUsedBNB;
        if (devBNB > 0) {
            address devRecv = devWallet == address(0) ? owner : devWallet;
            (bool devOk,) = payable(devRecv).call{value: devBNB}("");
            if (!devOk) revert Guard();
        }

        // Return any amount sent above the remaining cap before graduation.
        // _graduate() forwards the token contract's remaining native balance
        // to dev; doing it first would consume this user's overpayment and make
        // the subsequent refund revert (the classic final-mint overpay bug).
        if (msg.value > use) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - use}("");
            if (!ok) revert Guard();
        }
        if (last) _graduate();

        emit Minted(msg.sender, use, tokens);
    }

    function _addLiquidityLive(uint256 lpBNB, uint256 tokensForLP)
        internal
        returns (uint256 usedToken, uint256 liquidityUnits, uint256 usedBNB)
    {
        if (lpBNB == 0 || tokensForLP == 0 || balanceOf[address(this)] < tokensForLP) revert Guard();
        allowance[address(this)][address(router)] = type(uint256).max;
        _inSwap = true;
        if (baseToken == WBNB) {
            (uint256 actualToken, uint256 actualBNB, uint256 liq) = router.addLiquidityETH{value: lpBNB}(address(this), tokensForLP, 0, 0, address(this), block.timestamp + 300);
            if (actualToken == 0 || actualBNB == 0 || liq == 0) revert Guard();
            usedToken = actualToken;
            liquidityUnits = liq;
            usedBNB = actualBNB;
            totalLPToken += liq;
        } else {
            address[] memory path = new address[](2);
            path[0] = WBNB;
            path[1] = baseToken;
            if (pancakeFactory.getPair(WBNB, baseToken) == address(0)) revert InvalidRoute();
            uint256 baseBefore = IERC20External(baseToken).balanceOf(address(this));
            router.swapExactETHForTokens{value: lpBNB}(0, path, address(this), block.timestamp + 300);
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this)) - baseBefore;
            if (baseBal == 0) revert Guard();
            allowanceRouter(baseToken);
            (uint256 actualToken, uint256 actualBase, uint256 liq) = router.addLiquidity(address(this), baseToken, tokensForLP, baseBal, 0, 0, address(this), block.timestamp + 300);
            if (actualToken == 0 || actualBase == 0 || liq == 0) revert Guard();
            usedToken = actualToken;
            liquidityUnits = liq;
            // The complete BNB input was converted to the selected base.  If
            // Pancake left base dust, keep the nominal BNB contribution here;
            // that base dust remains in the token contract for the next flush.
            usedBNB = lpBNB;
            totalLPToken += liq;
        }
        address p = pancakeFactory.getPair(address(this), baseToken);
        if (p == address(0)) revert InvalidRoute();
        if (pair == address(0)) pair = p;
        else if (pair != p) {
            revert InvalidRoute();
        }
        // A pair can already exist before the first mint.  Mark it as a pool
        // even in that case; otherwise post-graduation buys/sells are treated
        // as ordinary transfers and no buy/sell tax is applied.
        isPool[p] = true;
        excludedFromDividends[p] = true;
        if (feeReceiver != address(0)) IFeeReceiver(feeReceiver).setDividendExcluded(p, true, 0, 0);

        // Do not defer mirror-base dust until graduation.  A refund can happen
        // before the cap is reached; leaving converted base in the token
        // contract would make the recorded pool BNB larger than the LP that a
        // refund can actually withdraw.  Donate/sync every leftover base now
        // so the live pair always contains the complete converted contribution.
        if (baseToken != WBNB) _syncBaseDustToPair();

        // Router.addLiquidity deliberately uses only the side needed to keep
        // the current AMM ratio.  After the first mint, a second mint can
        // therefore leave a small project-token remainder when the base side
        // moved by price impact.  The launchpad promise is that exactly one
        // half of MAX_SUPPLY belongs to the LP reserve; on the final mint put
        // that remainder into the pair and sync its reserves.  It is a
        // donation (no extra LP units), but it is not silently left in the
        // token contract and it cannot make graduation revert.
        if (usedToken > tokensForLP) revert Guard();
        if (totalMintedBNB >= capBNB && usedToken < tokensForLP) {
            _sendTokenToPairAndSync(tokensForLP - usedToken);
            usedToken = tokensForLP;
        }
        lpTokensDistributed += usedToken;
        _inSwap = false;
    }

    function _sendTokenToPairAndSync(uint256 amount) internal {
        if (amount == 0 || pair == address(0) || balanceOf[address(this)] < amount) revert Guard();
        balanceOf[address(this)] -= amount;
        balanceOf[pair] += amount;
        emit Transfer(address(this), pair, amount);
        (bool ok,) = pair.call(abi.encodeWithSignature("sync()"));
        if (!ok) revert InvalidRoute();
    }

    function allowanceRouter(address token) internal {
        if (!IERC20External(token).approve(address(router), type(uint256).max)) revert Guard();
    }

    function _graduate() internal {
        if (pair == address(0) || lpTokensDistributed != MINT_RESERVE) revert Guard();

        // Any base-token dust left by an imbalanced mirror addLiquidity call
        // is still part of the launch pool.  Put it into the live pair before
        // locking the LP, otherwise it would remain trapped in this contract
        // forever once ownership is renounced to DEAD.
        _syncBaseDustToPair();

        uint256 lpBal = _lpBalance();
        if (lpBal == 0) revert Guard();
        if (lpBal > 0) {
            (bool sent, bytes memory ret) = pair.call(abi.encodeWithSelector(0xa9059cbb, DEAD, lpBal));
            if (!sent || (ret.length != 0 && !abi.decode(ret, (bool)))) revert Guard();
            totalLPToken = 0;
            totalLPUnits = 0;
        }
        mintCapped = true;
        graduated = true;
        mintEnabled = false;
        uint256 rest = address(this).balance;
        uint256 devBNBSent = 0;
        if (rest > 0 && devWallet != address(0)) {
            (bool ok,) = payable(devWallet).call{value: rest}("");
            if (!ok) revert Guard();
            devBNBSent = rest;
            rest = 0;
        }
        // 打满即丢权限：所有权 renounce 到黑洞地址，发射后任何人(含 Factory/创始人)都不可再改配置。
        owner = DEAD;
        pendingOwner = address(0);
        emit Graduated(totalMintedBNB, lpBal, devBNBSent);
    }

    function _syncBaseDustToPair() internal {
        if (baseToken == WBNB || pair == address(0)) return;
        uint256 dust = IERC20External(baseToken).balanceOf(address(this));
        if (dust == 0) return;
        (bool sent, bytes memory ret) = baseToken.call(abi.encodeWithSelector(0xa9059cbb, pair, dust));
        if (!sent || (ret.length != 0 && (ret.length < 32 || !abi.decode(ret, (bool))))) revert InvalidRoute();
        (bool synced,) = pair.call(abi.encodeWithSignature("sync()"));
        if (!synced) revert InvalidRoute();
    }

    function _lpBalance() internal view returns (uint256) {
        if (pair == address(0)) return 0;
        try IERC20External(pair).balanceOf(address(this)) returns (uint256 b) { return b; } catch { return 0; }
    }

    // Refund only the BNB that actually entered the pool (dev-forwarded BNB is not refundable).
    function refund() external nonReentrant returns (bool) {
        if (mintCapped) revert Guard();
        if (block.timestamp <= refundDeadline) revert Guard();
        uint256 amt = mintedPoolBNB[msg.sender];
        if (amt == 0) revert Guard();
        if (refunded[msg.sender]) revert Guard();
        uint256 contributed = mintedBNB[msg.sender];
        uint256 prevTotal = totalPoolBNB;
        uint256 tokens = mintedTokenAmount[msg.sender];
        uint256 lpTokens = mintedLPTokenAmount[msg.sender];
        uint256 lpUnits = mintedLPUnits[msg.sender];
        uint256 held = balanceOf[msg.sender];
        if (held < tokens) revert Guard();

        uint256 currentLp = _lpBalance();
        if (lpUnits == 0 && prevTotal > 0) {
            // Compatibility fallback for records created by an older build
            // that did not persist LP units.  New mints always use the exact
            // units returned by the router.
            lpUnits = (currentLp * amt) / prevTotal;
        }
        if (lpUnits == 0 || lpUnits > currentLp) revert Guard();

        // Withdraw the exact LP units recorded for this account.  Do this
        // before clearing the accounting so a short/failed AMM recovery rolls
        // back atomically instead of silently erasing the user's claim.
        uint256 recovered = _withdrawLPForRefund(lpUnits);
        // A V2 LP redemption is not guaranteed to return the original BNB
        // amount: the pool may have moved, and an ERC20 base is converted back
        // through a second swap (which charges another AMM fee).  Requiring
        // `recovered >= amt` made every real-USDT/mirror refund permanently
        // revert.  The LP redemption itself is the user's refundable claim;
        // pay the exact amount recovered and keep the accounting in terms of
        // the original pool contribution (`amt`).  A zero-output redemption
        // still reverts atomically so no claim can be erased without value.
        if (recovered == 0) revert Guard();
        uint256 paid = recovered;

        refunded[msg.sender] = true;
        mintedPoolBNB[msg.sender] = 0;
        mintedBNB[msg.sender] = 0;
        totalMintedBNB -= contributed;
        totalPoolBNB -= amt;
        mintedTokenAmount[msg.sender] = 0;
        mintedLPTokenAmount[msg.sender] = 0;
        mintedLPUnits[msg.sender] = 0;
        if (tokens > 0) {
            balanceOf[msg.sender] -= tokens;
            balanceOf[address(this)] += tokens;
            mintTokensDistributed -= tokens;
            emit Transfer(msg.sender, address(this), tokens);
        }
        lpTokensDistributed -= lpTokens;
        // Re-read the live LP balance instead of trusting a stale aggregate;
        // this remains correct for legacy records and for rounding in the AMM.
        totalLPUnits = _lpBalance();
        totalLPToken = totalLPUnits;
        (bool ok,) = payable(msg.sender).call{value: paid}("");
        if (!ok) revert Guard();
        _syncHold(msg.sender);
        _syncLiq(msg.sender);
        emit Refunded(msg.sender, paid);
        return true;
    }

    function _withdrawLPForRefund(uint256 lpToWithdraw) internal returns (uint256 recovered) {
        if (pair == address(0)) revert Guard();
        uint256 lpBal = _lpBalance();
        if (lpBal == 0) revert Guard();
        if (lpToWithdraw == 0 || lpToWithdraw > lpBal) revert Guard();
        uint256 balanceBefore = address(this).balance;
        IERC20External(pair).approve(address(router), type(uint256).max);
        _inSwap = true;
        if (baseToken == WBNB) {
            router.removeLiquidityETH(address(this), lpToWithdraw, 0, 0, address(this), block.timestamp + 300);
        } else {
            uint256 baseBefore = IERC20External(baseToken).balanceOf(address(this));
            router.removeLiquidity(address(this), baseToken, lpToWithdraw, 0, 0, address(this), block.timestamp + 300);
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this)) - baseBefore;
            if (baseBal > 0) {
                allowanceRouter(baseToken);
                address[] memory path = new address[](2);
                path[0] = baseToken;
                path[1] = WBNB;
                router.swapExactTokensForETHSupportingFeeOnTransferTokens(baseBal, 0, path, address(this), block.timestamp + 300);
            }
        }
        _inSwap = false;
        totalLPToken = _lpBalance();
        recovered = address(this).balance - balanceBefore;
    }

    function transfer(address to, uint256 amount) public returns (bool) { _transfer(msg.sender, to, amount); return true; }
    function approve(address spender, uint256 amount) public returns (bool) { allowance[msg.sender][spender] = amount; emit Approval(msg.sender, spender, amount); return true; }

    function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
        uint256 a = allowance[sender][msg.sender];
        if (a != type(uint256).max) { if (a < amount) revert Guard(); allowance[sender][msg.sender] = a - amount; }
        _transfer(sender, recipient, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert Guard();
        if (to == address(0)) revert Guard();

        // 未打满毕业前锁定交易（对齐参考合约 startTradeBlock==0 的 gating）：
        // 只放行与合约自营流动相关的转账——合约发起(from==this: mint 发放/加池/内部回流)，
        // 或转入合约(to==this: 退款回收 LP)。用户对池子的买/卖、以及普通 P2P 一律 revert，
        // 杜绝"还没打满就能在 DEX 买卖"。毕业(打满)后放开。
        // FeeReceiver is an authorized internal settlement address.  It must
        // be able to return a self-token dividend or seed the live pool even
        // before graduation; ordinary user-to-user/DEX transfers remain
        // locked until the cap is reached.
        if (!graduated && from != address(this) && to != address(this) && from != feeReceiver && to != feeReceiver) {
            revert Guard();   // 未毕业锁定
        }

        // AMM router callbacks during mint/fee settlement are explicitly
        // allowed.  All ordinary user transfers remain locked until the
        // launch reaches its cap; this also prevents users from depositing
        // arbitrary tokens into the FeeReceiver before it has an accounting
        // entry.
        if (_inSwap) {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
            emit Transfer(from, to, amount);
            return;
        }

        if (!graduated) revert Guard();

        bool takeFee = !isExcludedFromFees[from] && !isExcludedFromFees[to];
        uint256 tax = 0;
        if (takeFee) {
            if (isPool[from] || isPool[to]) {
                if (isPool[to]) tax = (amount * sellTax) / TAX_DIVISOR;
                else if (isPool[from]) tax = (amount * buyTax) / TAX_DIVISOR;
            } else {
                tax = (amount * transferTax) / TAX_DIVISOR;
            }
        }

        uint256 net = amount - tax;
        balanceOf[from] -= amount;
        if (tax > 0) {
            balanceOf[address(this)] += tax;
            uint256 p = (tax * platformShare) / TAX_DIVISOR;
            uint256 m = (tax * marketingShare) / TAX_DIVISOR;
            uint256 b = (tax * buyBackShare) / TAX_DIVISOR;
            uint256 l = (tax * liquidityBackflowShare) / TAX_DIVISOR;
            uint256 d = (tax * dividendShare) / TAX_DIVISOR;
            // Put integer-rounding dust in the platform bucket so the bucket
            // ledger always equals the actual tax-token balance.
            tokensForPlatform += p + (tax - p - m - b - l - d);
            tokensForMarketing += m;
            tokensForBuyBack += b;
            tokensForLiquidityBackflow += l;
            tokensForDividends += d;
        }

        // CRITICAL: flush fees BEFORE writing the user's net into the pool.
        // PancakeRouter's *SupportingFeeOnTransferTokens path measures the sell input as
        //   pairTokenBalance - reserveIn AFTER the transferFrom.
        // If we deposit the user's net into the pool first and then run the fee flush,
        // the flush's own pair.swap()/_update() advances reserveIn past the user's deposit,
        // so the router measures an input delta of 0 and reverts every DEX sell with
        // "PancakeLibrary: INSUFFICIENT_INPUT_AMOUNT". Flushing first (matching the
        // reference launchpad) leaves reserveIn behind the user deposit -> delta > 0.
        if (tax > 0 && !_inSwap && pair != address(0) && _feeBucketsTotal() >= swapThreshold && !isPool[from]) {
            address previousContributor = _feeContributor;
            _feeContributor = from;
            try this.processFees() {} catch {}
            _feeContributor = previousContributor;
        }

        balanceOf[to] += net;
        emit Transfer(from, to, net);
        if (tax > 0) emit Transfer(from, address(this), tax);

        // The isolated receiver owns the dividend ledger.  Updating after the
        // balance change makes every transfer (including taxed transfers) use
        // the actual post-transfer balance and avoids stale HOLD shares.
        _syncHold(from);
        _syncHold(to);
        if (to == DEAD) _recordBurn(from, net);
    }

    // FeeReceiver is an isolated per-token execution engine. A revert there
    // rolls back swaps, payouts and pullFeeTokens together, so bucket accounting
    // is changed only after every selected action has succeeded.
    function _processFees() internal {
        if (feeReceiver == address(0)) revert Guard();
        (uint256 p, uint256 m, uint256 b, uint256 l, uint256 d) = IFeeReceiver(feeReceiver).process(_feeContributor);
        // Never trust a pluggable receiver to return more than the buckets it
        // was asked to settle.  Without this check a bad receiver would make
        // the subtraction below underflow and keep every fee flush stuck.
        if (p > tokensForPlatform || m > tokensForMarketing || b > tokensForBuyBack || l > tokensForLiquidityBackflow || d > tokensForDividends) revert Guard();
        tokensForPlatform -= p;
        tokensForMarketing -= m;
        tokensForBuyBack -= b;
        tokensForLiquidityBackflow -= l;
        tokensForDividends -= d;
    }

    // FeeReceiver calls this from its isolated platform child.  Keeping the
    // callback here makes a failed Factory/referral transfer roll back only
    // the platform child, not marketing/buyback/liquidity buckets.
    function forwardPlatformFee(address contributor) external payable {
        if (msg.sender != feeReceiver || launchpad == address(0) || msg.value == 0) revert Guard();
        ILaunchpad(launchpad).onProjectFee{value: msg.value}(address(this), contributor, msg.value);
    }

    function pullFeeTokens(uint256 amount) external {
        if (msg.sender != feeReceiver || amount == 0 || balanceOf[address(this)] < amount) revert Guard();
        balanceOf[address(this)] -= amount;
        balanceOf[msg.sender] += amount;
        emit Transfer(address(this), msg.sender, amount);
    }

    // Reference-style non-blocking fee flush: the real work runs via an EXTERNAL
    // self-call wrapped in try/catch, so any revert rolls the whole flush back
    // atomically and is swallowed. It can never corrupt an in-flight AMM swap or
    // block a user's buy/sell, even on an ultra-thin pool.
    function processFees() external {
        if (_swappingFees) return;
        // A manual flush is permissionless but must never be able to choose a
        // trader and steal referral credit.  Automatic self-calls set
        // `_feeContributor` immediately before entering this function; direct
        // external calls intentionally use address(0) (no referral).
        _swappingFees = true;
        uint256 queued = _feeBucketsTotal();
        try this._processFeesDispatch() {} catch { emit FeeProcessingFailed(0, queued); }
        _swappingFees = false;
        _feeContributor = address(0);
    }

    function _processFeesDispatch() external {
        if (msg.sender != address(this)) revert Guard();
        _processFees();
    }

    // ========== DIVIDEND SYSTEM ==========
    // The accounting and payout engine is kept in the per-project FeeReceiver
    // clone.  These thin wrappers preserve the public StocksToken ABI while
    // keeping the token runtime below the EVM contract-size limit.
    uint8 public constant DIV_HOLD = 1;
    uint8 public constant DIV_LIQ = 2;
    uint8 public constant DIV_BURN = 3;

    function _activeDivId() internal view returns (uint8 id) {
        if (feeReceiver == address(0)) return 0;
        try IFeeReceiver(feeReceiver).activeDividend() returns (uint8 i, address) { id = i; } catch { id = 0; }
    }

    function _syncHold(address account) internal returns (bool ok) {
        ok = true;
        if (feeReceiver != address(0) && account != address(0) && !excludedFromDividends[account]) {
            // Dividend bookkeeping is auxiliary.  A broken/paused receiver
            // must never make a user's transfer or DEX swap fail; the public
            // sync/claim functions remain available for a keeper retry.
            try IFeeReceiver(feeReceiver).syncDividendShare(DIV_HOLD, account, balanceOf[account]) {} catch { ok = false; }
        }
    }

    function _syncLiq(address account) internal returns (bool ok) {
        ok = true;
        if (feeReceiver == address(0) || account == address(0) || excludedFromDividends[account]) return ok;
        uint256 live = _lpOf(account) + mintedLPUnits[account];
        // Pancake V2 LP tokens are ordinary ERC20s and do not call this token
        // on transfer.  The locked launch LP is represented by the minter's
        // recorded virtual units; any live LP balance is added on top.  A
        // claim/keeper sync therefore follows transfers without pinning the
        // account to an obsolete balance snapshot.
        try IFeeReceiver(feeReceiver).syncDividendShare(DIV_LIQ, account, live) {} catch { ok = false; }
    }

    function _recordBurn(address account, uint256 amount) internal {
        if (feeReceiver != address(0) && amount > 0) {
            _notify(abi.encodeWithSelector(IFeeReceiver.recordBurn.selector, account, amount), 7, amount);
        }
    }

    function _notify(bytes memory data, uint8 kind, uint256 amount) internal {
        (bool ok,) = feeReceiver.call(data);
        if (!ok) emit FeeProcessingFailed(kind, amount);
    }


    function _lpOf(address account) internal view returns (uint256 b) {
        if (pair != address(0)) {
            try IERC20External(pair).balanceOf(account) returns (uint256 v) { b = v; } catch {}
        }
    }

    function activeDividend() external view returns (uint8 id, address reward) {
        if (feeReceiver != address(0)) {
            try IFeeReceiver(feeReceiver).activeDividend() returns (uint8 i, address r) { id = i; reward = r; } catch {}
        }
    }

    function divInfo(uint8 id) external view returns (bool enabled, address rewardToken, uint256 minEligible, uint256 accPerShare, uint256 totalShares, uint256 pendingReward) {
        if (feeReceiver != address(0)) {
            try IFeeReceiver(feeReceiver).dividendInfo(id) returns (bool e, address r, uint256 m, uint256 a, uint256 s, uint256 p) {
                return (e, r, m, a, s, p);
            } catch {}
        }
    }

    function divShares(uint8 id, address user) external view returns (uint256) {
        if (feeReceiver == address(0)) return 0;
        try IFeeReceiver(feeReceiver).dividendShares(id, user) returns (uint256 s) { return s; } catch { return 0; }
    }

    function pendingDiv(uint8 id, address user) public view returns (uint256) {
        if (feeReceiver == address(0)) return 0;
        try IFeeReceiver(feeReceiver).pendingDividend(id, user) returns (uint256 p) { return p; } catch { return 0; }
    }

    function enableDiv(uint8 id, address rewardToken, uint256 minEligible, bool enabled) external onlyOwner {
        if (configFreeze || feeReceiver == address(0)) revert Frozen();
        IFeeReceiver(feeReceiver).configureDividend(id, rewardToken, minEligible, enabled);
    }

    function depositDiv(uint8 id) external payable nonReentrant {
        if (feeReceiver == address(0)) revert Guard();
        IFeeReceiver(feeReceiver).depositNative{value: msg.value}(id);
    }

    function depositDivToken(uint8 id, address rewardToken, uint256 amount) external nonReentrant {
        if (feeReceiver == address(0) || rewardToken == address(0) || rewardToken == WBNB || amount == 0) revert Guard();
        (uint8 active, address configured) = IFeeReceiver(feeReceiver).activeDividend();
        if (active != id || configured != rewardToken) revert Guard();
        uint256 beforeBal = IERC20External(rewardToken).balanceOf(feeReceiver);
        if (!IERC20External(rewardToken).transferFrom(msg.sender, feeReceiver, amount)) revert Guard();
        uint256 received = IERC20External(rewardToken).balanceOf(feeReceiver) - beforeBal;
        if (received == 0) revert Guard();
        IFeeReceiver(feeReceiver).creditDividend(id, received);
        IFeeReceiver(feeReceiver).processDividend(id, 100);
    }

    function claimDiv(uint8 id) external nonReentrant {
        if (feeReceiver == address(0)) revert Guard();
        if (id == DIV_HOLD) _syncHold(msg.sender);
        if (id == DIV_LIQ) {
            if (pair == address(0)) revert Guard();
            _syncLiq(msg.sender);
        }
        IFeeReceiver(feeReceiver).claimDividend(id, msg.sender);
    }

    function syncLiqShare(address account) external {
        if (feeReceiver == address(0) || pair == address(0) || account == address(0)) revert Guard();
        _syncLiq(account);
    }

    function syncLiqShares(address[] calldata accounts) external {
        if (feeReceiver == address(0) || pair == address(0)) revert Guard();
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] != address(0)) _syncLiq(accounts[i]);
        }
    }


    function burnDiv(uint256 amount) external nonReentrant {
        // A pre-graduation burn would make the user's refundable mint-token
        // balance smaller than the recorded contribution and permanently lock
        // the LP-backed refund.  Burn-dividend participation starts once the
        // launch is tradable.
        if (!graduated) revert Guard();
        if (balanceOf[msg.sender] < amount) revert Guard();
        // BURN dividends are based on tokens sent to the irrevocable black
        // hole.  Keep the total supply fixed (the launchpad promises a fixed
        // 10^30 supply) and make the on-chain balance/event match the UI: the
        // tokens really live at DEAD instead of being silently destroyed at
        // address(0).
        balanceOf[msg.sender] -= amount;
        balanceOf[DEAD] += amount;
        emit Transfer(msg.sender, DEAD, amount);
        _syncHold(msg.sender);
        _recordBurn(msg.sender, amount);
    }

    function rescue(address token, uint256 amount) external onlyOwner {
        require(token != address(0) && token != address(this) && token != pair && token != baseToken && token != feeReceiver);
        if (!IERC20External(token).transfer(msg.sender, amount)) revert Guard();
    }
}
