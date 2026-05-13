// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @title StablecoinStrategy — gUSD Stability Pool Strategy
 * @notice Deposits assets into GoodStable's StabilityPool to earn
 *         liquidation proceeds + stability fees.
 *
 * How it works:
 *   1. Vault deposits gUSD → Strategy → StabilityPool
 *   2. Strategy earns from liquidation gains + stability pool rewards
 *   3. harvest() reports gains as profit
 */

interface IStabilityPool {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
    /// @dev Matches GoodStable StabilityPool public mapping getter.
    function deposits(address depositor) external view returns (uint256);
    /// @dev Claim collateral gains from liquidations; transfers gain tokens to caller.
    function claimGains() external returns (uint256);
}

contract StablecoinStrategy {
    address public immutable asset; // gUSD
    address public immutable deployer;
    address public vault;
    IStabilityPool public stabilityPool;
    address public gainToken; // ETH/WETH gained from liquidations

    uint256 public totalDeposited;
    bool public paused;

    event Deposited(uint256 amount);
    event Withdrawn(uint256 amount);
    event Harvested(uint256 profit, uint256 loss);
    event GainsClaimed(uint256 ethGain);

    error NotVault();
    error IsPaused();
    error TransferFailed();
    error CannotSweepAsset();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(
        address _asset,
        address _stabilityPool,
        address _gainToken,
        address _vault
    ) {
        asset = _asset;
        deployer = msg.sender;
        stabilityPool = IStabilityPool(_stabilityPool);
        gainToken = _gainToken;
        vault = _vault;
    }

    /// @notice Wire the vault address after deployment (one-shot, deployer-only).
    ///         Restricted to deployer to prevent front-running on networks with a public mempool.
    function setVault(address _vault) external {
        require(msg.sender == deployer, "StablecoinStrategy: not deployer");
        require(vault == address(0), "StablecoinStrategy: vault already set");
        require(_vault != address(0), "StablecoinStrategy: zero vault");
        vault = _vault;
    }

    function totalAssets() external view returns (uint256) {
        return stabilityPool.deposits(address(this));
    }

    function deposit(uint256 amount) external onlyVault {
        if (paused) revert IsPaused();
        if (!IERC20(asset).transferFrom(vault, address(this), amount)) revert TransferFailed();
        if (!IERC20(asset).approve(address(stabilityPool), amount)) revert TransferFailed();
        stabilityPool.deposit(amount);
        IERC20(asset).approve(address(stabilityPool), 0); // reset allowance after external call
        totalDeposited += amount;
        emit Deposited(amount);
    }

    function withdraw(uint256 amount) external onlyVault returns (uint256) {
        uint256 bal = stabilityPool.deposits(address(this));
        if (amount > bal) amount = bal;
        stabilityPool.withdraw(amount);

        // Use actual balance in case pool returned less than requested (rounding/fees).
        uint256 actual = IERC20(asset).balanceOf(address(this));
        if (actual == 0) return 0;
        if (!IERC20(asset).transfer(vault, actual)) revert TransferFailed();

        if (actual > totalDeposited) {
            totalDeposited = 0;
        } else {
            totalDeposited -= actual;
        }
        emit Withdrawn(actual);
        return actual;
    }

    function harvest() external onlyVault returns (uint256 profit, uint256 loss) {
        uint256 currentBal = stabilityPool.deposits(address(this));

        // Claim collateral gains (e.g. WETH from liquidations) and accumulate in strategy.
        // Gains are NOT forwarded to the vault; admin recovers them via GoodVault.sweepStrategyToken().
        if (gainToken != address(0)) {
            stabilityPool.claimGains();
            uint256 gained = IERC20(gainToken).balanceOf(address(this));
            if (gained > 0) {
                emit GainsClaimed(gained);
            }
        }

        // Report gUSD profit/loss
        if (currentBal > totalDeposited) {
            profit = currentBal - totalDeposited;
            totalDeposited = currentBal;
        } else if (currentBal < totalDeposited) {
            loss = totalDeposited - currentBal;
            totalDeposited = currentBal;
        }

        emit Harvested(profit, loss);
    }

    /// @notice Recover any non-asset token stranded in this strategy (e.g. WETH liquidation gains).
    ///         Only callable by the vault, which gates it via onlyAdmin in GoodVault.sweepStrategyToken().
    function sweepGains(address token, address to) external onlyVault {
        if (token == asset) revert CannotSweepAsset();
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) {
            if (!IERC20(token).transfer(to, bal)) revert TransferFailed();
        }
    }

    function emergencyWithdraw() external onlyVault returns (uint256) {
        paused = true;
        uint256 bal = stabilityPool.deposits(address(this));
        uint256 actual = 0;
        if (bal > 0) {
            stabilityPool.withdraw(bal);
            // Use actual balance in case pool returned less than requested.
            actual = IERC20(asset).balanceOf(address(this));
            if (actual > 0) {
                if (!IERC20(asset).transfer(vault, actual)) revert TransferFailed();
            }
        }
        totalDeposited = 0;
        return actual;
    }
}
