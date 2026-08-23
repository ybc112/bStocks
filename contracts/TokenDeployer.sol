// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./StocksToken.sol";

contract TokenDeployer {
    address public immutable factory;

    constructor(address _factory) {
        factory = _factory;
    }

    // CREATE deployment (legacy)
    function create(string calldata name, string calldata symbol, address router, address _factory, address dev, address marketing, address baseToken) external returns (address) {
        StocksToken t = new StocksToken(name, symbol, router, _factory, dev, marketing, baseToken);
        t.transferOwnership(msg.sender);
        return address(t);
    }

    // CREATE2 deployment with salt
    function deployDeterministic(
        string calldata name,
        string calldata symbol,
        address router,
        address _factory,
        address dev,
        address marketing,
        address baseToken,
        bytes32 salt
    ) public returns (address token) {
        require(msg.sender == factory, "FACTORY_ONLY");
        token = _deploy(name, symbol, router, _factory, dev, marketing, baseToken, salt);
    }

    function _deploy(
        string calldata name,
        string calldata symbol,
        address router,
        address _factory,
        address dev,
        address marketing,
        address baseToken,
        bytes32 salt
    ) internal returns (address token) {
        token = address(new StocksToken{salt: salt}(name, symbol, router, _factory, dev, marketing, baseToken));
        StocksToken(payable(token)).transferOwnership(msg.sender);
    }

    // Predict address without deploying
    function predictAddress(
        string calldata name,
        string calldata symbol,
        address router,
        address _factory,
        address dev,
        address marketing,
        address baseToken,
        bytes32 salt
    ) external view returns (address) {
        bytes memory initCode = abi.encodePacked(
            type(StocksToken).creationCode,
            abi.encode(name, symbol, router, _factory, dev, marketing, baseToken)
        );
        return address(uint160(uint256(keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(initCode)
            )
        ))));
    }

    // Commit-reveal to prevent salt frontrunning
    mapping(bytes32 => address) public saltCommitter;

    function commitSalt(bytes32 commitment) external {
        saltCommitter[commitment] = msg.sender;
    }

    function revealAndDeploy(
        string calldata name,
        string calldata symbol,
        address router,
        address _factory,
        address dev,
        address marketing,
        address baseToken,
        bytes32 salt,
        address user
    ) external returns (address) {
        require(msg.sender == factory, "FACTORY_ONLY");
        bytes32 commitment = keccak256(abi.encode(user, salt, name, symbol, baseToken));
        require(saltCommitter[commitment] == user, "COMMIT_MISMATCH");
        delete saltCommitter[commitment];
        return deployDeterministic(name, symbol, router, _factory, dev, marketing, baseToken, salt);
    }
}