// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITokenOwnable {
    function transferOwnership(address newOwner) external;
}

contract TokenDeployer {
    error FactoryOnly();
    error CommitMismatch();
    error CreateFailed();

    address private immutable factory;
    mapping(bytes32 => address) private saltCommitter;

    constructor(address _factory) {
        factory = _factory;
    }

    function commitSalt(bytes32 commitment) external {
        saltCommitter[commitment] = msg.sender;
    }

    function revealAndDeploy(bytes calldata initCode, bytes32 salt, address user) external returns (address token) {
        if (msg.sender != factory) revert FactoryOnly();
        bytes32 commitment = keccak256(abi.encode(user, salt, initCode));
        if (saltCommitter[commitment] != user) revert CommitMismatch();
        delete saltCommitter[commitment];

        bytes memory code = initCode;
        assembly {
            token := create2(0, add(code, 0x20), mload(code), salt)
        }
        if (token == address(0)) revert CreateFailed();
        ITokenOwnable(token).transferOwnership(msg.sender);
    }
}