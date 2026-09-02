// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IFeeERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

// 独立 BNB 税币接收器：代币换出 BNB 时由 Router 把 BNB 送进这里
// （FeeReceiver 不是本币 LP 成员，可绕过 Pancake 的 INVALID_TO），
// 再由代币主动 withdraw() 拉回分配。receive() 仅累加、不转发，
// 避免触发代币 receive→swapIn 把手动/回流 BNB 误判为打款。
contract FeeReceiver {
    address public owner;
    constructor(address _owner) { owner = _owner; }
    modifier onlyOwner() { require(msg.sender == owner, "NO"); _; }
    receive() external payable {}
    function withdraw() external onlyOwner {
        (bool ok,) = payable(owner).call{value: address(this).balance}("");
        require(ok, "WF");
    }
    function withdrawToken(address t) external onlyOwner {
        IFeeERC20(t).transfer(owner, IFeeERC20(t).balanceOf(address(this)));
    }
}