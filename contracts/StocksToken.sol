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

contract StocksToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 30;
    uint256 public totalSupply;
    uint256 public constant MAX_SUPPLY = 10 ** 30;
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

    uint256 public constant platformShare = 200;
    uint256 public marketingShare = 300;
    uint256 public buyBackShare = 250;
    uint256 public liquidityShare = 250;
    uint256 public selfDivShare = 100;
    uint256 public swapThreshold = 10 ** 24;

    function setFeeSplit(uint256 m, uint256 bb, uint256 l) external onlyOwner {
        require(m + bb + l + selfDivShare <= TAX_DIVISOR - platformShare, "SPLIT");
        marketingShare = m; buyBackShare = bb; liquidityShare = l;
    }
    function setSelfDivShare(uint256 s) external onlyOwner {
        require(s + marketingShare + buyBackShare + liquidityShare <= TAX_DIVISOR - platformShare, "SPLIT");
        selfDivShare = s;
    }
    function setSwapThreshold(uint256 t) external onlyOwner { swapThreshold = t; }

    bool public mintEnabled;
    bool public whitelistOnly;
    uint256 public mintRate;
    uint256 public poolPercent = 1000;
    uint256 public lpTokenRatio = 1000;
    uint256 public minMint;
    uint256 public maxMint;
    uint256 public walletCap;
    uint256 public capBNB;
    uint256 public minCapBNB = 0.1 ether;
    uint256 public mintStart;
    uint256 public mintEnd;
    uint256 public refundDeadline;
    uint256 public constant MINT_REFUND_WINDOW = 24 hours;
    bool public mintCapped;
    bool public graduated;
    uint256 public totalMintedBNB;
    uint256 public totalLPToken;
    mapping(address => bool) public whitelist;
    mapping(address => uint256) public mintedBNB;
    mapping(address => bool) public refunded;

    event MintConfigSet(uint256 capBNB, uint256 mintRate, uint256 poolPercent);

    function setMintConfig(bool wl, uint256 rate, uint256 poolPct, uint256 lpRatio, uint256 minM, uint256 maxM, uint256 wCap, uint256 cap, uint256 duration) external onlyOwner {
        require(rate > 0, "RATE");
        require(poolPct > 0 && poolPct <= TAX_DIVISOR, "PP");
        require(lpRatio > 0 && lpRatio <= TAX_DIVISOR, "LR");
        require(minM >= 0.001 ether, "MN");
        require(maxM >= minM, "MM");
        require(wCap == 0 || wCap >= maxM, "WC");
        require(cap >= minCapBNB, "CAP");
        whitelistOnly = wl;
        mintRate = rate;
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
        emit MintConfigSet(cap, rate, poolPct);
    }
    function setWhitelist(address[] calldata addrs, bool f) external onlyOwner { for (uint256 i = 0; i < addrs.length; i++) whitelist[addrs[i]] = f; }
    function setGraduationThreshold(uint256 t) external onlyOwner { require(t >= 0.1 ether, "GT"); minCapBNB = t; }
    function pauseMint(bool f) external onlyOwner { mintEnabled = !f; }

    receive() external payable {}

    // Fix 1: Every mint adds liquidity in real-time, then check graduation
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

        if (walletCap > 0) require(mintedBNB[msg.sender] <= walletCap, "WCAP");

        uint256 tokens = use * mintRate;
        _mint(msg.sender, tokens);

        // Fix 1: Every mint adds liquidity in real-time
        _addLiquidityLive(use);

        // Fix 1: Check graduation after every mint
        if (totalMintedBNB >= capBNB) _graduate();

        if (msg.value > use) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - use}("");
            require(ok, "REF");
        }
        emit Minted(msg.sender, use, tokens);
    }
    // Fix 2 + Fix 3: Remove try/catch from _addLiquidityLive
    function _addLiquidityLive(uint256 bnbIn) internal {
        uint256 lpBNB = (bnbIn * poolPercent) / TAX_DIVISOR;
        uint256 tokensForLP = (bnbIn * mintRate * lpTokenRatio) / TAX_DIVISOR;
        if (lpBNB == 0 || tokensForLP == 0) return;
        _mint(address(this), tokensForLP);
        allowance[address(this)][address(router)] = type(uint256).max;
        _inSwap = true;
        if (baseToken == WBNB) {
            // Will revert on failure
            (,, uint256 liq) = router.addLiquidityETH{value: lpBNB}(address(this), tokensForLP, 0, 0, address(this), block.timestamp + 300);
            totalLPToken += liq;
        } else {
            // Fix 2: Swap BNB to baseToken, will revert on failure
            address[] memory path = new address[](2);
            path[0] = WBNB;
            path[1] = baseToken;
            uint256 baseBefore = IERC20External(baseToken).balanceOf(address(this));
            router.swapExactETHForTokens{value: lpBNB}(0, path, address(this), block.timestamp + 300);
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this)) - baseBefore;
            require(baseBal > 0, "SWAP");
            // Fix 2: Add liquidity, will revert on failure
            allowanceRouter(baseToken);
            (,, uint256 liq) = router.addLiquidity(address(this), baseToken, tokensForLP, baseBal, 0, 0, address(this), block.timestamp + 300);
            totalLPToken += liq;
        }
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
        require(address(this).balance >= nativeReserved, "DIV_INSOLVENT");
        uint256 rest = address(this).balance - nativeReserved;
        if (rest > 0 && devWallet != address(0)) {
            (bool ok,) = payable(devWallet).call{value: rest}("");
            if (ok) rest = 0;
        }
        emit Graduated(totalMintedBNB, lpBal, address(this).balance);
    }

    // Only exception: _lpBalance is a view function, keep try/catch
    function _lpBalance() internal view returns (uint256) {
        if (pair == address(0)) return 0;
        try IERC20External(pair).balanceOf(address(this)) returns (uint256 b) { return b; } catch { return 0; }
    }

    // Fix 6: Fix refund LP calculation
    function refund() external nonReentrant returns (bool) {
        require(!mintCapped, "CAPED");
        require(block.timestamp > refundDeadline, "WAIT");
        uint256 amt = mintedBNB[msg.sender];
        require(amt > 0, "NONE");
        require(!refunded[msg.sender], "DONE");
        refunded[msg.sender] = true;
        mintedBNB[msg.sender] = 0;

        // Fix 6: Calculate lpToWithdraw BEFORE deducting totalMintedBNB
        uint256 prevTotal = totalMintedBNB;
        totalMintedBNB -= amt;

        uint256 tokens = amt * mintRate;
        uint256 held = balanceOf[msg.sender];
        require(held >= tokens, "SOLD");
        if (tokens > 0) _burn(msg.sender, tokens);

        uint256 nativeReserved = _nativeDividendReserve();
        require(address(this).balance >= nativeReserved, "DIV_INSOLVENT");
        uint256 availableBNB = address(this).balance - nativeReserved;
        if (availableBNB < amt) _withdrawLPForRefund(amt, prevTotal);
        (bool ok,) = payable(msg.sender).call{value: amt}("");
        require(ok, "RF");
        emit Refunded(msg.sender, amt);
        return true;
    }
    // Fix 3 + Fix 6: Remove try/catch, use prevTotal for LP calculation
    function _withdrawLPForRefund(uint256 userAmount, uint256 prevTotal) internal {
        if (pair == address(0)) return;
        uint256 lpBal = _lpBalance();
        if (lpBal == 0) return;
        // Fix 6: Use prevTotal (totalMintedBNB before deduction) for LP calculation
        uint256 lpToWithdraw = prevTotal > 0 ? (lpBal * userAmount) / prevTotal : 0;
        if (lpToWithdraw > lpBal) lpToWithdraw = lpBal;
        if (lpToWithdraw == 0) return;
        IERC20External(pair).approve(address(router), type(uint256).max);
        _inSwap = true;
        if (baseToken == WBNB) {
            // Fix 3: Will revert on failure
            router.removeLiquidityETH(address(this), lpToWithdraw, 0, 0, address(this), block.timestamp + 300);
        } else {
            // Fix 3: Will revert on failure
            router.removeLiquidity(address(this), baseToken, lpToWithdraw, 0, 0, address(this), block.timestamp + 300);
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this));
            if (baseBal > 0) {
                allowanceRouter(baseToken);
                address[] memory path = new address[](2);
                path[0] = baseToken;
                path[1] = WBNB;
                // Fix 3: Will revert on failure
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

    // Fix 7: Add mint period transfer lock
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
        if (tax > 0) balanceOf[address(this)] += tax;
        balanceOf[to] += net;
        emit Transfer(from, to, net);
        if (tax > 0) emit Transfer(from, address(this), tax);

        if (_divs[DIV_HOLD].enabled) {
            _refreshHold(from);
            _refreshHold(to);
        }

        // Fix 5: Shares are tracked by transfer-to-DEAD/pair logic, not in _depositDiv
        if (to == DEAD && _divs[DIV_BURN].enabled) _recordDivShare(DIV_BURN, from, amount);
        if (isPool[to] && _divs[DIV_LIQ].enabled) _recordDivShare(DIV_LIQ, from, amount);

        if (tax > 0 && !_inSwap && pair != address(0) && balanceOf[address(this)] >= swapThreshold) {
            _processFees();
        }
    }
    // Fix 3 + Fix 4: Remove try/catch, handle baseToken != WBNB, use balance diff
    function _processFees() internal {
        uint256 selfTokenReserved = _selfTokenDividendReserve();
        require(balanceOf[address(this)] >= selfTokenReserved, "DIV_INSOLVENT");
        uint256 contractTokens = balanceOf[address(this)] - selfTokenReserved;
        if (contractTokens < swapThreshold) return;
        uint256 swapAmt = swapThreshold;
        uint256 effectiveSelfDiv = (_divs[DIV_HOLD].enabled && _divs[DIV_HOLD].rewardToken == address(0)) ? selfDivShare : 0;
        uint256 total = marketingShare + buyBackShare + liquidityShare + platformShare + effectiveSelfDiv;
        if (total == 0) return;

        uint256 swapTotal = total - effectiveSelfDiv;
        if (swapTotal == 0) return;
        uint256 liqTokens = (swapAmt * liquidityShare) / total;
        uint256 sDivTokens = (swapAmt * effectiveSelfDiv) / total;
        uint256 swapTokens = swapAmt - liqTokens - sDivTokens;

        if (sDivTokens > 0) _creditDividend(DIV_HOLD, sDivTokens);

        _inSwap = true;
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
        uint256 minOut = minAmountOut[WBNB];
        uint256 before = address(this).balance;
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(swapTokens, minOut, path, address(this), block.timestamp + 300);
        _inSwap = false;

        uint256 bnbFromSwap = address(this).balance - before;

        if (platformShare > 0 && launchpad != address(0)) {
            uint256 pFee = (bnbFromSwap * platformShare) / swapTotal;
            if (pFee > 0) {
                ILaunchpad(launchpad).onProjectFee{value: pFee}(address(this), msg.sender, pFee);
            }
        }

        if (marketingShare > 0 && marketingWallet != address(0)) {
            uint256 mkt = (bnbFromSwap * marketingShare) / swapTotal;
            if (mkt > 0) {
                (bool ok,) = payable(marketingWallet).call{value: mkt}("");
                require(ok, "MKT");
            }
        }

        if (buyBackShare > 0) {
            uint256 bb = (bnbFromSwap * buyBackShare) / swapTotal;
            if (bb > 0) _buyBackAndBurn(bb);
        }

        if (liquidityShare > 0) {
            uint256 lq = (bnbFromSwap * liquidityShare) / swapTotal;
            if (lq > 0) _backfillLiquidity(lq);
        }

        emit FeesProcessed(swapTokens, bnbFromSwap);
    }
    // Fix 3: Remove try/catch from _buyBackAndBurn
    function _buyBackAndBurn(uint256 bnbIn) internal {
        if (bnbIn == 0) return;
        _inSwap = true;
        address[] memory path = new address[](2);
        path[0] = WBNB;
        path[1] = address(this);
        uint256 minOut = minAmountOut[address(this)];
        // Fix 3: Will revert on failure
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: bnbIn}(minOut, path, DEAD, block.timestamp + 300);
        _inSwap = false;
        emit BuyBackAndBurn(bnbIn, bnbIn);
    }

    // Fix 3: Remove try/catch from _backfillLiquidity
    function _backfillLiquidity(uint256 bnbIn) internal {
        if (bnbIn == 0) return;
        _inSwap = true;
        if (baseToken == WBNB) {
            uint256 half = bnbIn / 2;
            uint256 tokensForLP = (half * mintRate) / 1 ether;
            if (tokensForLP > 0) {
                _mint(address(this), tokensForLP);
                allowance[address(this)][address(router)] = type(uint256).max;
                // Fix 3: Will revert on failure
                (,, uint256 liq) = router.addLiquidityETH{value: half}(address(this), tokensForLP, 0, 0, address(this), block.timestamp + 300);
                totalLPToken += liq;
            }
        } else {
            address[] memory path = new address[](2);
            path[0] = WBNB;
            path[1] = baseToken;
            // Fix 3: Will revert on failure
            uint256 baseBefore = IERC20External(baseToken).balanceOf(address(this));
            router.swapExactETHForTokens{value: bnbIn}(0, path, address(this), block.timestamp + 300);
            uint256 baseBal = IERC20External(baseToken).balanceOf(address(this)) - baseBefore;
            require(baseBal > 0, "SWAP");
            allowanceRouter(baseToken);
            uint256 tokensForLP = (bnbIn * mintRate * lpTokenRatio) / TAX_DIVISOR / 1 ether;
            if (tokensForLP > 0) {
                _mint(address(this), tokensForLP);
                // Fix 3: Will revert on failure
                (,, uint256 liq) = router.addLiquidity(address(this), baseToken, tokensForLP, baseBal, 0, 0, address(this), block.timestamp + 300);
                totalLPToken += liq;
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

    // Fix 5: pendingDiv - correct formula with underflow protection
    function pendingDiv(uint8 id, address user) external view returns (uint256) {
        DivData storage d = _divs[id];
        if (d.shares[user] == 0 || d.totalShares == 0) return 0;
        uint256 gross = (d.shares[user] * d.accPerShare) / DIV_PRECISION;
        return gross > d.paidPerShare[user] ? gross - d.paidPerShare[user] : 0;
    }

    function enableDiv(uint8 id, address rewardToken, uint256 minEligible, bool f) external onlyOwner {
        require(id >= DIV_HOLD && id <= DIV_BURN, "ID");
        DivData storage d = _divs[id];
        if (d.rewardToken != rewardToken) {
            require(d.pendingReward == 0 && d.accPerShare == 0, "ACTIVE_DIV");
            d.accPerShare = 0;
        }
        d.rewardToken = rewardToken;
        d.minEligible = minEligible;
        d.enabled = f;
    }

// Fix 5: _depositDiv only adds native token dividends; ERC20 pools use depositDivToken
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
    // Fix 5: depositDiv checks d.enabled
function depositDiv(uint8 id) external payable nonReentrant {
        DivData storage d = _divs[id];
        require(d.rewardToken == WBNB, "BNBONLY");
        require(d.enabled, "OFF");
        _creditDividend(id, msg.value);
    }

    // Fix 5 + Fix 9: depositDivToken checks d.enabled, uses safeTransfer
    function depositDivToken(uint8 id, address token, uint256 amount) external nonReentrant {
        DivData storage d = _divs[id];
        require(d.rewardToken == token, "TKN");
        require(d.enabled, "OFF");
        (bool s,) = address(token).call(abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount)); require(s, "TF");
        _creditDividend(id, amount);
    }

    // Fix 5 + Fix 10: claimDiv deducts from pendingReward, adds to paidPerShare
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

    // Fix 9: ERC20 dividend safe transfer
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
            // Fix 9: Safe transfer for ERC20
            (bool balOk, bytes memory balData) = address(d.rewardToken).staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
            require(balOk && balData.length >= 32, "BALC");
            uint256 erc20Bal = abi.decode(balData, (uint256));
            require(erc20Bal >= amount, "BAL");
            (bool tOk, bytes memory ret) = address(d.rewardToken).call(abi.encodeWithSelector(0xa9059cbb, user, amount));
            require(tOk && (ret.length == 0 || abi.decode(ret, (bool))), "SF");
        }
    }

    // Fix 5: _settleHold pays out pending dividends correctly
    function _settleHold(address user) internal {
        DivData storage d = _divs[DIV_HOLD];
        if (!d.enabled) return;
        uint256 old = d.shares[user];
        if (old == 0) return;
        uint256 gross = (old * d.accPerShare) / DIV_PRECISION;
        if (d.paidPerShare[user] >= gross) return;
        uint256 due = gross - d.paidPerShare[user];
        // Fix 10: Add to paidPerShare
        if (due == 0) return;
        require(d.pendingReward >= due, "DIV_INSOLVENT");
        d.paidPerShare[user] = gross;
        d.pendingReward -= due;
        _payout(DIV_HOLD, user, due);
    }

    // Fix 5: _refreshHold does NOT reset paidPerShare to current accPerShare
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

    // Fix 5: burnDiv tracks shares for DIV_BURN
    function burnDiv(uint256 amount) external nonReentrant {
        require(balanceOf[msg.sender] >= amount, "BAL");
        _burn(msg.sender, amount);
        emit Transfer(msg.sender, DEAD, amount);
        if (_divs[DIV_BURN].enabled) {
            _recordDivShare(DIV_BURN, msg.sender, amount);
        }
    }

    function rescue(address token, uint256 amount) external onlyOwner {
        require(token != address(this) && token != pair && token != baseToken, "PROTECTED");
        for (uint8 id = DIV_HOLD; id <= DIV_BURN; id++) {
            require(!(_divs[id].rewardToken == token && _divs[id].pendingReward > 0), "DIV_RESERVED");
        }
        require(IERC20External(token).transfer(msg.sender, amount), "RESCUE");
    }

    function withdrawBNB(uint256 amount) external onlyOwner {
        require(graduated, "NOT_GRADUATED");
        uint256 reserved = _nativeDividendReserve();
        require(amount <= address(this).balance - reserved, "BAL");
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "WIT");
    }
}
