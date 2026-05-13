// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GoodLendAddressesProvider
 * @notice Registry for the GoodLend protocol core addresses.
 *         Inspired by Aave V3 PoolAddressesProvider — provides a single
 *         on-chain source of truth for all protocol contract addresses.
 *
 * Contracts tracked:
 *   - Pool (GoodLendPool)
 *   - Oracle (SimplePriceOracle / Chainlink adapter)
 *   - Treasury (UBIFeeSplitter)
 *   - ACL Admin
 */
contract GoodLendAddressesProvider {
    // ============ State ============

    address public owner;

    // Core protocol roles
    address public pool;
    address public oracle;
    address public treasury;
    address public aclAdmin;

    // Arbitrary registry for future additions
    mapping(bytes32 => address) private _addresses;

    // ============ Events ============

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event AddressSet(bytes32 indexed id, address indexed oldAddress, address indexed newAddress);
    event PoolUpdated(address indexed oldPool, address indexed newPool);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ACLAdminUpdated(address indexed oldAdmin, address indexed newAdmin);

    // ============ Constructor ============

    constructor(address _owner) {
        require(_owner != address(0), "Zero owner");
        owner = _owner;
    }

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ============ Core Setters ============

    function setPool(address _pool) external onlyOwner {
        emit PoolUpdated(pool, _pool);
        pool = _pool;
    }

    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    function setTreasury(address _treasury) external onlyOwner {
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function setACLAdmin(address _aclAdmin) external onlyOwner {
        emit ACLAdminUpdated(aclAdmin, _aclAdmin);
        aclAdmin = _aclAdmin;
    }

    // ============ Generic Registry ============

    /**
     * @notice Set an arbitrary address by key. Useful for future extensions
     *         without upgrading this contract.
     */
    function setAddress(bytes32 id, address addr) external onlyOwner {
        emit AddressSet(id, _addresses[id], addr);
        _addresses[id] = addr;
    }

    function getAddress(bytes32 id) external view returns (address) {
        return _addresses[id];
    }

    // ============ Ownership ============

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
