// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory n_, string memory s_) { name = n_; symbol = s_; }

    function mint(address to, uint256 a) external { totalSupply += a; balanceOf[to] += a; emit Transfer(address(0), to, a); }
    function burn(address from, uint256 a) external { totalSupply -= a; balanceOf[from] -= a; emit Transfer(from, address(0), a); }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; emit Transfer(msg.sender, to, a); return true; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; emit Approval(msg.sender, s, a); return true; }
    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        if (al != type(uint256).max) { allowance[f][msg.sender] = al - a; }
        balanceOf[f] -= a; balanceOf[t] += a; emit Transfer(f, t, a); return true;
    }
}

contract MockFactory {
    mapping(address => mapping(address => address)) public pairs;
    function getPair(address a, address b) external view returns (address) { return pairs[a][b]; }
    function setPair(address a, address b, address p) external { pairs[a][b] = p; pairs[b][a] = p; }
}

contract MockRouter {
    MockERC20 public lpToken;
    address public weth;
    address public fac;
    uint256 public ethToTokenRate = 1e12;
    uint256 public tokenToEthRate = 1e12;
    struct Pool { uint256 bnb; uint256 tok; uint256 lp; }
    mapping(address => Pool) public pools;

    constructor() { lpToken = new MockERC20("MockLP", "MLP"); }
    function setup(address w, address f) external { weth = w; fac = f; }
    function WETH() external view returns (address) { return weth; }
    function factory() external view returns (address) { return fac; }
    function setRates(uint256 e2t, uint256 t2e) external { ethToTokenRate = e2t; tokenToEthRate = t2e; }

    function addLiquidityETH(address token, uint256 amountTokenDesired, uint256, uint256, address to, uint256) external payable returns (uint256, uint256, uint256) {
        IERC(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        uint256 liq = amountTokenDesired + msg.value;
        lpToken.mint(to, liq);
        pools[token].bnb += msg.value;
        pools[token].tok += amountTokenDesired;
        pools[token].lp += liq;
        return (amountTokenDesired, msg.value, liq);
    }

    function addLiquidity(address tokenA, address tokenB, uint256 aA, uint256 aB, uint256, uint256, address to, uint256) external returns (uint256, uint256, uint256) {
        IERC(tokenA).transferFrom(msg.sender, address(this), aA);
        IERC(tokenB).transferFrom(msg.sender, address(this), aB);
        uint256 liq = aA + aB;
        lpToken.mint(to, liq);
        pools[tokenA].tok += aA;
        pools[tokenB].tok += aB;
        pools[tokenA].lp += liq;
        return (aA, aB, liq);
    }

    function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256) external returns (uint256, uint256) {
        lpToken.transferFrom(msg.sender, address(this), liquidity);
        lpToken.burn(address(this), liquidity);
        Pool storage p = pools[token];
        uint256 bnbOut = p.lp > 0 ? (liquidity * p.bnb) / p.lp : 0;
        uint256 tokOut = p.lp > 0 ? (liquidity * p.tok) / p.lp : 0;
        p.bnb -= bnbOut;
        p.tok -= tokOut;
        p.lp -= liquidity;
        require(tokOut >= amountTokenMin, "MIN");
        require(bnbOut >= amountETHMin, "MINB");
        require(address(this).balance >= bnbOut, "NOBNB");
        (bool ok,) = payable(to).call{value: bnbOut}("");
        require(ok, "ETH");
        IERC(token).transfer(to, tokOut);
        return (tokOut, bnbOut);
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256, address[] calldata path, address to, uint256) external {
        IERC(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = amountIn / tokenToEthRate;
        require(address(this).balance >= out, "NOBNB");
        payable(to).transfer(out);
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256, address[] calldata path, address to, uint256) external payable {
        uint256 out = msg.value * ethToTokenRate;
        IERC(path[1]).transfer(to, out);
    }

    function swapExactETHForTokens(uint256, address[] calldata path, address to, uint256) external payable returns (uint256[] memory) {
        uint256 out = msg.value * ethToTokenRate;
        IERC(path[1]).transfer(to, out);
        uint256[] memory r = new uint256[](2);
        r[1] = out;
        return r;
    }

    receive() external payable {}
}