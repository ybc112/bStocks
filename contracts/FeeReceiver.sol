// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFeeToken {
    function router() external view returns (address);
    function pancakeFactory() external view returns (address);
    function baseToken() external view returns (address);
    function WBNB() external view returns (address);
    function pair() external view returns (address);
    function marketingWallet() external view returns (address);
    function balanceOf(address account) external view returns (uint256);
    function tokensForPlatform() external view returns (uint256);
    function tokensForMarketing() external view returns (uint256);
    function tokensForBuyBack() external view returns (uint256);
    function tokensForLiquidityBackflow() external view returns (uint256);
    function tokensForDividends() external view returns (uint256);
    function minAmountOut(address asset) external view returns (uint256);
    function activeDividend() external view returns (uint8 id, address reward);
    function pullFeeTokens(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function forwardPlatformFee(address contributor) external payable;
}

interface IFeeRouter {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}

interface IFeeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/**
 * Per-project fee execution engine.
 *
 * The project token owns this contract.  It receives the tax tokens, performs
 * all AMM operations with an independent `to` address (which avoids the V2
 * Pair INVALID_TO rule), and sends the resulting assets back to the token for
 * accounting/payout.  Each bucket is attempted in its own child call: a thin
 * or missing route leaves only that bucket queued while healthy buckets still
 * pay out in the same transaction.
 */
contract FeeReceiver {
    address public owner; // StocksToken
    address public token;
    bool public initialized;
    bool private _processing;

    // The dividend ledger lives in this per-project receiver instead of in
    // StocksToken.  This keeps the token deployable under the EVM 24KB limit
    // while retaining the three user-visible modes (HOLD/LIQ/BURN).
    uint8 public constant DIV_HOLD = 1;
    uint8 public constant DIV_LIQ = 2;
    uint8 public constant DIV_BURN = 3;
    uint256 public constant DIV_PRECISION = 1e18;

    struct DivData {
        bool enabled;
        address rewardToken;       // address(0) means the project token
        uint256 minEligible;
        uint256 accPerShare;
        uint256 totalShares;
        uint256 pendingReward;    // actual reward balance reserved for claims
        uint256 undistributed;     // pending reward accrued while no holder existed
        uint256 cursor;
        address[] holders;
        mapping(address => bool) inHolders;
        mapping(address => uint256) holderIndex;
        mapping(address => uint256) shares;
        // DIV_BURN keeps the cumulative amount separately so a holder that is
        // below the configured threshold can continue accumulating until it
        // becomes eligible.  `shares` remains the eligible denominator.
        mapping(address => uint256) burned;
        mapping(address => uint256) paidPerShare;
        mapping(address => uint256) claimable;
    }

    mapping(uint8 => DivData) internal _divs;
    mapping(address => bool) public dividendExcluded;
    uint8 public activeDividendId;

    // Leftovers from an imbalanced addLiquidity call stay earmarked here and
    // are consumed by a later liquidity flush; they are never silently lost.
    uint256 public liquidityTokenReserve;
    uint256 public liquidityBaseReserve;

    // Automatic fee settlement is deliberately non-blocking so a thin or
    // temporarily unavailable route cannot break a user's swap. Persist a
    // failure per bucket instead of silently swallowing the error; keepers/UIs
    // can inspect these values and retry after liquidity returns.
    mapping(uint8 => uint256) public failedAmount;
    mapping(uint8 => bytes32) public failedReason;
    // Automatic settlement intentionally advances one bucket at a time.  A
    // single user sell must not fan out into five independent AMM sells (the
    // explorer/DEX then shows a misleading wall of "follow-up sells").  The
    // cursor makes the work fair and keeps every bucket retryable.
    uint8 public processCursor;

    address private constant DEAD = address(0x000000000000000000000000000000000000dEaD);
    uint256 private constant MAX_UINT = type(uint256).max;

    error NotOwner();
    error Reentrant();
    error InvalidRoute();
    error EmptyOutput();
    error TransferFailed();
    error Guard();

    event BucketProcessed(uint8 indexed kind, uint256 tokenAmount, address asset, uint256 outputAmount);
    event BucketProcessingFailed(uint8 indexed kind, uint256 tokenAmount, bytes32 reasonHash);
    event DividendConfigured(uint8 indexed id, address indexed rewardToken, uint256 minEligible, bool enabled);
    event DividendClaimed(uint8 indexed id, address indexed account, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_processing) revert Reentrant();
        _processing = true;
        _;
        _processing = false;
    }

    // The implementation is deployed once and used through EIP-1167 clones.
    // Its own storage is locked; each clone initializes its independent owner.
    constructor() { initialized = true; }

    function initialize(address _owner) external {
        if (initialized || _owner == address(0)) revert InvalidRoute();
        owner = _owner;
        token = _owner;
        initialized = true;
        dividendExcluded[_owner] = true;
        dividendExcluded[DEAD] = true;
        dividendExcluded[IFeeToken(_owner).router()] = true;
        address p = IFeeToken(_owner).pair();
        if (p != address(0)) dividendExcluded[p] = true;
    }

    receive() external payable {}

    function process(address contributor)
        external
        onlyOwner
        nonReentrant
        returns (uint256 p, uint256 m, uint256 b, uint256 l, uint256 d)
    {
        return _process(contributor);
    }

    function _process(address contributor)
        internal
        returns (uint256 platformTokens, uint256 marketingTokens, uint256 buybackTokens, uint256 liquidityTokens, uint256 dividendTokens)
    {
        IFeeToken t = IFeeToken(token);
        uint256 p = t.tokensForPlatform();
        uint256 m = t.tokensForMarketing();
        uint256 b = t.tokensForBuyBack();
        uint256 l = t.tokensForLiquidityBackflow();
        uint256 d = t.tokensForDividends();
        uint256 sourceTotal = p + m + b + l + d;
        if (sourceTotal == 0) {
            // A previous imbalanced addLiquidity may have left both sides in
            // reserve after its bucket was consumed.  Give a keeper a way to
            // flush those reserves even when no new liquidity tax arrived.
            // A token-only reserve can still be converted into the base side;
            // a base-only reserve is harmlessly left queued until the next
            // token bucket arrives.  Do not require both sides up front or a
            // failed/imbalanced flush can strand the reserve forever.
            if (liquidityTokenReserve > 0 || liquidityBaseReserve > 0) {
                try this._runLiquidity(0) { _clearFailure(3); } catch (bytes memory reason) {
                    _markFailure(3, 0, reason);
                }
            }
            if (activeDividendId != 0) {
                try this._runDividendPayout(activeDividendId, 100) {} catch (bytes memory reason) {
                    _markFailure(5, _divs[activeDividendId].pendingReward, reason);
                }
            }
            return (0, 0, 0, 0, 0);
        }

        // Limit one flush to a small fraction of the token side of the pool.
        // A zero balance is used by lightweight test routers and means "no
        // observable reserve", so it does not artificially disable flushing.
        uint256 cap = sourceTotal;
        address projectPair = t.pair();
        if (projectPair != address(0)) {
            uint256 poolBalance = t.balanceOf(projectPair);
            if (poolBalance > 0) {
                cap = poolBalance / 25;
                if (cap == 0) cap = 1;
            }
        }
        uint256 selected = cap < sourceTotal ? cap : sourceTotal;
        if (selected == 0) return (0, 0, 0, 0, 0);

        uint256[5] memory avail;
        avail[0] = p; avail[1] = m; avail[2] = b; avail[3] = l; avail[4] = d;

        // Pick the next non-empty bucket, starting at the persisted cursor.
        // Only this bucket is attempted in the automatic call.  A failed
        // route advances the cursor too, so one broken mechanism cannot starve
        // all of the healthy mechanisms behind it.
        uint8 chosen = 5;
        uint256 start = processCursor % 5;
        for (uint256 off = 0; off < 5; off++) {
            uint8 candidate = uint8((start + off) % 5);
            if (avail[candidate] > 0) {
                chosen = candidate;
                break;
            }
        }
        if (chosen < 5) {
            uint256 amount = avail[chosen] < selected ? avail[chosen] : selected;
            processCursor = uint8((uint256(chosen) + 1) % 5);
            if (chosen == 0) {
                (bool ok, bytes memory data) = address(this).call(abi.encodeWithSelector(this._runPlatform.selector, amount, contributor));
                if (ok && data.length >= 32) {
                    platformTokens = amount;
                    _clearFailure(0);
                    emit BucketProcessed(0, amount, address(0), abi.decode(data, (uint256)));
                } else {
                    _markFailure(0, amount, data);
                }
            } else if (chosen == 1) {
                (bool ok, bytes memory data) = address(this).call(abi.encodeWithSelector(this._runMarketing.selector, amount));
                if (ok && data.length >= 32) {
                    marketingTokens = amount;
                    _clearFailure(1);
                    emit BucketProcessed(1, amount, address(0), abi.decode(data, (uint256)));
                } else {
                    _markFailure(1, amount, data);
                }
            } else if (chosen == 2) {
                (bool ok, bytes memory data) = address(this).call(abi.encodeWithSelector(this._runBuyback.selector, amount));
                if (ok && data.length >= 32) {
                    buybackTokens = amount;
                    _clearFailure(2);
                    emit BucketProcessed(2, amount, address(0), abi.decode(data, (uint256)));
                } else {
                    _markFailure(2, amount, data);
                }
            } else if (chosen == 3) {
                (bool ok, bytes memory data) = address(this).call(abi.encodeWithSelector(this._runLiquidity.selector, amount));
                if (ok && data.length >= 32) {
                    liquidityTokens = amount;
                    _clearFailure(3);
                    emit BucketProcessed(3, amount, address(0), abi.decode(data, (uint256)));
                } else {
                    _markFailure(3, amount, data);
                }
            } else {
                if (activeDividendId != 0) {
                    (bool ok, bytes memory data) = address(this).call(abi.encodeWithSelector(this._runDividend.selector, amount, _divs[activeDividendId].rewardToken));
                    if (ok && data.length >= 32) {
                        dividendTokens = amount;
                        _clearFailure(4);
                        emit BucketProcessed(4, amount, _divs[activeDividendId].rewardToken, abi.decode(data, (uint256)));
                    } else {
                        _markFailure(4, amount, data);
                    }
                } else {
                    _markFailure(4, amount, "");
                }
            }
        }
        // Automatic payouts are best-effort.  A recipient that rejects a
        // native-token transfer must not roll back the already successful
        // marketing/buyback/liquidity buckets.
        if (activeDividendId != 0) {
            try this._runDividendPayout(activeDividendId, 100) {} catch (bytes memory reason) {
                _markFailure(5, _divs[activeDividendId].pendingReward, reason);
            }
        }
    }

    function _markFailure(uint8 kind, uint256 amount, bytes memory reason) internal {
        uint256 reported = amount;
        if (reported == 0 && kind == 3) reported = liquidityTokenReserve + liquidityBaseReserve;
        failedAmount[kind] = reported;
        failedReason[kind] = keccak256(reason);
        emit BucketProcessingFailed(kind, reported, failedReason[kind]);
    }

    function _clearFailure(uint8 kind) internal {
        failedAmount[kind] = 0;
        failedReason[kind] = bytes32(0);
    }

    function _runDividendPayout(uint8 id, uint256 maxIter) external {
        if (msg.sender != address(this)) revert NotOwner();
        // A successful pass clears an old payout failure.  If an individual
        // recipient still rejects payment, _processDividends marks kind=5
        // again below; a reverting pass is caught by the caller and recorded.
        _clearFailure(5);
        _processDividends(id, maxIter);
    }

    function _runPlatform(uint256 amount, address contributor) external returns (uint256 out) {
        if (msg.sender != address(this)) revert NotOwner();
        IFeeToken(token).pullFeeTokens(amount);
        out = _toBNB(_tokenToBase(amount));
        // Forward from the isolated child call.  If the Factory callback fails,
        // this child (including pull/swap) rolls back while the other buckets
        // continue in the parent process call.
        IFeeToken(token).forwardPlatformFee{value: out}(contributor);
    }

    function _runMarketing(uint256 amount) external returns (uint256 out) {
        if (msg.sender != address(this)) revert NotOwner();
        IFeeToken t = IFeeToken(token);
        t.pullFeeTokens(amount);
        uint256 baseAmount = _tokenToBase(amount);
        address base = t.baseToken();
        address wallet = t.marketingWallet();
        if (wallet == address(0)) revert TransferFailed();
        if (base == t.WBNB()) {
            out = baseAmount;
            if (!_sendNative(wallet, out)) revert TransferFailed();
        } else {
            (bool converted, uint256 bnbAmount) = _tryToBNB(baseAmount);
            if (converted) {
                out = bnbAmount;
                if (!_sendNative(wallet, out)) revert TransferFailed();
            } else {
                // A mirror asset may have no usable WBNB route.  Do not lose
                // the tax: deliver the actual base asset to marketing instead.
                out = baseAmount;
                _transferToken(base, wallet, out);
            }
        }
    }

    function _runBuyback(uint256 amount) external returns (uint256 out) {
        if (msg.sender != address(this)) revert NotOwner();
        IFeeToken t = IFeeToken(token);
        t.pullFeeTokens(amount);
        uint256 baseAmount = _tokenToBase(amount);
        if (t.baseToken() == t.WBNB()) {
            out = _buybackNative(baseAmount);
        } else {
            out = _buybackBase(baseAmount);
        }
    }

    function _runLiquidity(uint256 amount) external returns (uint256 out) {
        if (msg.sender != address(this)) revert NotOwner();
        if (amount > 0) IFeeToken(token).pullFeeTokens(amount);
        out = _liquidity(amount);
    }

    function _runDividend(uint256 amount, address reward) external returns (uint256 out) {
        if (msg.sender != address(this)) revert NotOwner();
        if (activeDividendId == 0 || !_divs[activeDividendId].enabled || _divs[activeDividendId].rewardToken != reward) revert Guard();
        IFeeToken(token).pullFeeTokens(amount);
        out = _dividend(amount, reward);
        _creditDividend(activeDividendId, out);
    }

    function _tokenToBase(uint256 amount) internal returns (uint256 out) {
        if (amount == 0) return 0;
        IFeeToken t = IFeeToken(token);
        IFeeRouter r = IFeeRouter(t.router());
        _approve(token, address(r), MAX_UINT);
        address base = t.baseToken();
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = base;
        if (base == t.WBNB()) {
            uint256 beforeBal = address(this).balance;
            r.swapExactTokensForETHSupportingFeeOnTransferTokens(
                amount, t.minAmountOut(base), path, address(this), block.timestamp + 300
            );
            out = address(this).balance - beforeBal;
        } else {
            if (IFeeFactory(t.pancakeFactory()).getPair(token, base) == address(0)) revert InvalidRoute();
            uint256 beforeBal = IFeeToken(base).balanceOf(address(this));
            r.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amount, t.minAmountOut(base), path, address(this), block.timestamp + 300
            );
            out = IFeeToken(base).balanceOf(address(this)) - beforeBal;
        }
        if (out == 0) revert EmptyOutput();
    }

    function _toBNB(uint256 baseAmount) internal returns (uint256 out) {
        if (baseAmount == 0) revert EmptyOutput();
        IFeeToken t = IFeeToken(token);
        address base = t.baseToken();
        if (base == t.WBNB()) return baseAmount;
        IFeeRouter r = IFeeRouter(t.router());
        if (IFeeFactory(t.pancakeFactory()).getPair(base, t.WBNB()) == address(0)) revert InvalidRoute();
        _approve(base, address(r), MAX_UINT);
        address[] memory path = new address[](2);
        path[0] = base;
        path[1] = t.WBNB();
        uint256 beforeBal = address(this).balance;
        r.swapExactTokensForETHSupportingFeeOnTransferTokens(
            baseAmount, t.minAmountOut(t.WBNB()), path, address(this), block.timestamp + 300
        );
        out = address(this).balance - beforeBal;
        if (out == 0) revert EmptyOutput();
    }

    // Best-effort mirror conversion used only for marketing.  A missing or
    // failing WBNB route falls back to paying the configured base asset.
    function _tryToBNB(uint256 baseAmount) internal returns (bool ok, uint256 out) {
        if (baseAmount == 0) return (false, 0);
        IFeeToken t = IFeeToken(token);
        address base = t.baseToken();
        if (base == t.WBNB()) return (true, baseAmount);
        IFeeFactory f = IFeeFactory(t.pancakeFactory());
        if (f.getPair(base, t.WBNB()) == address(0)) return (false, 0);
        // Isolate the whole conversion in a child call.  A router can return
        // successfully while producing zero output for a fee-on-transfer or
        // stale route.  Reverting the child restores the base balance so the
        // caller can safely use the mirror-asset fallback.
        try this._convertBaseToBNB(baseAmount) returns (uint256 v) {
            return (v > 0, v);
        } catch {
            return (false, 0);
        }
    }

    function _convertBaseToBNB(uint256 baseAmount) external returns (uint256 out) {
        if (msg.sender != address(this)) revert NotOwner();
        if (baseAmount == 0) revert EmptyOutput();
        IFeeToken t = IFeeToken(token);
        address base = t.baseToken();
        IFeeRouter r = IFeeRouter(t.router());
        _approve(base, address(r), MAX_UINT);
        address[] memory path = new address[](2);
        path[0] = base; path[1] = t.WBNB();
        uint256 beforeBal = address(this).balance;
        r.swapExactTokensForETHSupportingFeeOnTransferTokens(
            baseAmount, t.minAmountOut(t.WBNB()), path, address(this), block.timestamp + 300
        );
        out = address(this).balance - beforeBal;
        if (out == 0) revert EmptyOutput();
    }

    function _buybackNative(uint256 bnbAmount) internal returns (uint256 out) {
        if (bnbAmount == 0) revert EmptyOutput();
        IFeeToken t = IFeeToken(token);
        IFeeRouter r = IFeeRouter(t.router());
        address[] memory path = _nativeToTokenPath(token);
        uint256 beforeBal = t.balanceOf(DEAD);
        r.swapExactETHForTokensSupportingFeeOnTransferTokens{value: bnbAmount}(
            t.minAmountOut(token), path, DEAD, block.timestamp + 300
        );
        if (t.balanceOf(DEAD) <= beforeBal) revert EmptyOutput();
        out = t.balanceOf(DEAD) - beforeBal;
    }

    function _buybackBase(uint256 baseAmount) internal returns (uint256 out) {
        if (baseAmount == 0) revert EmptyOutput();
        IFeeToken t = IFeeToken(token);
        IFeeRouter r = IFeeRouter(t.router());
        address base = t.baseToken();
        if (IFeeFactory(t.pancakeFactory()).getPair(base, token) == address(0)) revert InvalidRoute();
        _approve(base, address(r), MAX_UINT);
        address[] memory path = new address[](2);
        path[0] = base;
        path[1] = token;
        uint256 beforeBal = t.balanceOf(DEAD);
        r.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            baseAmount, t.minAmountOut(token), path, DEAD, block.timestamp + 300
        );
        out = t.balanceOf(DEAD) - beforeBal;
        if (out == 0) revert EmptyOutput();
    }

    function _liquidity(uint256 amount) internal returns (uint256 liquidity) {
        IFeeToken t = IFeeToken(token);
        IFeeRouter r = IFeeRouter(t.router());
        liquidityTokenReserve += amount;

        // A V2 addLiquidity call may consume only one side of an imbalanced
        // bucket.  Rebalance in *both* directions, with a hard pass bound: the
        // previous implementation handled token-only dust but could never
        // recover a base-only remainder, permanently stranding that balance.
        for (uint256 pass = 0; pass < 3; pass++) {
            if (liquidityBaseReserve == 0 && liquidityTokenReserve > 0) {
                uint256 swapAmount = liquidityTokenReserve / 2;
                if (swapAmount == 0) swapAmount = liquidityTokenReserve;
                liquidityTokenReserve -= swapAmount;
                liquidityBaseReserve += _tokenToBase(swapAmount);
            } else if (liquidityTokenReserve == 0 && liquidityBaseReserve > 0) {
                uint256 swapAmount = liquidityBaseReserve / 2;
                if (swapAmount == 0) swapAmount = liquidityBaseReserve;
                liquidityBaseReserve -= swapAmount;
                liquidityTokenReserve += _baseToToken(swapAmount);
            }
            if (liquidityTokenReserve == 0 || liquidityBaseReserve == 0) break;

            address base = t.baseToken();
            _approve(token, address(r), MAX_UINT);
            // Measure what the router actually pulled instead of trusting its
            // return tuple.  Fee-on-transfer/rounding tokens and routers that
            // refund an unused side must leave the reserve ledger exact.
            uint256 tokenBefore = t.balanceOf(address(this));
            uint256 baseBefore = base == t.WBNB()
                ? address(this).balance
                : IFeeToken(base).balanceOf(address(this));
            uint256 minted;
            if (base == t.WBNB()) {
                (,, minted) = r.addLiquidityETH{value: liquidityBaseReserve}(
                    token, liquidityTokenReserve, 0, 0, DEAD, block.timestamp + 300
                );
            } else {
                _approve(base, address(r), MAX_UINT);
                (,, minted) = r.addLiquidity(
                    token, base, liquidityTokenReserve, liquidityBaseReserve, 0, 0, DEAD, block.timestamp + 300
                );
            }
            uint256 tokenAfter = t.balanceOf(address(this));
            uint256 baseAfter = base == t.WBNB()
                ? address(this).balance
                : IFeeToken(base).balanceOf(address(this));
            uint256 usedToken = tokenBefore > tokenAfter ? tokenBefore - tokenAfter : 0;
            uint256 usedBase = baseBefore > baseAfter ? baseBefore - baseAfter : 0;
            if (minted == 0 || usedToken == 0 || usedBase == 0) revert EmptyOutput();
            if (usedToken > liquidityTokenReserve || usedBase > liquidityBaseReserve) revert Guard();
            liquidityTokenReserve -= usedToken;
            liquidityBaseReserve -= usedBase;
        }

        // The LP units themselves are intentionally sent to DEAD.  Returning
        // the original bucket amount (rather than LP units) lets the parent
        // decrement the correct token-tax ledger even when a remainder stays
        // earmarked for the next bounded pass.
        liquidity = amount;
    }

    // Convert a base reserve back into project tokens when an imbalanced
    // addLiquidity consumed the entire token side.  The output is kept at this
    // receiver, so the project token's pair never receives an INVALID_TO
    // destination and the reserve ledger remains local and auditable.
    function _baseToToken(uint256 amount) internal returns (uint256 out) {
        if (amount == 0) revert EmptyOutput();
        IFeeToken t = IFeeToken(token);
        IFeeRouter r = IFeeRouter(t.router());
        address base = t.baseToken();
        address[] memory path = new address[](2);
        path[0] = base;
        path[1] = token;
        uint256 beforeBal = t.balanceOf(address(this));
        if (base == t.WBNB()) {
            r.swapExactETHForTokensSupportingFeeOnTransferTokens{value: amount}(
                t.minAmountOut(token), path, address(this), block.timestamp + 300
            );
        } else {
            if (IFeeFactory(t.pancakeFactory()).getPair(base, token) == address(0)) revert InvalidRoute();
            _approve(base, address(r), MAX_UINT);
            r.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                amount, t.minAmountOut(token), path, address(this), block.timestamp + 300
            );
        }
        out = t.balanceOf(address(this)) - beforeBal;
        if (out == 0) revert EmptyOutput();
    }

    function _dividend(uint256 amount, address reward) internal returns (uint256 out) {
        IFeeToken t = IFeeToken(token);
        // Zero address is the UI's representation of the project token.
        if (reward == address(0) || reward == token) {
            // _runDividend already pulled the tax tokens into this receiver.
            // Keep them here: the dividend ledger and the physical balance
            // must share the same owner.  Sending them back to StocksToken
            // makes later claims under-funded (and can trigger a fresh tax).
            return amount;
        }
        uint256 baseAmount = _tokenToBase(amount);
        address base = t.baseToken();
        if (reward == base && base != t.WBNB()) {
            return baseAmount;
        }
        if (reward == t.WBNB()) {
            // For a mirror pool baseAmount is an ERC20 balance, not native
            // BNB.  Convert it through the base/WBNB pair before crediting a
            // native reward ledger.
            return base == t.WBNB() ? baseAmount : _toBNB(baseAmount);
        }

        // Prefer a direct base/reward pair for mirror pools.  This keeps the
        // reward in the selected base economy and works even when the mirror
        // token has little or no WBNB liquidity.
        IFeeRouter r = IFeeRouter(t.router());
        if (base != t.WBNB() && IFeeFactory(t.pancakeFactory()).getPair(base, reward) != address(0)) {
            try this._swapBaseToReward(baseAmount, reward) returns (uint256 directOut) {
                if (directOut > 0) return directOut;
            } catch {}
            // A direct pair can exist but still reject the trade because of a
            // stale minOut or a fee-on-transfer token.  The child call rolls
            // back the spent base before continuing to the BNB bridge.
        }

        uint256 bnbAmount = base == t.WBNB() ? baseAmount : _toBNB(baseAmount);
        if (reward == t.WBNB()) {
            return bnbAmount;
        }

        address[] memory path = _nativeToTokenPath(reward);
        uint256 beforeBal = IFeeToken(reward).balanceOf(address(this));
        r.swapExactETHForTokensSupportingFeeOnTransferTokens{value: bnbAmount}(
            t.minAmountOut(reward), path, address(this), block.timestamp + 300
        );
        out = IFeeToken(reward).balanceOf(address(this)) - beforeBal;
        if (out == 0) revert EmptyOutput();
        // Keep the reward on this receiver.  The dividend ledger and the
        // physical balance must live at the same address; sending it to the
        // StocksToken here makes every subsequent claim under-funded.
    }

    function _swapBaseToReward(uint256 baseAmount, address reward) external returns (uint256 out) {
        if (msg.sender != address(this) || baseAmount == 0 || reward == address(0)) revert Guard();
        IFeeToken t = IFeeToken(token);
        IFeeRouter r = IFeeRouter(t.router());
        _approve(t.baseToken(), address(r), MAX_UINT);
        address[] memory path = new address[](2);
        path[0] = t.baseToken(); path[1] = reward;
        uint256 beforeBal = IFeeToken(reward).balanceOf(address(this));
        r.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            baseAmount, t.minAmountOut(reward), path, address(this), block.timestamp + 300
        );
        out = IFeeToken(reward).balanceOf(address(this)) - beforeBal;
        if (out == 0) revert EmptyOutput();
    }

    // Return the shortest usable route from WBNB to an output token.  A
    // project whose graduation pool is an ERC20 (for example USDT or a
    // stock-mirror token) normally has no direct WBNB/project pair.  The old
    // implementation nevertheless used [WBNB, project], which made the
    // buyback leg revert and, because fee processing was atomic, also blocked
    // marketing, liquidity and dividends.  Prefer the direct pair when it
    // exists; otherwise use the guaranteed graduation bridge [WBNB, base,
    // output].
    function _nativeToTokenPath(address output) internal view returns (address[] memory path) {
        IFeeToken t = IFeeToken(token);
        address native = t.WBNB();
        if (output == native) revert InvalidRoute();
        IFeeFactory f = IFeeFactory(t.pancakeFactory());
        if (f.getPair(native, output) != address(0)) {
            path = new address[](2);
            path[0] = native;
            path[1] = output;
            return path;
        }
        address base = t.baseToken();
        if (base == native || f.getPair(native, base) == address(0) || f.getPair(base, output) == address(0)) revert InvalidRoute();
        path = new address[](3);
        path[0] = native;
        path[1] = base;
        path[2] = output;
    }

    // ========== Per-project dividend tracker ==========

    function activeDividend() external view returns (uint8 id, address reward) {
        id = activeDividendId;
        if (id != 0) reward = _divs[id].rewardToken;
    }

    function dividendInfo(uint8 id)
        external
        view
        returns (bool enabled, address rewardToken, uint256 minEligible, uint256 accPerShare, uint256 totalShares, uint256 pendingReward)
    {
        DivData storage d = _divs[id];
        if (id != activeDividendId) return (false, d.rewardToken, d.minEligible, d.accPerShare, d.totalShares, d.pendingReward);
        return (d.enabled, d.rewardToken, d.minEligible, d.accPerShare, d.totalShares, d.pendingReward);
    }

    function dividendShares(uint8 id, address account) external view returns (uint256) {
        return _divs[id].shares[account];
    }

    function pendingDividend(uint8 id, address account) public view returns (uint256) {
        DivData storage d = _divs[id];
        if (!d.enabled) return d.claimable[account];
        uint256 due = d.claimable[account];
        uint256 s = d.shares[account];
        if (s > 0) {
            uint256 gross = (s * d.accPerShare) / DIV_PRECISION;
            if (gross > d.paidPerShare[account]) due += gross - d.paidPerShare[account];
        }
        return due;
    }

    function configureDividend(uint8 id, address rewardToken, uint256 minEligible, bool enabled) external onlyOwner {
        if (id < DIV_HOLD || id > DIV_BURN) revert Guard();
        DivData storage d = _divs[id];
        if (!enabled) {
            if (activeDividendId == id) {
                if (d.pendingReward != 0 || d.totalShares != 0 || d.holders.length != 0) revert Guard();
                activeDividendId = 0;
            }
            d.enabled = false;
            emit DividendConfigured(id, d.rewardToken, d.minEligible, false);
            return;
        }
        if (activeDividendId != 0 && activeDividendId != id) {
            DivData storage old = _divs[activeDividendId];
            if (old.pendingReward != 0 || old.totalShares != 0 || old.holders.length != 0) revert Guard();
            old.enabled = false;
        }
        if (d.rewardToken != rewardToken && (d.pendingReward != 0 || d.totalShares != 0 || d.holders.length != 0)) revert Guard();
        // A configured reward must either be the project token (zero address
        // is the UI shorthand), WBNB, or a deployed ERC20.  Rejecting EOAs
        // here turns a later silent tax-bucket failure into an actionable
        // configuration error.
        if (rewardToken != address(0) && rewardToken != token && rewardToken != IFeeToken(token).WBNB() && rewardToken.code.length == 0) revert Guard();
        d.rewardToken = rewardToken;
        d.minEligible = minEligible;
        d.enabled = true;
        activeDividendId = id;
        emit DividendConfigured(id, rewardToken, minEligible, true);
    }

    function syncDividendShare(uint8 id, address account, uint256 amount) external onlyOwner {
        if (id != DIV_HOLD && id != DIV_LIQ) revert Guard();
        DivData storage d = _divs[id];
        if (!d.enabled || account == address(0)) return;
        uint256 next = (!dividendExcluded[account] && amount >= d.minEligible) ? amount : 0;
        _setDividendShare(d, id, account, next);
    }

    function recordBurn(address account, uint256 amount) external onlyOwner {
        if (amount == 0 || activeDividendId != DIV_BURN) return;
        DivData storage d = _divs[DIV_BURN];
        if (!d.enabled || dividendExcluded[account]) return;
        // Settle integer dust against the holders that existed before this
        // burn.  Otherwise a newly added burn share could capture rewards
        // accrued before it existed.
        _flushUndistributed(d);
        _accrueAccount(d, account);
        uint256 old = d.shares[account];
        uint256 burnedTotal = d.burned[account] + amount;
        d.burned[account] = burnedTotal;
        uint256 next = burnedTotal >= d.minEligible ? burnedTotal : 0;
        if (next == 0) return;
        uint256 accBefore = d.accPerShare;
        bool wasEmpty = d.totalShares == 0;
        if (old > 0) d.totalShares -= old;
        d.shares[account] = next;
        d.totalShares += next;
        if (wasEmpty) {
            // A first burner is entitled to rewards that arrived while there
            // was no burner, but not to rewards assigned to a later index.
            _assignUndistributed(d);
            d.paidPerShare[account] = (d.shares[account] * accBefore) / DIV_PRECISION;
        } else {
            // The old position was accrued above; the newly added amount
            // starts at the current index and receives no historical reward.
            d.paidPerShare[account] = (d.shares[account] * accBefore) / DIV_PRECISION;
        }
        if (old == 0) _divHolderPush(d, account);
    }

    function setDividendExcluded(address account, bool excluded, uint256 holdBalance, uint256 lpBalance) external onlyOwner {
        if (account == address(0)) revert Guard();
        dividendExcluded[account] = excluded;
        if (activeDividendId == DIV_HOLD) {
            DivData storage h = _divs[DIV_HOLD];
            if (h.enabled) _setDividendShare(h, DIV_HOLD, account, excluded || holdBalance < h.minEligible ? 0 : holdBalance);
        } else if (activeDividendId == DIV_LIQ) {
            DivData storage l = _divs[DIV_LIQ];
            if (l.enabled) _setDividendShare(l, DIV_LIQ, account, excluded || lpBalance < l.minEligible ? 0 : lpBalance);
        } else if (activeDividendId == DIV_BURN && excluded) {
            DivData storage b = _divs[DIV_BURN];
            if (b.enabled) _setDividendShare(b, DIV_BURN, account, 0);
        } else if (activeDividendId == DIV_BURN && !excluded) {
            DivData storage b2 = _divs[DIV_BURN];
            if (b2.enabled) {
                uint256 raw = b2.burned[account];
                _setDividendShare(b2, DIV_BURN, account, raw >= b2.minEligible ? raw : 0);
            }
        }
    }

    function creditDividend(uint8 id, uint256 amount) external onlyOwner {
        if (id == 0 || id != activeDividendId || !_divs[id].enabled || amount == 0) revert Guard();
        _creditDividend(id, amount);
    }

    function depositNative(uint8 id) external payable onlyOwner {
        if (msg.value == 0 || id != activeDividendId || !_divs[id].enabled || _divs[id].rewardToken != IFeeToken(token).WBNB()) revert Guard();
        _creditDividend(id, msg.value);
        _processDividends(id, 100);
    }

    function claimDividend(uint8 id, address account) external onlyOwner {
        if (id != activeDividendId || !_divs[id].enabled || account == address(0)) revert Guard();
        _claimDividend(id, account);
    }

    function processDividend(uint8 id, uint256 maxIter) external onlyOwner {
        if (id != activeDividendId || !_divs[id].enabled) revert Guard();
        _processDividends(id, maxIter);
    }

    function _assignUndistributed(DivData storage d) internal {
        if (d.undistributed == 0 || d.totalShares == 0) return;
        uint256 delta = (d.undistributed * DIV_PRECISION) / d.totalShares;
        if (delta == 0) return;
        d.accPerShare += delta;
        uint256 assigned = (delta * d.totalShares) / DIV_PRECISION;
        if (assigned >= d.undistributed) d.undistributed = 0;
        else d.undistributed -= assigned;
    }

    function _flushUndistributed(DivData storage d) internal {
        _assignUndistributed(d);
    }

    function _accrueAccount(DivData storage d, address account) internal {
        uint256 s = d.shares[account];
        if (s == 0) return;
        uint256 gross = (s * d.accPerShare) / DIV_PRECISION;
        uint256 paid = d.paidPerShare[account];
        if (gross > paid) {
            d.claimable[account] += gross - paid;
            d.paidPerShare[account] = gross;
        }
    }

    function _setDividendShare(DivData storage d, uint8, address account, uint256 next) internal {
        uint256 old = d.shares[account];
        if (old == next) {
            _flushUndistributed(d);
            _accrueAccount(d, account);
            return;
        }
        // Assign all currently representable dust to the holders that exist
        // before changing the denominator.  This prevents a new holder (or a
        // reduced position) from receiving somebody else's historical share.
        _flushUndistributed(d);
        _accrueAccount(d, account);
        uint256 accBefore = d.accPerShare;
        if (old > 0) d.totalShares -= old;
        d.shares[account] = next;
        if (next > 0) {
            bool wasEmpty = d.totalShares == 0;
            d.totalShares += next;
            if (wasEmpty) _assignUndistributed(d);
            // For a first holder, use the pre-assignment index so it receives
            // the no-holder reserve.  For an existing denominator, the new
            // amount starts at the current index.
            d.paidPerShare[account] = (next * accBefore) / DIV_PRECISION;
            _divHolderPush(d, account);
        } else {
            d.paidPerShare[account] = 0;
            _divHolderRemove(d, account);
        }
    }

    function _creditDividend(uint8 id, uint256 amount) internal {
        DivData storage d = _divs[id];
        if (amount == 0) return;
        d.pendingReward += amount;
        if (d.totalShares == 0) {
            d.undistributed += amount;
            return;
        }
        // Flush old dust first, then index only the newly credited amount.
        // This makes denominator changes deterministic and keeps the pending
        // balance equal to claimable + undistributed + unpaid index rewards.
        _flushUndistributed(d);
        uint256 delta = (amount * DIV_PRECISION) / d.totalShares;
        if (delta == 0) {
            d.undistributed += amount;
            return;
        }
        d.accPerShare += delta;
        uint256 assigned = (delta * d.totalShares) / DIV_PRECISION;
        if (assigned < amount) d.undistributed += amount - assigned;
    }

    function _divHolderPush(DivData storage d, address account) internal {
        if (d.inHolders[account]) return;
        d.inHolders[account] = true;
        d.holderIndex[account] = d.holders.length;
        d.holders.push(account);
    }

    function _divHolderRemove(DivData storage d, address account) internal {
        if (!d.inHolders[account]) return;
        uint256 idx = d.holderIndex[account];
        uint256 last = d.holders.length - 1;
        if (idx != last) {
            address moved = d.holders[last];
            d.holders[idx] = moved;
            d.holderIndex[moved] = idx;
            if (idx < d.cursor) d.cursor = idx;
        }
        d.holders.pop();
        delete d.holderIndex[account];
        d.inHolders[account] = false;
    }

    function _claimDividend(uint8 id, address account) internal {
        DivData storage d = _divs[id];
        _accrueAccount(d, account);
        uint256 amount = d.claimable[account];
        if (amount == 0) return;
        if (d.pendingReward < amount) revert Guard();
        d.claimable[account] = 0;
        d.pendingReward -= amount;
        if (!_payoutReward(d.rewardToken, account, amount)) revert TransferFailed();
        emit DividendClaimed(id, account, amount);
    }

    function _processDividends(uint8 id, uint256 maxIter) internal {
        DivData storage d = _divs[id];
        if (!d.enabled) return;
        uint256 iterations;
        while (iterations < maxIter) {
            uint256 len = d.holders.length;
            if (len == 0) { d.cursor = 0; break; }
            if (d.cursor >= len) d.cursor = 0;
            address account = d.holders[d.cursor];
            d.cursor++;
            _accrueAccount(d, account);
            uint256 amount = d.claimable[account];
            if (amount > 0 && d.pendingReward >= amount) {
                d.claimable[account] = 0;
                d.pendingReward -= amount;
                if (!_payoutReward(d.rewardToken, account, amount)) {
                    d.claimable[account] = amount;
                    d.pendingReward += amount;
                    _markFailure(5, amount, abi.encode(id, account));
                } else {
                    emit DividendClaimed(id, account, amount);
                }
            }
            iterations++;
        }
        if (d.holders.length == 0 || d.cursor >= d.holders.length) d.cursor = 0;
    }

    function _payoutReward(address reward, address account, uint256 amount) internal returns (bool) {
        if (amount == 0) return true;
        if (reward == address(0)) {
            (bool tokenOk, bytes memory tokenRet) = token.call(abi.encodeWithSelector(0xa9059cbb, account, amount));
            return _callResultOk(tokenOk, tokenRet);
        }
        if (reward == IFeeToken(token).WBNB()) return _sendNative(account, amount);
        (bool rewardOk, bytes memory rewardRet) = reward.call(abi.encodeWithSelector(0xa9059cbb, account, amount));
        return _callResultOk(rewardOk, rewardRet);
    }

    function _callResultOk(bool ok, bytes memory ret) internal pure returns (bool) {
        if (!ok) return false;
        if (ret.length == 0) return true;
        if (ret.length < 32) return false;
        return abi.decode(ret, (bool));
    }

    function _approve(address asset, address spender, uint256 amount) internal {
        (bool ok, bytes memory ret) = asset.call(abi.encodeWithSelector(0x095ea7b3, spender, 0));
        if (!_callResultOk(ok, ret)) revert TransferFailed();
        (ok, ret) = asset.call(abi.encodeWithSelector(0x095ea7b3, spender, amount));
        if (!_callResultOk(ok, ret)) revert TransferFailed();
    }

    function _transferToken(address asset, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = asset.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!_callResultOk(ok, ret)) revert TransferFailed();
    }

    function _sendNative(address to, uint256 amount) internal returns (bool) {
        if (amount == 0) return true;
        (bool ok,) = payable(to).call{value: amount}("");
        return ok;
    }

}

/**
 * Small forwarding proxy used by LaunchpadFactory.  It keeps the fee engine
 * bytecode deployed once while each project receives isolated owner/token
 * storage.  The implementation address is immutable in the proxy runtime and
 * therefore cannot collide with FeeReceiver's delegatecall storage slots.
 */
contract FeeReceiverProxy {
    address public immutable implementation;

    constructor(address impl, address projectToken) {
        if (impl == address(0) || projectToken == address(0)) revert();
        implementation = impl;
        (bool ok,) = impl.delegatecall(abi.encodeWithSignature("initialize(address)", projectToken));
        if (!ok) revert();
    }

    receive() external payable {}

    fallback() external payable {
        address impl = implementation;
        assembly ("memory-safe") {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
