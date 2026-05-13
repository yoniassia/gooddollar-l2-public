// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GoodVault.sol";

/**
 * @title VaultFactory — Factory for deploying GoodVaults
 * @notice Permissionless vault creation. Anyone can create a vault with
 *         an approved strategy type. UBI fees are enforced at the vault level.
 *
 * Features:
 *   - Deploy new vaults for any asset/strategy combo
 *   - Registry of all active vaults
 *   - TVL tracking across all vaults
 *   - Strategy whitelist (admin-approved strategies only)
 */

contract VaultFactory {
    address public admin;
    address public pendingAdmin;
    address public ubiFee;

    // Vault registry
    address[] public allVaults;
    mapping(address => bool) public isVault;
    mapping(address => address[]) public vaultsByAsset; // asset → vaults

    // Strategy whitelist
    mapping(address => bool) public approvedStrategies;
    address[] public strategyList;

    // Default config
    uint256 public defaultDepositCap = 1_000_000 ether; // 1M tokens

    event VaultCreated(address indexed vault, address indexed asset, address indexed strategy, string name);
    event StrategyApproved(address indexed strategy);
    event StrategyRevoked(address indexed strategy);

    error NotAdmin();
    error StrategyNotApproved();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _ubiFee) {
        require(_ubiFee != address(0), "VaultFactory: zero ubiFee");
        admin = msg.sender;
        ubiFee = _ubiFee;
    }

    /// @notice Create a new vault
    function createVault(
        address _asset,
        address _strategy,
        string calldata _name,
        string calldata _symbol,
        uint256 _depositCap
    ) external returns (address vault) {
        if (!approvedStrategies[_strategy]) revert StrategyNotApproved();

        vault = address(new GoodVault(
            _asset,
            _strategy,
            ubiFee,
            _name,
            _symbol,
            _depositCap > 0 ? _depositCap : defaultDepositCap,
            msg.sender
        ));

        allVaults.push(vault);
        isVault[vault] = true;
        vaultsByAsset[_asset].push(vault);

        emit VaultCreated(vault, _asset, _strategy, _name);
    }

    /// @notice Get total TVL across all vaults
    function totalTVL() external view returns (uint256 tvl) {
        for (uint256 i = 0; i < allVaults.length; i++) {
            tvl += GoodVault(allVaults[i]).totalAssets();
        }
    }

    /// @notice Get total UBI funded across all vaults
    function totalUBIFunded() external view returns (uint256 total) {
        for (uint256 i = 0; i < allVaults.length; i++) {
            total += GoodVault(allVaults[i]).totalUBIFunded();
        }
    }

    function vaultCount() external view returns (uint256) {
        return allVaults.length;
    }

    function getVaultsByAsset(address _asset) external view returns (address[] memory) {
        return vaultsByAsset[_asset];
    }

    // ─── Admin ───

    function approveStrategy(address _strategy) external onlyAdmin {
        approvedStrategies[_strategy] = true;
        strategyList.push(_strategy);
        emit StrategyApproved(_strategy);
    }

    function revokeStrategy(address _strategy) external onlyAdmin {
        approvedStrategies[_strategy] = false;
        emit StrategyRevoked(_strategy);
    }

    function setDefaultDepositCap(uint256 _cap) external onlyAdmin {
        defaultDepositCap = _cap;
    }

    function transferAdmin(address _pendingAdmin) external onlyAdmin {
        require(_pendingAdmin != address(0), "VaultFactory: zero admin");
        pendingAdmin = _pendingAdmin;
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "VaultFactory: not pending");
        admin = pendingAdmin;
        pendingAdmin = address(0);
    }
}
