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

contract OldStocksToken {
    error InvalidMintConfig();
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
    address public constant DEAD = address(0xdead);
    mapping(address => bool) public isPool;
    mapping(address => bool) public isExcludedFromFees;

    mapping(address => uint256) public minAmountOut;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Minted(address indexed user, uint256 bnb, uint256 tokens);
    event Refunded(address indexed user, uint256 bnb);
    event Graduated(uint256 totalMinted, uint256 lpBurned, uint256 devBNB);
    event FeesProcessed(uint256 tokensSwapped, uint256 bnbReceived);
    event BuyBackAndBurn(uint256 bnbIn, uint256 tokensOut);

    modifier onlyOwner() { require(msg.sender == owner, "NO"); _; }
    modifier nonReentrant() { require(!_reentrancy, "RE"); _reentrancy = true; _; _reentrancy = false; }
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
        _mint(address(this), MAX_SUPPLY);
    }

    function transferOwnership(address a) external onlyOwner { pendingOwner = a; }
    function acceptOwnership() external { require(msg.sender == pendingOwner, "NP"); owner = pendingOwner; pendingOwner = address(0); }
    function setDev(address a) external onlyOwner { devWallet = a; }
    function setMarketing(address a) external onlyOwner { marketingWallet = a; }
    function setLaunchpad(address a) external onlyOwner { launchpad = a; }
    function setPair(address a) external onlyOwner { pair = a; isPool[a] = true; }
    function addPool(address a) external onlyOwner { isPool[a] = true; }
    function removePool(address a) external onlyOwner { isPool[a] = false; }
    function setExcluded(address a, bool f) external onlyOwner { isExcludedFromFees[a] = f; }
    function setMinAmountOut(address token, uint256 minOut) external onlyOwner { minAmountOut[token] = minOut; }

    function _mint(address to, uint256 amount) internal { require(totalSupply + amount <= MAX_SUPPLY, "MAX"); totalSupply += amount; balanceOf[to] += amount; emit Transfer(address(0), to, amount); }
    function _burn(address a, uint256 amount) internal { totalSupply -= amount; balanceOf[a] -= amount; emit Transfer(a, address(0), amount); }

    uint256 public buyTax;
    uint256 public sellTax;
    uint256 public transferTax;
    uint256 public constant TAX_DIVISOR = 1000;

    function setTax(uint256 b, uint256 s, uint256 t) external onlyOwner {
        require(b <= 250 && s <= 250 && t <= 250, "TX");
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
    function setGraduationThreshold(uint256 t) external onlyOwner { require(t >= 0.001 ether, "GT"); minCapBNB = t; }

    receive() external payable {
        if (msg.value > 0 && msg.sender != address(router) && msg.sender != WBNB) swapIn(msg.value);
    }

    function swapIn(uint256 bnbAmount) public payable nonReentrant {
        require(mintEnabled, "MOFF");
        require(block.timestamp >= mintStart && block.timestamp <= mintEnd, "MWIN");
        require(!mintCapped, "CAPED");
        require(bnbAmount >= minMint && bnbAmount <= maxMint, "MAMT");
        if (whitelistOnly) require(whitelist[msg.sender], "MWL");
        require(msg.value == bnbAmount, "VAL");

        uint256 toCap = capBNB - totalMintedBNB;
        uint256 use = bnbAmount > toCap ? toCap : bnbAmount;
        require(use > 0, "CAPED");

        totalMintedBNB += use;
        mintedBNB[msg.sender] += use;
        refunded[msg.sender] = false;
        if (walletCap > 0) require(mintedBNB[msg.sender] <= walletCap, "WCAP");

        // Fixed 50% token mint share, pro-rata by BNB.
        bool last = totalMintedBNB >= capBNB;
        uint256 tokens = last ? MINT_RESERVE - mintTokensDistributed : (MINT_RESERVE * use) / capBNB;
        require(balanceOf[address(this)] >= tokens, "LOW");
        balanceOf[address(this)] -= tokens;
        balanceOf[msg.sender] += tokens;
        mintedTokenAmount[msg.sender] += tokens;
        mintTokensDistributed += tokens;
        emit Transfer(address(this), msg.sender, tokens);

        // 100% of each mint's BNB pairs with the LP reserve (matches the reference
        // launchpad) so the pool always keeps full real depth for buy/sell even at
        // tiny mint amounts. Dev is funded via sell fees instead of a mint cut.
        uint256 lpBNB = use;
        totalPoolBNB += lpBNB;
        mintedPoolBNB[msg.sender] += lpBNB;

        uint256 lpTokens = last ? MINT_RESERVE - lpTokensDistributed : (MINT_RESERVE * use) / capBNB;
        mintedLPTokenAmount[msg.sender] += lpTokens;
        _addLiquidityLive(lpBNB, lpTokens);

        if (last) _graduate();

        if (msg.value > use) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - use}("");
            require(ok, "REF");
        }
        emit Minted(msg.sender, use, tokens);
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
            require(baseBal > 0, "SWAP");
            allowanceRouter(baseToken);
            (,, uint256 liq) = router.addLiquidity(address(this), baseToken, tokensForLP, baseBal, 0, 0, address(this), block.timestamp + 300);
            totalLPToken += liq;
        }
        lpTokensDistributed += tokensForLP;
        _inSwap = false;
        address p = pancakeFactory.getPair(address(this), baseToken);
        if (p != address(0) && pair == address(0)) { pair = p; isPool[p] = true; }
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
        require(!mintCapped, "CAPED");
        require(block.timestamp > refundDeadline, "WAIT");
        uint256 amt = mintedPoolBNB[msg.sender];
        require(amt > 0, "NONE");
        require(!refunded[msg.sender], "DONE");
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
        require(held >= tokens, "SOLD");
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
        emit Refunded(msg.sender, amt);
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
        require(balanceOf[from] >= amount, "BAL");
        require(to != address(0), "ZERO");

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
        balanceOf[to] += net;
        emit Transfer(from, to, net);
        if (tax > 0) emit Transfer(from, address(this), tax);

        if (_divs[DIV_HOLD].enabled) {
            _refreshHold(from);
            _refreshHold(to);
        }

        if (to == DEAD && _divs[DIV_BURN].enabled) _recordDivShare(DIV_BURN, from, amount);
        if (isPool[to] && _divs[DIV_LIQ].enabled) _recordDivShare(DIV_LIQ, from, amount);

        if (tax > 0 && !_inSwap && pair != address(0) && _feeBucketsTotal() >= swapThreshold && !isPool[from]) {
            // Reference-style: external self-call wrapped in try/catch so a failed fee
            // flush is atomic (all-or-nothing) and swallowed — it can never corrupt the
            // in-flight AMM swap or block a user's trade on a thin pool.
            try this.processFees() {} catch {}
        }
    }

    // Loopback to turn a token chunk into BNB via the active pool.
    function _swapTokensToBNB(uint256 amount) internal returns (uint256 bnb) {
        if (amount == 0 || balanceOf[address(this)] < amount) return 0;
        address[] memory path;
        if (baseToken == WBNB) {
            path = new address[](2);
            path[0] = address(this);
            path[1] = WBNB;
        } else {
            path = new address[](3);
            path[0] = address(this);
            path[1] = baseToken;
            path[2] = WBNB;
        }
        _inSwap = true;
        uint256 before = address(this).balance;
        // Atomic (no internal catch): if this can't complete, the WHOLE fee-flush
        // rolls back wholesale and the user's sell proceeds on an untouched pool —
        // exactly how the reference launchpad keeps trades alive on thin pools.
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(amount, minAmountOut[WBNB], path, address(this), block.timestamp + 300);
        bnb = address(this).balance - before;
        _inSwap = false;
    }

    // Allocate the FULL tax (permille = 1000) precisely:
    // platform 200 ; project shares sum to 800. Each share swaps its own tokens.
    function _processFees() internal {
        uint256 free = _feeBucketsTotal();
        if (free < swapThreshold) return;
        uint256 amt = swapThreshold;
        uint256 total = TAX_DIVISOR;
        uint8 activeDiv = _activeDivId();
        bool nativeDiv = activeDiv != 0 && _divs[activeDiv].rewardToken == address(0);

        uint256 platformTok = (amt * platformShare) / total;
        uint256 mktTok = (amt * marketingShare) / total;
        uint256 bbTok = (amt * buyBackShare) / total;
        uint256 bfTok = (amt * liquidityBackflowShare) / total;
        uint256 bfTokenHalf = bfTok / 2;
        uint256 divTok = (amt * dividendShare) / total;

        uint256 platformBnB = _swapTokensToBNB(platformTok);
        uint256 mktBnB = _swapTokensToBNB(mktTok);
        uint256 bbBnB = _swapTokensToBNB(bbTok);
        uint256 bfBnB = _swapTokensToBNB(bfTokenHalf);

        uint256 freeNow = _feeBucketsTotal();
        uint256 consumed = freeNow >= amt ? amt : freeNow;
        if (consumed > 0) {
            uint256 cp = (platformTok >= tokensForPlatform ? tokensForPlatform : platformTok);
            uint256 cm = (mktTok >= tokensForMarketing ? tokensForMarketing : mktTok);
            uint256 cb = (bbTok >= tokensForBuyBack ? tokensForBuyBack : bbTok);
            uint256 cbf = (bfTok >= tokensForLiquidityBackflow ? tokensForLiquidityBackflow : bfTok);
            uint256 cd = (divTok >= tokensForDividends ? tokensForDividends : divTok);
            tokensForPlatform -= cp;
            tokensForMarketing -= cm;
            tokensForBuyBack -= cb;
            tokensForLiquidityBackflow -= cbf;
            tokensForDividends -= cd;
        }

        if (platformBnB > 0 && launchpad != address(0)) {
            try ILaunchpad(launchpad).onProjectFee{value: platformBnB}(address(this), msg.sender, platformBnB) {} catch {}
        }
        if (mktBnB > 0 && marketingWallet != address(0)) {
            payable(marketingWallet).call{value: mktBnB}("");
        }
        if (bbBnB > 0) _buyBackAndBurn(bbBnB);
        if (bfBnB > 0 && bfTokenHalf > 0) _backfillLiquidity(bfBnB, bfTokenHalf);

        if (activeDiv != 0) {
            if (nativeDiv) {
                _creditDividend(activeDiv, divTok);
            } else {
                uint256 dBnB = _swapTokensToBNB(divTok);
                if (dBnB > 0) {
                    address reward = _divs[activeDiv].rewardToken;
                    if (reward == WBNB) {
                        _creditDividend(activeDiv, dBnB);
                    } else {
                        uint256 beforeRew = IERC20External(reward).balanceOf(address(this));
                        address[] memory rp = new address[](2);
                        rp[0] = WBNB;
                        rp[1] = reward;
                        _inSwap = true;
                        router.swapExactETHForTokens{value: dBnB}(minAmountOut[reward], rp, address(this), block.timestamp + 300);
                        _inSwap = false;
                        uint256 got = IERC20External(reward).balanceOf(address(this)) - beforeRew;
                        if (got > 0) _creditDividend(activeDiv, got);
                    }
                }
            }
        }
        emit FeesProcessed(amt, 0);
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
        if (msg.sender != address(this)) revert("SELF");
        _processFees();
    }

    function _buyBackAndBurn(uint256 bnbIn) internal {
        if (bnbIn == 0) return;
        _inSwap = true;
        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = address(this);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: bnbIn}(minAmountOut[address(this)], path, DEAD, block.timestamp + 300);
        emit BuyBackAndBurn(bnbIn, bnbIn);
        _inSwap = false;
    }

    // Liquidity backflow: pair kept token half + swapped-BNB half, LP goes to DEAD.
    function _backfillLiquidity(uint256 bnbIn, uint256 tokenIn) internal {
        if (bnbIn == 0 || tokenIn == 0) return;
        if (balanceOf[address(this)] < tokenIn) return;
        _inSwap = true;
        if (baseToken == WBNB) {
            allowance[address(this)][address(router)] = type(uint256).max;
            router.addLiquidityETH{value: bnbIn}(address(this), tokenIn, 0, 0, DEAD, block.timestamp + 300);
        } else {
            address[] memory path = new address[](2);
            path[0] = WBNB;
            path[1] = baseToken;
            uint256 baseBefore = IERC20External(baseToken).balanceOf(address(this));
            router.swapExactETHForTokens{value: bnbIn}(0, path, address(this), block.timestamp + 300);
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this)) - baseBefore;
            if (baseBal > 0) {
                allowanceRouter(baseToken);
                router.addLiquidity(address(this), baseToken, tokenIn, baseBal, 0, 0, DEAD, block.timestamp + 300);
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

    function pendingDiv(uint8 id, address user) external view returns (uint256) {
        DivData storage d = _divs[id];
        if (d.shares[user] == 0 || d.totalShares == 0) return 0;
        uint256 gross = (d.shares[user] * d.accPerShare) / DIV_PRECISION;
        return gross > d.paidPerShare[user] ? gross - d.paidPerShare[user] : 0;
    }

    function enableDiv(uint8 id, address rewardToken, uint256 minEligible, bool f) external onlyOwner {
        require(id >= DIV_HOLD && id <= DIV_BURN, "ID");
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
        uint256 old = d.shares[account];
        uint256 next = d.shares[account] + amount;
        d.shares[account] = next;
        if (old < d.minEligible) {
            if (next < d.minEligible) return;
            d.totalShares += next;
            d.paidPerShare[account] = (next * d.accPerShare) / DIV_PRECISION;
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

    function _selfTokenDividendReserve() internal view returns (uint256 reserved) {
        for (uint8 id = DIV_HOLD; id <= DIV_BURN; id++) {
            if (_divs[id].rewardToken == address(0)) reserved += _divs[id].pendingReward;
        }
    }

    function _activeDivId() internal view returns (uint8) {
        for (uint8 id = DIV_HOLD; id <= DIV_BURN; id++) if (_divs[id].enabled) return id;
        return 0;
    }

    function depositDiv(uint8 id) external payable nonReentrant {
        DivData storage d = _divs[id];
        require(d.rewardToken == WBNB);
        require(d.enabled, "OFF");
        _creditDividend(id, msg.value);
    }

    function depositDivToken(uint8 id, address token, uint256 amount) external nonReentrant {
        DivData storage d = _divs[id];
        require(d.rewardToken == token, "TKN");
        require(d.enabled, "OFF");
        (bool s,) = address(token).call(abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount)); require(s, "TF");
        _creditDividend(id, amount);
    }

    function claimDiv(uint8 id) external nonReentrant {
        DivData storage d = _divs[id];
        require(d.enabled, "DISABLED");
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
        if (amount == 0) return;
        DivData storage d = _divs[id];
        if (d.rewardToken == address(0)) {
            balanceOf[address(this)] -= amount;
            balanceOf[user] += amount;
            emit Transfer(address(this), user, amount);
        } else if (d.rewardToken == WBNB) {
            (bool ok,) = payable(user).call{value: amount}("");
            require(ok, "PAY");
        } else {
            (bool balOk, bytes memory balData) = address(d.rewardToken).staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
            require(balOk && balData.length >= 32);
            uint256 erc20Bal = abi.decode(balData, (uint256));
            require(erc20Bal >= amount, "BAL");
            (bool tOk, bytes memory ret) = address(d.rewardToken).call(abi.encodeWithSelector(0xa9059cbb, user, amount));
            require(tOk && (ret.length == 0 || abi.decode(ret, (bool))));
        }
    }

    function _settleHold(address user) internal {
        DivData storage d = _divs[DIV_HOLD];
        if (!d.enabled) return;
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
        uint256 newShare = balanceOf[user] >= d.minEligible ? balanceOf[user] : 0;
        uint256 old = d.shares[user];
        if (old == 0 && newShare == 0) return;
        d.totalShares = d.totalShares - old + newShare;
        d.shares[user] = newShare;
        d.paidPerShare[user] = (newShare * d.accPerShare) / DIV_PRECISION;
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

    function withdrawBNB(uint256 amount) external onlyOwner {
        require(graduated);
        uint256 reserved = _nativeDividendReserve();
        require(amount <= address(this).balance - reserved, "BAL");
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "WIT");
    }

    // 在非"池内转账"的安全时机把累计的税收益(营销/回购/回流/分红/平台)真正分发出去。
    //   - 买卖等池内转账不会再触发 _processFees(避免再入被锁的池),税币先留在合约;
    //   - 任何钱包可在此处(或下一次普通 P2P 转账)触发,池未被占用时安全。
    function flushFeeReserves() external nonReentrant {
        require(pair != address(0), "NOPAIR");
        if (_inSwap) return;
        _processFees();
    }
}
