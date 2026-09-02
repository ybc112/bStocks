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
    function withdraw() external;
    function withdrawToken(address token) external;
}

contract StocksToken {
    error InvalidMintConfig();
    error NotOwner();
    error Reentrant();
    error Frozen();
    error Guard();
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

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier nonReentrant() { if (_reentrancy) revert Reentrant(); _reentrancy = true; _; _reentrancy = false; }
    bool internal _reentrancy;
    bool internal _inSwap;
    bool internal _swappingFees;

    constructor(string memory _name, string memory _symbol, address _router, address _factory, address _dev, address _marketing, address _baseToken) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        devWallet = _dev;
        marketingWallet = _marketing;
        router = IPancakeRouter(_router);
        WBNB = router.WETH();
        pancakeFactory = IPancakeFactory(_factory);
        baseToken = _baseToken == address(0) ? WBNB : _baseToken;
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
    function setDev(address a) external onlyOwner { if (configFreeze) revert Frozen(); devWallet = a; }
    function setMarketing(address a) external onlyOwner { if (configFreeze) revert Frozen(); marketingWallet = a; }
    function setLaunchpad(address a) external onlyOwner { if (configFreeze) revert Frozen(); launchpad = a; }
    function setFeeReceiver(address a) external onlyOwner { feeReceiver = a; }
    function setPair(address a) external onlyOwner { if (configFreeze) revert Frozen(); pair = a; isPool[a] = true; }
    function addPool(address a) external onlyOwner { if (configFreeze) revert Frozen(); isPool[a] = true; }
    function removePool(address a) external onlyOwner { if (configFreeze) revert Frozen(); isPool[a] = false; }
    function setExcluded(address a, bool f) external onlyOwner { if (configFreeze) revert Frozen(); isExcludedFromFees[a] = f; }
    // 分红排除名单设置：owners might use this to exclude a lock contract or an exchange
    // (cex) address so those never accrue dividends. 黑洞/池子/路由已默认自动排除。
    function setDividendExcluded(address a, bool f) external onlyOwner { if (configFreeze) revert Frozen(); excludedFromDividends[a] = f; }
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

    // Platform is fixed at 20% of the full tax. Project mechanisms fill the
    // remaining 80%: marketing + buyback + liquidity-backflow + dividend == 800.
    uint256 public constant platformShare = 200;
    uint256 public marketingShare = 300;
    uint256 public buyBackShare = 200;
    uint256 public liquidityBackflowShare = 200;
    uint256 public dividendShare = 100;
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
    uint256 public minCapBNB = 0.001 ether;
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
    uint256 public mintTokensDistributed;
    uint256 public lpTokensDistributed;
    mapping(address => bool) public refunded;

    event MintConfigSet(uint256 capBNB, uint256 poolPercent);

    function setMintConfig(bool wl, uint256 poolPct, uint256 lpRatio, uint256 minM, uint256 maxM, uint256 wCap, uint256 cap, uint256 duration) external onlyOwner {
        if (configFreeze) revert Frozen();   // 首次 mint 起冻结铸造参数
        if (poolPct < 600 || poolPct > TAX_DIVISOR || lpRatio != TAX_DIVISOR || minM < 0.001 ether || maxM < minM || (wCap != 0 && wCap < maxM) || cap < minCapBNB) revert InvalidMintConfig();
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
        refundDeadline = block.timestamp + MINT_REFUND_WINDOW;
        emit MintConfigSet(cap, poolPct);
    }
    function setWhitelist(address[] calldata addrs, bool f) external onlyOwner { for (uint256 i = 0; i < addrs.length; i++) whitelist[addrs[i]] = f; }
    function setGraduationThreshold(uint256 t) external onlyOwner { if (configFreeze) revert Frozen(); if (t < 0.001 ether) revert Guard(); minCapBNB = t; }

    receive() external payable {
        if (msg.value > 0 && msg.sender != address(router) && msg.sender != WBNB && msg.sender != address(feeReceiver)) swapIn(msg.value);
    }

    function swapIn(uint256 bnbAmount) public payable nonReentrant {
        if (!mintEnabled) revert Guard();
        if (block.timestamp < mintStart || block.timestamp > mintEnd) revert Guard();
        if (mintCapped) revert Guard();
        if (bnbAmount < minMint || bnbAmount > maxMint) revert Guard();
        if (whitelistOnly && !whitelist[msg.sender]) revert Guard();
        if (msg.value != bnbAmount) revert Guard();
        configFreeze = true;   // 首次 mint 起冻结全部配置(去中心化：发射后不能再改税率/分配/营销/分红)

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
        if (_divs[DIV_HOLD].enabled) _refreshHold(msg.sender);

        // BNB split per the launch config (poolPercent): poolPercent% enters the
        // pool, the rest goes to the dev wallet now. Only the pool-entered BNB is
        // refundable; the dev cut is not (matches the refund() comment). LP tokens
        // pair 1:1 with the BNB that actually entered the pool, keeping the ratio
        // constant across mints (frontend default poolPercent = 60).
        uint256 poolBNB = (use * poolPercent) / TAX_DIVISOR;
        uint256 devBNB = use - poolBNB;
        totalPoolBNB += poolBNB;
        mintedPoolBNB[msg.sender] += poolBNB;

        uint256 lpTokens = last ? MINT_RESERVE - lpTokensDistributed : (MINT_RESERVE * use) / capBNB;
        mintedLPTokenAmount[msg.sender] += lpTokens;
        _addLiquidityLive(poolBNB, lpTokens);

        // Non-blocking: if the dev transfer fails, the BNB stays in the contract
        // and graduation forwards it to the dev wallet anyway.
        if (devBNB > 0) {
            address devRecv = devWallet == address(0) ? owner : devWallet;
            payable(devRecv).call{value: devBNB}("");
        }

        if (last) _graduate();

        if (msg.value > use) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - use}("");
            require(ok, "REF");
        }
    }

    function _addLiquidityLive(uint256 lpBNB, uint256 tokensForLP) internal {
        if (lpBNB == 0 || tokensForLP == 0 || balanceOf[address(this)] < tokensForLP) return;
        allowance[address(this)][address(router)] = type(uint256).max;
        _inSwap = true;
        if (baseToken == WBNB) {
            (,, uint256 liq) = router.addLiquidityETH{value: lpBNB}(address(this), tokensForLP, 0, 0, address(this), block.timestamp + 300);
            totalLPToken += liq;
        } else {
            address[] memory path = new address[](2);
            path[0] = WBNB;
            path[1] = baseToken;
            uint256 baseBefore = IERC20External(baseToken).balanceOf(address(this));
            router.swapExactETHForTokens{value: lpBNB}(0, path, address(this), block.timestamp + 300);
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this)) - baseBefore;
            if (baseBal == 0) revert Guard();
            allowanceRouter(baseToken);
            (,, uint256 liq) = router.addLiquidity(address(this), baseToken, tokensForLP, baseBal, 0, 0, address(this), block.timestamp + 300);
            totalLPToken += liq;
        }
        lpTokensDistributed += tokensForLP;
        _inSwap = false;
        address p = pancakeFactory.getPair(address(this), baseToken);
        if (p != address(0) && pair == address(0)) { pair = p; isPool[p] = true; excludedFromDividends[p] = true; }
    }

    function allowanceRouter(address token) internal {
        IERC20External(token).approve(address(router), type(uint256).max);
    }

    function _graduate() internal {
        mintCapped = true;
        graduated = true;
        mintEnabled = false;
        uint256 lpBal = _lpBalance();
        if (lpBal > 0) {
            IERC20External(pair).transfer(DEAD, lpBal);
            totalLPToken = 0;
        }
        uint256 nativeReserved = _nativeDividendReserve();
        require(address(this).balance >= nativeReserved);
        uint256 rest = address(this).balance - nativeReserved;
        if (rest > 0 && devWallet != address(0)) {
            (bool ok,) = payable(devWallet).call{value: rest}("");
            if (ok) rest = 0;
        }
        // 打满即丢权限：所有权 renounce 到黑洞地址，发射后任何人(含 Factory/创始人)都不可再改配置。
        owner = DEAD;
        pendingOwner = address(0);
        emit Graduated(totalMintedBNB, lpBal, address(this).balance);
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
        refunded[msg.sender] = true;
        mintedPoolBNB[msg.sender] = 0;

        uint256 contributed = mintedBNB[msg.sender];
        mintedBNB[msg.sender] = 0;
        totalMintedBNB -= contributed;

        uint256 prevTotal = totalPoolBNB;
        totalPoolBNB -= amt;

        uint256 tokens = mintedTokenAmount[msg.sender];
        mintedTokenAmount[msg.sender] = 0;
        uint256 lpTokens = mintedLPTokenAmount[msg.sender];
        mintedLPTokenAmount[msg.sender] = 0;
        uint256 held = balanceOf[msg.sender];
        if (held < tokens) revert Guard();
        if (tokens > 0) {
            balanceOf[msg.sender] -= tokens;
            balanceOf[address(this)] += tokens;
            mintTokensDistributed -= tokens;
            emit Transfer(msg.sender, address(this), tokens);
        }
        lpTokensDistributed -= lpTokens;

        uint256 nativeReserved = _nativeDividendReserve();
        require(address(this).balance >= nativeReserved);
        uint256 availableBNB = address(this).balance - nativeReserved;
        if (availableBNB < amt) _withdrawLPForRefund(amt, prevTotal);
        (bool ok,) = payable(msg.sender).call{value: amt}("");
        require(ok, "RF");
        return true;
    }

    function _withdrawLPForRefund(uint256 userAmount, uint256 prevTotal) internal {
        if (pair == address(0)) return;
        uint256 lpBal = _lpBalance();
        if (lpBal == 0) return;
        uint256 lpToWithdraw = prevTotal > 0 ? (lpBal * userAmount) / prevTotal : 0;
        if (lpToWithdraw > lpBal) lpToWithdraw = lpBal;
        if (lpToWithdraw == 0) return;
        IERC20External(pair).approve(address(router), type(uint256).max);
        _inSwap = true;
        if (baseToken == WBNB) {
            router.removeLiquidityETH(address(this), lpToWithdraw, 0, 0, address(this), block.timestamp + 300);
        } else {
            router.removeLiquidity(address(this), baseToken, lpToWithdraw, 0, 0, address(this), block.timestamp + 300);
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this));
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
        require(address(this).balance >= userAmount, "LIQ");
    }

    function transfer(address to, uint256 amount) public returns (bool) { _transfer(msg.sender, to, amount); return true; }
    function approve(address spender, uint256 amount) public returns (bool) { allowance[msg.sender][spender] = amount; emit Approval(msg.sender, spender, amount); return true; }

    function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
        uint256 a = allowance[sender][msg.sender];
        if (a != type(uint256).max) { require(a >= amount, "AL"); allowance[sender][msg.sender] = a - amount; }
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
        if (!graduated && from != address(this) && to != address(this)) {
            revert Guard();   // 未毕业锁定
        }

        if (_inSwap) {
            balanceOf[from] -= amount;
            balanceOf[to] += amount;
            emit Transfer(from, to, amount);
            return;
        }

        if (_divs[DIV_HOLD].enabled) {
            _settleHold(from);
            _settleHold(to);
        }

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
            tokensForPlatform += (tax * platformShare) / TAX_DIVISOR;
            tokensForMarketing += (tax * marketingShare) / TAX_DIVISOR;
            tokensForBuyBack += (tax * buyBackShare) / TAX_DIVISOR;
            tokensForLiquidityBackflow += (tax * liquidityBackflowShare) / TAX_DIVISOR;
            tokensForDividends += (tax * dividendShare) / TAX_DIVISOR;
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
            try this.processFees() {} catch {}
        }

        balanceOf[to] += net;
        emit Transfer(from, to, net);
        if (tax > 0) emit Transfer(from, address(this), tax);

        if (_divs[DIV_HOLD].enabled) {
            _refreshHold(from);
            _refreshHold(to);
        }

        if (to == DEAD && _divs[DIV_BURN].enabled) _recordDivShare(DIV_BURN, from, amount);
        // LP dividends are based on the user's LP-token balance, never on
        // the amount sold into the pair.
        if (isPool[to] && _divs[DIV_LIQ].enabled && pair != address(0)) {
            uint256 lpBal = IERC20External(pair).balanceOf(from);
            _setLiqShare(from, lpBal);
        }
    }

    // Convert a tax-token chunk into the configured pool asset.
    // For a BNB pool, the pool asset is WBNB and the router's token->ETH
    // path returns native BNB directly. For an ERC20 pool, use the safe
    // token->base->WBNB->base round trip used by the rest of this contract.
    function _swapToBase(uint256 amount) internal returns (uint256 out) {
        if (amount == 0 || balanceOf[address(this)] < amount) return 0;
        _inSwap = true;
        if (feeReceiver == address(0)) revert Guard();
        if (baseToken == WBNB) {
            // 本币在 (token,WBNB) 对里，Pancake 拒绝 to=本币 收 BNB(INVALID_TO)。
            // 路由到独立 FeeReceiver，再 withdraw() 拉回，绕开该限制。
            address[] memory p = new address[](2);
            p[0] = address(this); p[1] = WBNB;
            uint256 before = address(this).balance;
            router.swapExactTokensForETHSupportingFeeOnTransferTokens(amount, 0, p, feeReceiver, block.timestamp + 300);
            (bool ok,) = feeReceiver.call(abi.encodeWithSelector(IFeeReceiver.withdraw.selector));
            if (!ok) revert Guard();
            out = address(this).balance - before;
        } else {
            // 镜像底：token->base 送到 FeeReceiver（非 LP 成员，合法），再 withdrawToken(base) 拉回 base 本体。
            // 不硬性桥 WBNB——薄/无 WBNB 深度的镜像底(如 NVDAB)不再因 hop2 换不出钱而死锁。
            address[] memory p = new address[](2);
            p[0] = address(this); p[1] = baseToken;
            uint256 beforeBase = IERC20External(baseToken).balanceOf(address(this));
            router.swapExactTokensForTokensSupportingFeeOnTransferTokens(amount, 0, p, feeReceiver, block.timestamp + 300);
            (bool ok,) = feeReceiver.call(abi.encodeWithSelector(IFeeReceiver.withdrawToken.selector, baseToken));
            if (!ok) revert Guard();
            out = IERC20External(baseToken).balanceOf(address(this)) - beforeBase;
        }
        _inSwap = false;
    }

    // Turn a slice of pool BASE into WBNB for BNB-denominated fees (platform/mkt/
    // buyback/BNB-dividend). No-op when base already is WBNB.
    function _baseToWBNB(uint256 baseIn) internal returns (uint256 out) {
        if (baseIn == 0 || baseToken == WBNB) return baseIn;
        address[] memory path = new address[](2);
        path[0] = baseToken;
        path[1] = WBNB;
        uint256 before = address(this).balance;
        allowanceRouter(baseToken);
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(baseIn, 0, path, address(this), block.timestamp + 300);
        out = address(this).balance - before;
    }

    // Allocate the FULL tax (permille = 1000) precisely:
    // platform 200 ; project shares sum to 800. Each share swaps its own tokens.
    function _processFees() internal {
        uint256 free = _feeBucketsTotal();
        if (free == 0) return;
        // 对齐参考合约：不一次 dump 整桶，否则薄池整笔回退被 try/catch 吞掉 → 税桶堆死。
        // 单次最多清「交易对代币储配」的一小部分，剩余留待后续卖出继续清，逐步派发。
        uint256 amt = free;
        address _pair = pair;
        if (_pair != address(0)) {
            uint256 poolTok = balanceOf[_pair];
            if (poolTok > 0) {
                uint256 cap = poolTok / 25; // 每次清 ≤4% 池子代币侧，薄池也不会整笔回退
                if (amt > cap) amt = cap;
            }
        }
        if (amt == 0) return;
        uint256 total = TAX_DIVISOR;
        uint8 activeDiv = _activeDivId();
        bool isBnbBase = baseToken == WBNB;

        uint256 platformTok = (amt * platformShare) / total;
        uint256 mktTok = (amt * marketingShare) / total;
        uint256 bbTok = (amt * buyBackShare) / total;
        uint256 bfTok = (amt * liquidityBackflowShare) / total;
        uint256 bfTokenHalf = bfTok / 2;
        uint256 divTok = (amt * dividendShare) / total;

        // 单笔主回流：整块税代币一次换到 BASE。
        uint256 baseOut = _swapToBase(amt);
        // 换不到任何 base（本币结构上无法自动回流，如 WBNB 底）：不放空税桶，留待更可行路径。
        if (baseOut == 0) return;

        // 清桶记账（按各自 token 份额扣）
        uint256 freeNow = _feeBucketsTotal();
        uint256 consumed = freeNow >= amt ? amt : freeNow;
        if (consumed > 0) {
            uint256 cp = platformTok >= tokensForPlatform ? tokensForPlatform : platformTok;
            uint256 cm = mktTok >= tokensForMarketing ? tokensForMarketing : mktTok;
            uint256 cb = bbTok >= tokensForBuyBack ? tokensForBuyBack : bbTok;
            uint256 cbf = bfTok >= tokensForLiquidityBackflow ? tokensForLiquidityBackflow : bfTok;
            uint256 cd = divTok >= tokensForDividends ? tokensForDividends : divTok;
            tokensForPlatform -= cp;
            tokensForMarketing -= cm;
            tokensForBuyBack -= cb;
            tokensForLiquidityBackflow -= cbf;
            tokensForDividends -= cd;
        }

        // 按千分比拆分 BASE（platform+mkt+bb+bf+div = 1000）
        uint256 platformBase = baseOut * platformShare / total;
        uint256 mktBase      = baseOut * marketingShare / total;
        uint256 bbBase       = baseOut * buyBackShare / total;
        uint256 bfBase       = baseOut * liquidityBackflowShare / total;
        uint256 divBase      = baseOut * dividendShare / total;

        if (platformBase > 0 && launchpad != address(0)) {
            uint256 p = isBnbBase ? platformBase : _baseToWBNB(platformBase);
            if (p > 0) try ILaunchpad(launchpad).onProjectFee{value: p}(address(this), msg.sender, p) {} catch {}
        }
        if (mktBase > 0 && marketingWallet != address(0)) {
            uint256 m = isBnbBase ? mktBase : _baseToWBNB(mktBase);
            if (m > 0) payable(marketingWallet).call{value: m}("");
        }
        if (bbBase > 0) {
            uint256 w = isBnbBase ? bbBase : _baseToWBNB(bbBase);
            if (w > 0) _buyBackAndBurn(w);
        }
        if (bfBase > 0 && bfTokenHalf > 0) _backfillLiquidity(bfBase, bfTokenHalf);

        if (activeDiv != 0) {
            _processDividends(activeDiv, 100);
            address reward = _divs[activeDiv].rewardToken;
            if (reward == baseToken) {
                // 分红=底池镜像币：主回流已是 base，直接记
                if (divBase > 0) _creditDividend(activeDiv, divBase);
            } else if (reward == WBNB) {
                uint256 w = isBnbBase ? divBase : _baseToWBNB(divBase);
                if (w > 0) _creditDividend(activeDiv, w);
            } else if (reward != address(0) && divBase > 0) {
                // 分红=任意 ERC20(USDT 等)：先把 base 折成 BNB 再换到 reward
                uint256 baseForRew = isBnbBase ? divBase : _baseToWBNB(divBase);
                if (baseForRew > 0) {
                    uint256 beforeRew = IERC20External(reward).balanceOf(address(this));
                    address[] memory rp = new address[](2);
                    rp[0] = WBNB; rp[1] = reward;
                    try router.swapExactETHForTokens{value: baseForRew}(minAmountOut[reward], rp, address(this), block.timestamp + 300) {} catch {}
                    uint256 got = IERC20External(reward).balanceOf(address(this)) - beforeRew;
                    if (got > 0) _creditDividend(activeDiv, got);
                }
            }
            _processDividends(activeDiv, 100);
        }
        // Fee buckets are decremented above; individual payout events provide
        // the auditable trail without adding another aggregate log.
    }

    // Reference-style non-blocking fee flush: the real work runs via an EXTERNAL
    // self-call wrapped in try/catch, so any revert rolls the whole flush back
    // atomically and is swallowed. It can never corrupt an in-flight AMM swap or
    // block a user's buy/sell, even on an ultra-thin pool.
    function processFees() external {
        if (_swappingFees) return;
        _swappingFees = true;
        try this._processFeesDispatch() {} catch {}
        _swappingFees = false;
    }

    function _processFeesDispatch() external {
        if (msg.sender != address(this)) revert Guard();
        _processFees();
    }

    function _buyBackAndBurn(uint256 bnbIn) internal {
        if (bnbIn == 0) return;
        _inSwap = true;
        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = address(this);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: bnbIn}(minAmountOut[address(this)], path, DEAD, block.timestamp + 300);
        _inSwap = false;
    }

    // Liquidity backflow: pair keeps token half + BASE half, LP goes to DEAD.
    //  - base=WBNB : baseIn 就是 BNB -> addLiquidityETH
    //  - base=镜像币: baseIn 已由 _swapToBase 直接持有 -> addLiquidity(token, base)
    function _backfillLiquidity(uint256 baseIn, uint256 tokenIn) internal {
        if (baseIn == 0 || tokenIn == 0) return;
        if (balanceOf[address(this)] < tokenIn) return;
        _inSwap = true;
        if (baseToken == WBNB) {
            allowance[address(this)][address(router)] = type(uint256).max;
            router.addLiquidityETH{value: baseIn}(address(this), tokenIn, 0, 0, DEAD, block.timestamp + 300);
        } else {
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this));
            if (baseBal < baseIn) baseIn = baseBal;
            if (baseIn > 0) {
                allowanceRouter(baseToken);
                router.addLiquidity(address(this), baseToken, tokenIn, baseIn, 0, 0, DEAD, block.timestamp + 300);
            }
        }
        _inSwap = false;
    }

    // ========== DIVIDEND SYSTEM ==========

    uint8 public constant DIV_HOLD = 1;
    uint8 public constant DIV_LIQ = 2;
    uint8 public constant DIV_BURN = 3;
    uint256 public constant DIV_PRECISION = 1e18;

    struct DivData {
        bool enabled;
        address rewardToken;
        uint256 minEligible;
        uint256 accPerShare;
        uint256 totalShares;
        uint256 pendingReward;
        uint256 cursor;                       // 自动派发的游标
        address[] holders;                    // 有分红的持有人队列
        mapping(address => bool) inHolders;   // 是否在队列
        mapping(address => uint256) holderIndex; // 队列下标(O(1)移除)
        mapping(address => uint256) shares;
        mapping(address => uint256) paidPerShare;
    }

    mapping(uint8 => DivData) internal _divs;

    function divInfo(uint8 id) external view returns (bool enabled, address rewardToken, uint256 minEligible, uint256 accPerShare, uint256 totalShares, uint256 pendingReward) {
        DivData storage d = _divs[id];
        return (d.enabled, d.rewardToken, d.minEligible, d.accPerShare, d.totalShares, d.pendingReward);
    }

    function divShares(uint8 id, address user) external view returns (uint256) {
        return _divs[id].shares[user];
    }

    function enableDiv(uint8 id, address rewardToken, uint256 minEligible, bool f) external onlyOwner {
        if (configFreeze) revert Frozen();   // 首次 mint 起冻结分红模式/奖励币/门槛
        if (id < DIV_HOLD || id > DIV_BURN) revert Guard();
        if (f) {
            for (uint8 other = DIV_HOLD; other <= DIV_BURN; other++) {
                if (other != id && _divs[other].enabled) {
                    require(_divs[other].pendingReward == 0);
                    _divs[other].enabled = false;
                }
            }
        }
        DivData storage d = _divs[id];
        if (d.rewardToken != rewardToken) {
            require(d.pendingReward == 0 && d.accPerShare == 0);
            d.accPerShare = 0;
        }
        d.rewardToken = rewardToken;
        d.minEligible = minEligible;
        d.enabled = f;
    }

    function _recordDivShare(uint8 id, address account, uint256 amount) internal {
        DivData storage d = _divs[id];
        if (!d.enabled) return;
        if (excludedFromDividends[account]) return; // 黑洞/池子/锁仓/交易所不参与
        uint256 old = d.shares[account];
        uint256 next = d.shares[account] + amount;
        d.shares[account] = next;
        if (old < d.minEligible) {
            if (next < d.minEligible) return;
            d.totalShares += next;
            d.paidPerShare[account] = (next * d.accPerShare) / DIV_PRECISION;
            _divHoldersPush(id, account);   // 达到门槛 -> 进自动派发队列
        } else {
            d.totalShares += amount;
            d.paidPerShare[account] += (amount * d.accPerShare) / DIV_PRECISION;
        }
    }

    function _creditDividend(uint8 id, uint256 amount) internal {
        if (amount == 0) return;
        DivData storage d = _divs[id];
        if (!d.enabled) return;
        d.pendingReward += amount;
        if (d.totalShares > 0) d.accPerShare += (amount * DIV_PRECISION) / d.totalShares;
    }

    function _nativeDividendReserve() internal view returns (uint256 reserved) {
        for (uint8 id = DIV_HOLD; id <= DIV_BURN; id++) {
            if (_divs[id].rewardToken == WBNB) reserved += _divs[id].pendingReward;
        }
    }

    function _activeDivId() internal view returns (uint8) {
        for (uint8 id = DIV_HOLD; id <= DIV_BURN; id++) if (_divs[id].enabled) return id;
        return 0;
    }

    // ---- 持有人队列（用于自动派发，对齐参考合约 process(gas)）----
    function _divHoldersPush(uint8 id, address acct) internal {
        DivData storage d = _divs[id];
        if (d.inHolders[acct]) return;
        d.inHolders[acct] = true;
        d.holderIndex[acct] = d.holders.length;
        d.holders.push(acct);
    }

    // LP dividend weight follows the user's current LP-token balance, as in
    // the reference tracker. Refreshing also handles LP additions/removals.
    function _setLiqShare(address account, uint256 lpBal) internal {
        DivData storage d = _divs[DIV_LIQ];
        uint256 next = lpBal >= d.minEligible ? lpBal : 0;
        uint256 old = d.shares[account];
        if (old == next) return;
        if (old > 0) {
            uint256 due = _dividendDue(d, account);
            if (due > 0 && d.pendingReward >= due && _payoutRaw(DIV_LIQ, account, due)) {
                d.pendingReward -= due;
            }
        }
        if (old > 0) d.totalShares -= old;
        d.shares[account] = next;
        d.paidPerShare[account] = (next * d.accPerShare) / DIV_PRECISION;
        if (next > 0) {
            d.totalShares += next;
            _divHoldersPush(DIV_LIQ, account);
        } else {
            _divHoldersRemove(DIV_LIQ, account);
        }
    }

    // O(1) 移除：把队尾移到被删位再 pop，维护 holderIndex，避免 O(n) 线性扫描导致 Gas 膨胀
    function _divHoldersRemove(uint8 id, address acct) internal {
        DivData storage d = _divs[id];
        if (!d.inHolders[acct]) return;
        uint256 idx = d.holderIndex[acct];
        uint256 last = d.holders.length - 1;
        if (idx != last) {
            address moved = d.holders[last];
            d.holders[idx] = moved;
            d.holderIndex[moved] = idx;
            if (idx < d.cursor) d.cursor = idx;   // 游标回调，避免跳过
        }
        d.holders.pop();
        delete d.holderIndex[acct];
        d.inHolders[acct] = false;
    }
    function _dividendDue(DivData storage d, address acct) internal view returns (uint256 due) {
        uint256 s = d.shares[acct];
        if (s == 0) return 0;
        uint256 gross = (s * d.accPerShare) / DIV_PRECISION;
        due = gross > d.paidPerShare[acct] ? gross - d.paidPerShare[acct] : 0;
    }
    // 底层派发：原生代币/WBNB/ERC20。返回 bool 而非 revert，供自动派发跳过；
    // 手动领取(_payout)再 require(ok)。消除 _tryPayout / _payout 的重复代码。
    function _payoutRaw(uint8 id, address user, uint256 amount) internal returns (bool) {
        if (amount == 0) return true;
        DivData storage d = _divs[id];
        if (d.rewardToken == address(0)) {
            balanceOf[address(this)] -= amount;
            balanceOf[user] += amount;
            emit Transfer(address(this), user, amount);
            return true;
        } else if (d.rewardToken == WBNB) {
            (bool ok,) = payable(user).call{value: amount}("");
            return ok;
        }
        (bool balOk, bytes memory balData) = address(d.rewardToken).staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
        if (!balOk || balData.length < 32) return false;
        if (abi.decode(balData, (uint256)) < amount) return false;
        (bool tOk, bytes memory ret) = address(d.rewardToken).call(abi.encodeWithSelector(0xa9059cbb, user, amount));
        if (!tOk) return false;
        if (ret.length != 0 && !abi.decode(ret, (bool))) return false;
        return true;
    }
    // 软派发：某持有人收不到时不回退整批，留到下次再发
    function _processDividends(uint8 id, uint256 maxIter) internal {
        DivData storage d = _divs[id];
        if (!d.enabled) return;
        uint256 n = d.holders.length;
        if (n == 0) return;
        for (uint256 i = 0; i < maxIter && d.cursor < n; i++) {
            address a = d.holders[d.cursor];
            if (a != address(0) && !excludedFromDividends[a]) {
                uint256 due = _dividendDue(d, a);
                if (due > 0 && d.pendingReward >= due) {
                    if (_payoutRaw(id, a, due)) { d.paidPerShare[a] = due + d.paidPerShare[a]; d.pendingReward -= due; }
                }
            }
            d.cursor++;
        }
        if (d.cursor >= n) d.cursor = 0;
    }

    function depositDiv(uint8 id) external payable nonReentrant {
        DivData storage d = _divs[id];
        if (d.rewardToken != WBNB) revert Guard();
        if (!d.enabled) revert Guard();
        _creditDividend(id, msg.value);
        _processDividends(id, 100);
    }

    function claimDiv(uint8 id) external nonReentrant {
        DivData storage d = _divs[id];
        if (!d.enabled) revert Guard();
        if (id == DIV_LIQ && pair != address(0)) _setLiqShare(msg.sender, IERC20External(pair).balanceOf(msg.sender));
        uint256 userShare = d.shares[msg.sender];
        if (userShare == 0) return;
        if (d.pendingReward == 0) return;
        uint256 gross = (userShare * d.accPerShare) / DIV_PRECISION;
        uint256 due = gross > d.paidPerShare[msg.sender] ? gross - d.paidPerShare[msg.sender] : 0;
        if (due == 0) return;
        d.paidPerShare[msg.sender] = gross;
        d.pendingReward -= due;
        _payout(id, msg.sender, due);
    }

    function _payout(uint8 id, address user, uint256 amount) internal {
        if (!_payoutRaw(id, user, amount)) revert Guard();
    }

    function _settleHold(address user) internal {
        DivData storage d = _divs[DIV_HOLD];
        if (!d.enabled) return;
        if (excludedFromDividends[user]) return; // 被排除地址从不派发
        uint256 old = d.shares[user];
        if (old == 0) return;
        uint256 gross = (old * d.accPerShare) / DIV_PRECISION;
        if (d.paidPerShare[user] >= gross) return;
        uint256 due = gross - d.paidPerShare[user];
        if (due == 0) return;
        require(d.pendingReward >= due);
        d.paidPerShare[user] = gross;
        d.pendingReward -= due;
        _payout(DIV_HOLD, user, due);
    }

    function _refreshHold(address user) internal {
        DivData storage d = _divs[DIV_HOLD];
        if (!d.enabled) return;
        if (excludedFromDividends[user]) { // 黑洞/池子/锁仓/交易所：份额清零、不参与
            uint256 oldEx = d.shares[user];
            if (oldEx != 0) { d.totalShares -= oldEx; d.shares[user] = 0; d.paidPerShare[user] = 0; _divHoldersRemove(DIV_HOLD, user); }
            return;
        }
        uint256 newShare = balanceOf[user] >= d.minEligible ? balanceOf[user] : 0;
        uint256 old = d.shares[user];
        if (old == 0 && newShare == 0) return;
        d.totalShares = d.totalShares - old + newShare;
        d.shares[user] = newShare;
        d.paidPerShare[user] = (newShare * d.accPerShare) / DIV_PRECISION;
        if (newShare > 0 && old == 0) _divHoldersPush(DIV_HOLD, user);
        else if (newShare == 0 && old > 0) _divHoldersRemove(DIV_HOLD, user);
    }

    function burnDiv(uint256 amount) external nonReentrant {
        require(balanceOf[msg.sender] >= amount, "BAL");
        _burn(msg.sender, amount);
        emit Transfer(msg.sender, DEAD, amount);
        if (_divs[DIV_BURN].enabled) {
            _recordDivShare(DIV_BURN, msg.sender, amount);
        }
    }

    function rescue(address token, uint256 amount) external onlyOwner {
        require(token != address(this) && token != pair && token != baseToken);
        for (uint8 id = DIV_HOLD; id <= DIV_BURN; id++) {
            require(!(_divs[id].rewardToken == token && _divs[id].pendingReward > 0));
        }
        require(IERC20External(token).transfer(msg.sender, amount), "RESCUE");
    }
}
