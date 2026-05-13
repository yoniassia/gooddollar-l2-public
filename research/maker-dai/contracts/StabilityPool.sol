// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title StabilityPool
 * @notice Liquidation backstop for GoodStable, inspired by Liquity's Stability Pool.
 *
 *         Users deposit gUSD. When a vault is liquidated:
 *         1. gUSD from the pool absorbs the vault's debt (burned proportionally from depositors)
 *         2. Depositors receive the liquidated collateral at a discount
 *
 *         Uses Liquity's O(1) tracking algorithm with running product P and sum S
 *         to efficiently track each depositor's share without iteration.
 *
 *         Key difference from Liquity: surplus (liquidation penalty) goes to UBI pool.
 */

interface IGoodStableToken {
    function mint(address to, uint256 amount) external;
    function burnFrom(address from, uint256 amount) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ICollateralJoin {
    function exit(address usr, address to, uint256 amount) external;
    function gem() external view returns (address);
}

contract StabilityPool is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;

    // --- Constants ---
    uint256 public constant DECIMAL_PRECISION = 1e18;
    uint256 public constant SCALE_FACTOR = 1e9;
    bytes32 public constant CDP_MANAGER_ROLE = keccak256("CDP_MANAGER_ROLE");

    // --- State ---
    IGoodStableToken public immutable gUSD;

    /// @notice Total gUSD deposited in the pool
    uint256 public totalDeposits;

    /// @notice Running product for deposit tracking (starts at 1e18, decreases with each liquidation)
    uint256 public P;

    /// @notice Current scale — incremented when P would underflow
    uint128 public currentScale;

    /// @notice Current epoch — incremented when pool is fully depleted
    uint128 public currentEpoch;

    /// @notice Collateral type => epoch => scale => sum of collateral gains per unit deposit
    mapping(bytes32 => mapping(uint128 => mapping(uint128 => uint256))) public epochToScaleToSum;

    // --- Per-depositor state ---
    struct Deposit {
        uint256 amount;          // Initial deposit amount
        uint128 snapshotScale;   // P scale at time of deposit
        uint128 snapshotEpoch;   // Epoch at time of deposit
        uint256 snapshotP;       // P value at time of deposit
        mapping(bytes32 => uint256) snapshotS; // S values at time of deposit per collateral
    }

    mapping(address => Deposit) public deposits;

    /// @notice Collateral types that have been used in liquidations
    bytes32[] public collateralTypes;
    mapping(bytes32 => bool) public isCollateralRegistered;

    /// @notice Join adapters per collateral type
    mapping(bytes32 => ICollateralJoin) public collateralJoins;

    /// @notice Collateral gains held by this pool per type
    mapping(bytes32 => uint256) public collateralBalances;

    // --- Events ---
    event DepositMade(address indexed depositor, uint256 amount);
    event DepositWithdrawn(address indexed depositor, uint256 amount);
    event CollateralGainWithdrawn(address indexed depositor, bytes32 indexed ilk, uint256 amount);
    event LiquidationOffset(bytes32 indexed ilk, uint256 debtAbsorbed, uint256 collateralDistributed);
    event EpochUpdated(uint128 epoch);
    event ScaleUpdated(uint128 scale);

    // --- Errors ---
    error ZeroAmount();
    error NoDeposit();
    error InsufficientPoolBalance();

    constructor(address _gUSD) {
        gUSD = IGoodStableToken(_gUSD);
        P = DECIMAL_PRECISION; // Start at 1.0
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Register a collateral type and its join adapter
     */
    function registerCollateral(bytes32 ilk, address join) external onlyRole(DEFAULT_ADMIN_ROLE) {
        collateralJoins[ilk] = ICollateralJoin(join);
        if (!isCollateralRegistered[ilk]) {
            collateralTypes.push(ilk);
            isCollateralRegistered[ilk] = true;
        }
    }

    // =========================================================================
    //                        DEPOSITOR FUNCTIONS
    // =========================================================================

    /**
     * @notice Deposit gUSD into the Stability Pool
     * @param amount Amount of gUSD to deposit
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        // Pay out any pending collateral gains first
        _payOutCollateralGains(msg.sender);

        // Get compounded deposit (account for past liquidations)
        uint256 compoundedDeposit = _getCompoundedDeposit(msg.sender);
        uint256 newDeposit = compoundedDeposit + amount;

        // Transfer gUSD from depositor
        gUSD.transferFrom(msg.sender, address(this), amount);
        totalDeposits += amount;

        // Update depositor's snapshot
        _updateSnapshot(msg.sender, newDeposit);

        emit DepositMade(msg.sender, amount);
    }

    /**
     * @notice Withdraw gUSD from the Stability Pool
     * @param amount Amount to withdraw (capped at compounded deposit)
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        // Pay out collateral gains
        _payOutCollateralGains(msg.sender);

        uint256 compoundedDeposit = _getCompoundedDeposit(msg.sender);
        if (compoundedDeposit == 0) revert NoDeposit();

        uint256 withdrawAmount = amount > compoundedDeposit ? compoundedDeposit : amount;
        uint256 newDeposit = compoundedDeposit - withdrawAmount;

        totalDeposits -= withdrawAmount;

        // Transfer gUSD back
        gUSD.transfer(msg.sender, withdrawAmount);

        // Update snapshot
        _updateSnapshot(msg.sender, newDeposit);

        emit DepositWithdrawn(msg.sender, withdrawAmount);
    }

    /**
     * @notice Claim accumulated collateral gains without changing deposit
     */
    function claimCollateralGains() external nonReentrant {
        _payOutCollateralGains(msg.sender);
        // Re-snapshot at current compounded deposit
        uint256 compoundedDeposit = _getCompoundedDeposit(msg.sender);
        _updateSnapshot(msg.sender, compoundedDeposit);
    }

    // =========================================================================
    //                        LIQUIDATION OFFSET
    // =========================================================================

    /**
     * @notice Absorb debt from a liquidated vault. Called by CDPManager.
     * @param debtToAbsorb        Amount of gUSD debt to absorb
     * @param ilk                 Collateral type of the liquidated vault
     * @param collateralToDistribute Amount of collateral to distribute to depositors
     * @return absorbed           Actual amount of debt absorbed (may be less if pool insufficient)
     */
    function offset(
        uint256 debtToAbsorb,
        bytes32 ilk,
        uint256 collateralToDistribute
    ) external onlyRole(CDP_MANAGER_ROLE) returns (uint256 absorbed) {
        if (totalDeposits == 0) return 0;

        // Cap absorption at total deposits
        absorbed = debtToAbsorb > totalDeposits ? totalDeposits : debtToAbsorb;

        // Scale collateral proportionally if partial absorption
        uint256 collateralGain = absorbed == debtToAbsorb
            ? collateralToDistribute
            : collateralToDistribute * absorbed / debtToAbsorb;

        // Update S (collateral gain sum) — per unit of deposit
        _updateCollateralSum(ilk, collateralGain);

        // Update P (running product) — reduce all deposits proportionally
        _updateProductP(absorbed);

        totalDeposits -= absorbed;

        // Track collateral held
        collateralBalances[ilk] += collateralGain;

        emit LiquidationOffset(ilk, absorbed, collateralGain);
    }

    // =========================================================================
    //                        VIEW FUNCTIONS
    // =========================================================================

    /**
     * @notice Get a depositor's current compounded deposit
     */
    function getCompoundedDeposit(address depositor) external view returns (uint256) {
        return _getCompoundedDeposit(depositor);
    }

    /**
     * @notice Get pending collateral gains for a depositor
     */
    function getCollateralGain(address depositor, bytes32 ilk) external view returns (uint256) {
        return _getCollateralGain(depositor, ilk);
    }

    // =========================================================================
    //                        INTERNAL — LIQUITY-STYLE O(1) TRACKING
    // =========================================================================

    /**
     * @dev Update the running product P after a liquidation absorbs `debtAbsorbed`
     *      P_new = P_old * (1 - debtAbsorbed/totalDeposits)
     */
    function _updateProductP(uint256 debtAbsorbed) internal {
        if (debtAbsorbed == totalDeposits) {
            // Pool fully depleted — new epoch
            currentEpoch += 1;
            currentScale = 0;
            P = DECIMAL_PRECISION;
            emit EpochUpdated(currentEpoch);
            return;
        }

        uint256 newP = P * (totalDeposits - debtAbsorbed) / totalDeposits;

        // If P would become too small, scale up
        if (newP < DECIMAL_PRECISION / SCALE_FACTOR) {
            newP = newP * SCALE_FACTOR;
            currentScale += 1;
            emit ScaleUpdated(currentScale);
        }

        P = newP;
    }

    /**
     * @dev Update the collateral sum S for a liquidation
     *      S += collateralGain * DECIMAL_PRECISION / totalDeposits
     */
    function _updateCollateralSum(bytes32 ilk, uint256 collateralGain) internal {
        uint256 gainPerUnitDeposit = collateralGain * DECIMAL_PRECISION / totalDeposits;
        epochToScaleToSum[ilk][currentEpoch][currentScale] += gainPerUnitDeposit;
    }

    /**
     * @dev Calculate compounded deposit — how much of the original deposit remains
     *      after absorbing liquidation losses
     */
    function _getCompoundedDeposit(address depositor) internal view returns (uint256) {
        Deposit storage d = deposits[depositor];
        if (d.amount == 0) return 0;

        // If deposit is from a previous epoch, it's been fully consumed
        if (d.snapshotEpoch < currentEpoch) return 0;

        uint256 scaleDiff = currentScale - d.snapshotScale;

        if (scaleDiff == 0) {
            return d.amount * P / d.snapshotP;
        } else if (scaleDiff == 1) {
            return d.amount * P / (d.snapshotP * SCALE_FACTOR);
        } else {
            return 0; // Deposit has been almost entirely consumed
        }
    }

    /**
     * @dev Calculate pending collateral gain for a depositor for a specific collateral type
     */
    function _getCollateralGain(address depositor, bytes32 ilk) internal view returns (uint256) {
        Deposit storage d = deposits[depositor];
        if (d.amount == 0) return 0;

        uint128 epochSnapshot = d.snapshotEpoch;
        uint128 scaleSnapshot = d.snapshotScale;

        uint256 S_snapshot = d.snapshotS[ilk];
        uint256 S_current = epochToScaleToSum[ilk][epochSnapshot][scaleSnapshot];
        uint256 S_next = epochToScaleToSum[ilk][epochSnapshot][scaleSnapshot + 1];

        uint256 firstPortion = S_current - S_snapshot;
        uint256 secondPortion = S_next / SCALE_FACTOR;

        return d.amount * (firstPortion + secondPortion) / d.snapshotP;
    }

    /**
     * @dev Pay out all pending collateral gains to a depositor
     */
    function _payOutCollateralGains(address depositor) internal {
        for (uint256 i = 0; i < collateralTypes.length; i++) {
            bytes32 ilk = collateralTypes[i];
            uint256 gain = _getCollateralGain(depositor, ilk);
            if (gain > 0 && gain <= collateralBalances[ilk]) {
                collateralBalances[ilk] -= gain;

                // Transfer collateral to depositor
                ICollateralJoin joinAdapter = collateralJoins[ilk];
                address gemToken = joinAdapter.gem();
                IERC20(gemToken).safeTransfer(depositor, gain);

                emit CollateralGainWithdrawn(depositor, ilk, gain);
            }
        }
    }

    /**
     * @dev Update a depositor's snapshot to current values
     */
    function _updateSnapshot(address depositor, uint256 newAmount) internal {
        Deposit storage d = deposits[depositor];
        d.amount = newAmount;
        d.snapshotP = P;
        d.snapshotScale = currentScale;
        d.snapshotEpoch = currentEpoch;

        for (uint256 i = 0; i < collateralTypes.length; i++) {
            bytes32 ilk = collateralTypes[i];
            d.snapshotS[ilk] = epochToScaleToSum[ilk][currentEpoch][currentScale];
        }
    }
}
