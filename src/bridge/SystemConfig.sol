// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SystemConfig
 * @notice Stores L2 system configuration on L1.
 *         The op-node reads these values to configure the L2.
 *         GoodDollar: includes UBI-specific chain parameters.
 */
contract SystemConfig {
    /// @notice Owner
    address public owner;

    /// @notice Overhead cost of batch submission (L1 gas)
    uint256 public overhead;

    /// @notice Scalar for L1 data fee calculation
    uint256 public scalar;

    /// @notice Batcher address (who can submit batches)
    address public batcherHash;

    /// @notice L2 gas limit
    uint64 public gasLimit;

    /// @notice Unsafe block signer
    address public unsafeBlockSigner;

    /// @notice Resource config for EIP-1559
    struct ResourceConfig {
        uint32 maxResourceLimit;
        uint8 elasticityMultiplier;
        uint8 baseFeeMaxChangeDenominator;
        uint32 minimumBaseFee;
        uint32 systemTxMaxGas;
        uint128 maximumBaseFee;
    }

    ResourceConfig public resourceConfig;

    /// @notice GoodDollar-specific: UBI fee percentage (basis points)
    uint256 public ubiFeeBps;

    event ConfigUpdate(uint256 indexed version, uint8 indexed updateType, bytes data);

    constructor() {
        owner = msg.sender;
        overhead = 188;
        scalar = 684000;
        gasLimit = 30_000_000;
        ubiFeeBps = 3300; // 33% — the GoodDollar way
        batcherHash = msg.sender;
        unsafeBlockSigner = msg.sender;
        resourceConfig = ResourceConfig({
            maxResourceLimit: 20_000_000,
            elasticityMultiplier: 6,
            baseFeeMaxChangeDenominator: 50,
            minimumBaseFee: 1 gwei,
            systemTxMaxGas: 1_000_000,
            maximumBaseFee: type(uint128).max
        });
    }

    /// @notice Update gas config
    function setGasConfig(uint256 _overhead, uint256 _scalar) external {
        require(msg.sender == owner, "only owner");
        overhead = _overhead;
        scalar = _scalar;
        emit ConfigUpdate(0, 0, abi.encode(_overhead, _scalar));
    }

    /// @notice Update gas limit
    function setGasLimit(uint64 _gasLimit) external {
        require(msg.sender == owner, "only owner");
        require(_gasLimit >= 1_000_000, "gas limit too low");
        gasLimit = _gasLimit;
        emit ConfigUpdate(0, 1, abi.encode(_gasLimit));
    }

    /// @notice Update batcher
    function setBatcherHash(address _batcher) external {
        require(msg.sender == owner, "only owner");
        batcherHash = _batcher;
        emit ConfigUpdate(0, 2, abi.encode(_batcher));
    }

    /// @notice Update UBI fee (GoodDollar-specific)
    function setUBIFee(uint256 _feeBps) external {
        require(msg.sender == owner, "only owner");
        require(_feeBps <= 10000, "max 100%");
        ubiFeeBps = _feeBps;
        emit ConfigUpdate(0, 100, abi.encode(_feeBps));
    }

    /// @notice Update unsafe block signer
    function setUnsafeBlockSigner(address _signer) external {
        require(msg.sender == owner, "only owner");
        unsafeBlockSigner = _signer;
    }

    /// @notice Transfer ownership
    function transferOwnership(address _newOwner) external {
        require(msg.sender == owner, "only owner");
        owner = _newOwner;
    }
}
