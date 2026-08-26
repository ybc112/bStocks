// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./StocksToken.sol";

contract TokenDeployer {
    error FactoryOnly();
    error CommitMismatch();

    address private immutable factory;

    constructor(address _factory) {
        factory = _factory;
    }

    // Commit-reveal to prevent salt frontrunning
    mapping(bytes32 => address) private saltCommitter;


    function commitSalt(bytes32 commitment) external {
        saltCommitter[commitment] = msg.sender;
    }

    function initCodeHash(string calldata name, string calldata symbol, address router, address _factory, address dev, address marketing, address baseToken) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(type(StocksToken).creationCode, abi.encode(name, symbol, router, _factory, dev, marketing, baseToken)));
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
        if (msg.sender != factory) revert FactoryOnly();
        bytes32 commitment = keccak256(abi.encode(user, salt, name, symbol, baseToken));
        if (saltCommitter[commitment] != user) revert CommitMismatch();
        delete saltCommitter[commitment];
        address token = _create(name, symbol, router, _factory, dev, marketing, baseToken, salt);
        // Configure the factory while the deployer is still token owner.
        return token;
    }

    function _create(string calldata name, string calldata symbol, address router, address _factory, address dev, address marketing, address baseToken, bytes32 salt) internal returns (address token) {
        token = address(new StocksToken{salt: salt}(name, symbol, router, _factory, dev, marketing, baseToken));
        StocksToken(payable(token)).transferOwnership(msg.sender);
    }
}
