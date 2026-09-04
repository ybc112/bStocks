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
    bytes32 public immutable tokenCreationCodeHash;
    uint256 public immutable tokenCreationCodeLength;
    // Keep commitments namespaced by the committer.  A global
    // commitment->address slot allowed an observer to copy a user's
    // commitSalt transaction and grief the reveal before the real owner.
    mapping(address => mapping(bytes32 => bool)) private saltCommitter;

    constructor(address _factory, bytes32 _creationCodeHash, uint256 _creationCodeLength) {
        factory = _factory;
        tokenCreationCodeHash = _creationCodeHash;
        tokenCreationCodeLength = _creationCodeLength;
    }

    function commitSalt(bytes32 commitment) external {
        if (commitment == bytes32(0)) revert CommitMismatch();
        saltCommitter[msg.sender][commitment] = true;
    }

    function revealAndDeploy(bytes calldata initCode, bytes32 salt, address user) external returns (address token) {
        if (msg.sender != factory) revert FactoryOnly();
        if (initCode.length < tokenCreationCodeLength) revert CreateFailed();
        bytes32 prefixHash = keccak256(initCode[:tokenCreationCodeLength]);
        if (prefixHash != tokenCreationCodeHash) revert CreateFailed();
        bytes32 commitment = keccak256(abi.encode(user, salt, initCode));
        if (user == address(0) || !saltCommitter[user][commitment]) revert CommitMismatch();
        delete saltCommitter[user][commitment];

        bytes memory code = initCode;
        assembly {
            token := create2(0, add(code, 0x20), mload(code), salt)
        }
        if (token == address(0)) revert CreateFailed();
        ITokenOwnable(token).transferOwnership(msg.sender);
    }
}
