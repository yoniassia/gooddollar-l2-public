// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @title LendingStrategy — GoodLend Supply Strategy
 * @notice Deposits vault assets into GoodLend to earn supply interest.
 *         Harvest claims accrued interest as profit.
 *
 * How it works:
 *   1. Vault deposits assets → Strategy → GoodLend supply
 *   2. Assets earn supply APY in GoodLend
 *   3. harvest() checks new balance vs debt, profit = growth
 *   4. Profit withdrawn and returned to vault for UBI fee + compound
 */

interface IGoodLendPool {
    function supply(address asset, uint256 amount, address onBehalfOf) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IGoodLendToken {
    function balanceOf(address) external view returns (uint256);
    function scaledBalanceOf(address) external view returns (uint256);
}

contract LendingStrategy {
    address public immutable asset;
    address public immutable deployer;
    address public vault;
    IGoodLendPool public lendPool;
    address public gToken; // The gToken for our asset

    uint256 public totalDeposited; // tracks principal (not including interest)
    bool public paused;

    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event Harvested(uint256 profit, uint256 loss);

    error NotVault();
    error IsPaused();
    error AssetMismatch();
    error TransferFailed();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(
        address _asset,
        address _lendPool,
        address _gToken,
        address _vault
    ) {
        asset = _asset;
        deployer = msg.sender;
        lendPool = IGoodLendPool(_lendPool);
        gToken = _gToken;
        vault = _vault;
    }

    /// @notice Wire the vault address after deployment (one-shot, deployer-only).
    ///         Required when the strategy is deployed before the vault exists (chicken-and-egg).
    ///         Restricted to deployer to prevent front-running on networks with a public mempool.
    function setVault(address _vault) external {
        require(msg.sender == deployer, "LendingStrategy: not deployer");
        require(vault == address(0), "LendingStrategy: vault already set");
        require(_vault != address(0), "LendingStrategy: zero vault");
        vault = _vault;
    }

    /// @notice Total assets this strategy controls (principal + accrued interest)
    function totalAssets() external view returns (uint256) {
        return IGoodLendToken(gToken).balanceOf(address(this));
    }

    /// @notice Deposit into GoodLend
    function deposit(uint256 amount) external onlyVault {
        if (paused) revert IsPaused();
        if (!IERC20(asset).transferFrom(vault, address(this), amount)) revert TransferFailed();
        if (!IERC20(asset).approve(address(lendPool), amount)) revert TransferFailed();
        lendPool.supply(asset, amount, address(this));
        IERC20(asset).approve(address(lendPool), 0); // reset allowance after external call
        totalDeposited += amount;
        emit Deposited(amount);
    }

    /// @notice Withdraw from GoodLend back to vault
    function withdraw(uint256 amount) external onlyVault returns (uint256) {
        uint256 bal = IGoodLendToken(gToken).balanceOf(address(this));
        if (amount > bal) amount = bal;
        if (amount == 0) return 0; // nothing to withdraw (inactive reserve or no deposits)
        uint256 withdrawn = lendPool.withdraw(asset, amount, vault);
        if (withdrawn > totalDeposited) {
            totalDeposited = 0;
        } else {
            totalDeposited -= withdrawn;
        }
        emit Withdrawn(withdrawn);
        return withdrawn;
    }

    /// @notice Harvest: report profit/loss from GoodLend interest
    function harvest() external onlyVault returns (uint256 profit, uint256 loss) {
        uint256 currentBal = IGoodLendToken(gToken).balanceOf(address(this));

        if (currentBal > totalDeposited) {
            profit = currentBal - totalDeposited;
            totalDeposited = currentBal; // reset baseline
        } else if (currentBal < totalDeposited) {
            loss = totalDeposited - currentBal;
            totalDeposited = currentBal;
        }

        emit Harvested(profit, loss);
    }

    /// @notice Emergency: withdraw everything from GoodLend
    function emergencyWithdraw() external onlyVault returns (uint256) {
        paused = true;
        uint256 bal = IGoodLendToken(gToken).balanceOf(address(this));
        uint256 withdrawn;
        if (bal > 0) {
            withdrawn = lendPool.withdraw(asset, bal, vault);
        }
        totalDeposited = 0;
        return withdrawn;
    }
}
