// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {L2OutputOracle} from "./L2OutputOracle.sol";

/**
 * @title OptimismPortal
 * @notice Entry point for deposits (L1→L2) and withdrawals (L2→L1).
 *         GoodDollar adaptation: UBI fee on withdrawals.
 */
contract OptimismPortal {
    /// @notice L2OutputOracle reference
    L2OutputOracle public l2Oracle;

    /// @notice Guardian that can pause the portal
    address public guardian;

    /// @notice Whether the portal is paused
    bool public paused;

    /// @notice Minimum time before a withdrawal can be finalized
    uint256 public constant FINALIZATION_PERIOD = 7 days;

    /// @notice Tracks finalized withdrawals
    mapping(bytes32 => bool) public finalizedWithdrawals;

    /// @notice Deposit nonce
    uint256 public depositNonce;

    /// @notice UBI fee on withdrawals (basis points, e.g. 33 = 0.33%)
    uint256 public ubiFee = 33;

    /// @notice UBI treasury address
    address public ubiTreasury;

    event TransactionDeposited(
        address indexed from,
        address indexed to,
        uint256 indexed version,
        bytes opaqueData
    );

    event WithdrawalFinalized(bytes32 indexed withdrawalHash, bool success);
    event WithdrawalProven(bytes32 indexed withdrawalHash, address indexed from, address indexed to);
    event Paused(address indexed guardian);
    event Unpaused(address indexed guardian);

    constructor() {
        guardian = msg.sender;
        ubiTreasury = msg.sender;
    }

    /// @notice Initialize with L2OutputOracle
    function initialize(address _l2Oracle) external {
        require(address(l2Oracle) == address(0), "already initialized");
        l2Oracle = L2OutputOracle(_l2Oracle);
    }

    /// @notice Deposit ETH to L2 (payable)
    function depositTransaction(
        address _to,
        uint256 _value,
        uint64 _gasLimit,
        bool _isCreation,
        bytes calldata _data
    ) external payable {
        require(!paused, "OptimismPortal: paused");

        uint256 nonce = depositNonce++;
        // opaqueData layout (OP Stack spec): mint (32) + value (32) + gasLimit (8) + isCreation (1) + data
        bytes memory opaqueData = abi.encodePacked(
            msg.value,
            _value,
            _gasLimit,
            _isCreation,
            _data
        );

        emit TransactionDeposited(msg.sender, _to, nonce, opaqueData);
    }

    /// @notice Prove a withdrawal transaction
    function proveWithdrawalTransaction(
        bytes32 _withdrawalHash,
        address _from,
        address _to
    ) external {
        require(!paused, "OptimismPortal: paused");
        emit WithdrawalProven(_withdrawalHash, _from, _to);
    }

    /// @notice Finalize a withdrawal (simplified — production needs Merkle proof)
    function finalizeWithdrawalTransaction(
        bytes32 _withdrawalHash,
        address payable _to,
        uint256 _value
    ) external {
        require(!paused, "OptimismPortal: paused");
        require(!finalizedWithdrawals[_withdrawalHash], "already finalized");

        finalizedWithdrawals[_withdrawalHash] = true;

        // UBI fee on withdrawals
        uint256 fee = (_value * ubiFee) / 10000;
        uint256 payout = _value - fee;

        if (fee > 0 && ubiTreasury != address(0)) {
            (bool feeOk,) = ubiTreasury.call{value: fee}("");
            require(feeOk, "UBI fee transfer failed");
        }

        (bool ok,) = _to.call{value: payout}("");
        require(ok, "withdrawal transfer failed");

        emit WithdrawalFinalized(_withdrawalHash, true);
    }

    /// @notice Pause the portal (guardian only)
    function pause() external {
        require(msg.sender == guardian, "only guardian");
        paused = true;
        emit Paused(guardian);
    }

    /// @notice Unpause the portal (guardian only)
    function unpause() external {
        require(msg.sender == guardian, "only guardian");
        paused = false;
        emit Unpaused(guardian);
    }

    /// @notice Set UBI fee (guardian only)
    function setUBIFee(uint256 _fee) external {
        require(msg.sender == guardian, "only guardian");
        require(_fee <= 1000, "fee too high"); // max 10%
        ubiFee = _fee;
    }

    /// @notice Set UBI treasury (guardian only)
    function setUBITreasury(address _treasury) external {
        require(msg.sender == guardian, "only guardian");
        ubiTreasury = _treasury;
    }

    /// @notice Accept ETH deposits
    receive() external payable {
        this.depositTransaction{value: msg.value}(msg.sender, msg.value, 100000, false, bytes(""));
    }
}
