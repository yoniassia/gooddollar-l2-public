// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title StabilityPool
 * @notice Liquity-inspired liquidation backstop for GoodStable.
 *
 * Depositors provide gUSD to absorb bad debt during liquidations.
 * In return they earn the collateral seized from liquidated vaults,
 * distributed pro-rata by share of the pool at liquidation time.
 *
 * Snapshot model (simplified vs Liquity's P/S product):
 *   - Each depositor is assigned a "depositEpoch" snapshot when they deposit.
 *   - Collateral gains are tracked as cumulative gain-per-gUSD-deposited
 *     per ilk, accumulated monotonically.
 *   - On withdraw/claim, pending gains are settled.
 *
 * This is production-quality but intentionally simpler than the full
 * Liquity scale product formula, trading off perfect precision for
 * auditability. A future upgrade can layer the P/S model on top.
 */

import "./interfaces/IGoodStable.sol";

interface IERC20Transfer {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract StabilityPool {
    // ============ Constants ============

    uint256 public constant PRECISION = 1e18;

    // ============ State ============

    IgUSD   public immutable gusd;
    address public vaultManager;
    address public admin;

    /// @notice Total gUSD in pool
    uint256 public totalDeposits;

    /// @notice depositor -> gUSD amount at their last deposit/settle (nominal, pre-scale)
    mapping(address => uint256) public deposits;

    /// @notice depositor -> ilk -> snapshot of cumulativeGainPerGUSD at deposit time
    mapping(address => mapping(bytes32 => uint256)) public gainSnapshots;

    /// @notice depositor -> scaleIndex at time of last deposit/settle (PRECISION-scaled)
    mapping(address => uint256) public depositScaleSnapshot;

    /// @notice Global scale index: product of (remaining/before) fractions after each offset.
    ///         Starts at PRECISION (= 1.0). Used to lazily pro-rate deposit balances after
    ///         partial offsets without iterating all depositors. GOO-352 fix.
    uint256 public scaleIndex = PRECISION;

    /// @notice Incremented each time the pool is fully drained (remaining == 0 after offset).
    ///         Deposits from a previous epoch are treated as zero on next _settleGains call.
    ///         This prevents pre-drain depositors from reclaiming burned gUSD from new depositors.
    ///         GOO-361 fix.
    uint256 public drainEpoch;

    /// @notice depositor -> drainEpoch at the time of their last deposit/settle.
    ///         If depositEpoch[user] < drainEpoch, the user's gUSD was burned and their
    ///         nominal balance is zeroed on next _settleGains call.
    mapping(address => uint256) public depositEpoch;

    /// @notice ilk -> cumulative collateral gain per unit of gUSD deposited (scaled by PRECISION)
    mapping(bytes32 => uint256) public cumulativeGainPerGUSD;

    /// @notice ilk -> collateral token address
    mapping(bytes32 => address) public collateralTokens;

    /// @notice All registered ilk keys in order of registration.
    ///         Used to iterate and reset gainSnapshots on epoch boundary re-deposits (GOO-367).
    bytes32[] public registeredIlks;

    /// @notice epoch -> scaleIndex value recorded just before the drain reset.
    ///         When drainEpoch increments, the scaleIndex is first saved here so that
    ///         pre-drain depositors can be settled against the correct (pre-reset) scale
    ///         rather than the post-reset PRECISION value (GOO-371 fix).
    mapping(uint256 => uint256) public epochBoundaryScaleIndex;

    /// @notice ilk -> pending undistributed collateral (dust from rounding)
    mapping(bytes32 => uint256) public collateralDust;

    // ============ Reentrancy ============

    uint256 private _locked;
    modifier nonReentrant() {
        require(_locked == 0, "Reentrant");
        _locked = 1;
        _;
        _locked = 0;
    }

    // ============ Events ============

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Offset(bytes32 indexed ilk, uint256 debtBurned, uint256 collateral);
    event CollateralClaimed(address indexed user, bytes32 indexed ilk, uint256 amount);
    event CollateralTokenRegistered(bytes32 indexed ilk, address token);
    event VaultManagerSet(address indexed vm);

    // ============ Constructor ============

    constructor(address _gusd, address _admin) {
        require(_gusd  != address(0), "SP: zero gUSD");
        require(_admin != address(0), "SP: zero admin");
        gusd  = IgUSD(_gusd);
        admin = _admin;
    }

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(msg.sender == admin, "SP: not admin");
        _;
    }

    modifier onlyVaultManager() {
        require(msg.sender == vaultManager, "SP: not vault manager");
        _;
    }

    // ============ Admin ============

    function setVaultManager(address _vm) external onlyAdmin {
        require(_vm != address(0), "SP: zero address");
        vaultManager = _vm;
        emit VaultManagerSet(_vm);
    }

    function registerCollateralToken(bytes32 ilk, address token) external onlyAdmin {
        require(token != address(0), "SP: zero token");
        if (collateralTokens[ilk] == address(0)) {
            registeredIlks.push(ilk);
        }
        collateralTokens[ilk] = token;
        emit CollateralTokenRegistered(ilk, token);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "SP: zero address");
        admin = newAdmin;
    }

    // ============ Core: Deposit / Withdraw ============

    /**
     * @notice Deposit gUSD into the stability pool.
     *         Pending collateral gains for all registered ilks are settled first.
     */
    function deposit(uint256 amount) public nonReentrant {
        require(amount > 0, "SP: zero amount");

        // Materialise current effective balance before changing deposit size.
        // _settleGains updates deposits[user] to reflect any offsets since last action.
        _settleGains(msg.sender);

        // GOO-361: if the user's prior deposit was from an earlier drain epoch, their
        // gUSD was already burned. Reset it to 0 before adding new funds so they don't
        // double-count.
        if (depositEpoch[msg.sender] < drainEpoch) {
            deposits[msg.sender] = 0;
        }

        // GOO-367 + GOO-369: if the user has no active stake (stale epoch or fresh entry
        // in the current epoch), reset gainSnapshots to the current cumulative so this
        // deposit cannot claim collateral gains from liquidations that occurred before entry.
        // This covers both the cross-epoch case (handled above) and a same-epoch fresh
        // depositor whose snapshots default to 0 while cumulativeGainPerGUSD > 0.
        if (deposits[msg.sender] == 0) {
            uint256 numIlks = registeredIlks.length;
            for (uint256 i = 0; i < numIlks; ) {
                gainSnapshots[msg.sender][registeredIlks[i]] = cumulativeGainPerGUSD[registeredIlks[i]];
                unchecked { ++i; }
            }
        }

        require(
            gusd.transferFrom(msg.sender, address(this), amount),
            "SP: transfer failed"
        );

        deposits[msg.sender]             += amount;
        depositScaleSnapshot[msg.sender]  = scaleIndex;
        depositEpoch[msg.sender]          = drainEpoch;
        totalDeposits                    += amount;

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw up to `amount` gUSD and claim all pending collateral gains.
     */
    function withdraw(uint256 amount) public nonReentrant {
        require(amount > 0, "SP: zero amount");

        // Materialise the effective (scaled) deposit balance first.
        _settleGains(msg.sender);

        // GOO-361: gUSD from a previous drain epoch was burned in a liquidation;
        // it cannot be withdrawn against new depositors' funds.
        require(depositEpoch[msg.sender] >= drainEpoch, "SP: deposit burned in liquidation");
        require(deposits[msg.sender] >= amount, "SP: insufficient deposit");

        deposits[msg.sender]  -= amount;
        totalDeposits         -= amount;

        require(gusd.transfer(msg.sender, amount), "SP: transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Claim earned collateral for a single ilk without withdrawing gUSD.
     */
    function claimCollateral(bytes32 ilk) external nonReentrant {
        _settleGains(msg.sender); // materialise effective deposit before gain calc
        _claimIlk(msg.sender, ilk);
    }

    // ============ Core: Offset (called by VaultManager) ============

    /**
     * @notice Absorb `debtAmount` of bad debt by burning pool gUSD, and
     *         distribute `collAmount` of collateral to depositors pro-rata.
     * @param debtAmount  gUSD to burn (must be <= totalDeposits)
     * @param ilk         collateral type key
     * @param collAmount  amount of collateral tokens to distribute
     */
    function offset(
        uint256 debtAmount,
        bytes32 ilk,
        uint256 collAmount
    ) external nonReentrant onlyVaultManager {
        require(debtAmount > 0, "SP: zero debt");
        require(totalDeposits >= debtAmount, "SP: pool too small");
        require(collateralTokens[ilk] != address(0), "SP: ilk not registered");

        // Pull collateral from VaultManager
        address colToken = collateralTokens[ilk];
        require(
            IERC20Transfer(colToken).transferFrom(msg.sender, address(this), collAmount),
            "SP: collateral transfer failed"
        );

        // Accumulate gain per deposited gUSD (PRECISION-scaled)
        if (totalDeposits > 0) {
            uint256 gainPerUnit = (collAmount * PRECISION) / totalDeposits;
            cumulativeGainPerGUSD[ilk] += gainPerUnit;
        } else {
            // Edge case: pool drained, hold as dust
            collateralDust[ilk] += collAmount;
        }

        // Burn pool gUSD in place (StabilityPool holds the tokens, calls burn)
        gusd.burn(debtAmount);

        // Update global scaleIndex to reflect the proportional reduction of deposits.
        // Each depositor's effective balance = deposits[user] * scaleIndex / depositScaleSnapshot[user].
        // This avoids iterating all depositors on every offset (GOO-352 fix).
        uint256 remaining = totalDeposits - debtAmount;
        if (totalDeposits > 0 && remaining > 0) {
            scaleIndex = (scaleIndex * remaining) / totalDeposits;
        } else if (remaining == 0) {
            // Pool fully drained — record the current scaleIndex at this epoch boundary
            // before resetting it. Pre-drain depositors whose depositScaleSnapshot is
            // below PRECISION would otherwise be incorrectly inflated by _settleGains
            // when it sees the post-reset scaleIndex == PRECISION (GOO-371 fix).
            epochBoundaryScaleIndex[drainEpoch] = scaleIndex;
            drainEpoch += 1;
            scaleIndex = PRECISION;
        }

        totalDeposits = remaining;

        emit Offset(ilk, debtAmount, collAmount);
    }

    // ============ Internal helpers ============

    /**
     * @notice Materialise the user's effective deposit balance by applying the
     *         global scaleIndex. This converts the stored nominal deposit
     *         (as of the user's last action) to the current proportional share,
     *         accounting for all offsets that occurred in between.
     *
     *         After this call, `deposits[user]` reflects the actual gUSD the user
     *         is entitled to withdraw (their pro-rata share of remaining pool).
     *         The gainSnapshot is NOT updated here — per-ilk gain claims continue
     *         to use the raw deposit amount and must be claimed explicitly via
     *         claimCollateral(). GOO-352 fix.
     */
    function _settleGains(address user) internal {
        uint256 userDeposit = deposits[user];
        if (userDeposit == 0) return;

        // Note: epoch check is NOT done here — pre-drain depositors still have
        // earned collateral gains that should be claimable. The epoch check lives in
        // withdraw() (blocks gUSD withdrawal) and deposit() (zeros stale balance before
        // adding new funds). GOO-361.

        uint256 snapshot = depositScaleSnapshot[user];
        // snapshot == 0 means user deposited before scaleIndex tracking was added;
        // treat as PRECISION (no scaling applied yet).
        if (snapshot == 0) snapshot = PRECISION;

        // GOO-371: if the user deposited in a previous drain epoch, the current
        // scaleIndex has been reset to PRECISION and no longer reflects the pool
        // fraction that was active when the drain occurred. Using the reset value
        // inflates deposits for users whose snapshot < PRECISION. Instead, clamp to
        // the scaleIndex recorded at the epoch boundary (just before the drain reset).
        uint256 userEpoch = depositEpoch[user];
        uint256 effectiveScale = (userEpoch < drainEpoch)
            ? epochBoundaryScaleIndex[userEpoch]
            : scaleIndex;
        // Guard: epochBoundaryScaleIndex defaults to 0 for epochs predating this fix.
        // Fall back to PRECISION so the deposit is not zeroed by division.
        if (effectiveScale == 0) effectiveScale = PRECISION;

        if (effectiveScale != snapshot) {
            // Scale the user's recorded deposit to match the pool fraction at settle.
            // effective = nominal * effectiveScale / snapshotScale
            uint256 effective = (userDeposit * effectiveScale) / snapshot;
            deposits[user] = effective;
            depositScaleSnapshot[user] = effectiveScale;
        }
    }

    function _claimIlk(address user, bytes32 ilk) internal {
        require(collateralTokens[ilk] != address(0), "SP: ilk not registered");

        uint256 userDeposit = deposits[user];
        if (userDeposit == 0) {
            // Reset snapshot so future deposits start fresh
            gainSnapshots[user][ilk] = cumulativeGainPerGUSD[ilk];
            return;
        }

        uint256 currentCumulative = cumulativeGainPerGUSD[ilk];
        uint256 snapshotCumulative = gainSnapshots[user][ilk];
        uint256 gained = currentCumulative - snapshotCumulative;

        if (gained == 0) return;

        uint256 pendingCollateral = (userDeposit * gained) / PRECISION;

        gainSnapshots[user][ilk] = currentCumulative;

        if (pendingCollateral > 0) {
            address colToken = collateralTokens[ilk];
            require(
                IERC20Transfer(colToken).transfer(user, pendingCollateral),
                "SP: collateral send failed"
            );
            emit CollateralClaimed(user, ilk, pendingCollateral);
        }
    }

    // ============ Liquity-compatible aliases ============

    /**
     * @notice Liquity V1/V2 compatibility alias for deposit().
     *         Ignores the optional frontEndTag parameter (not used in GoodStable).
     */
    function provideToSP(uint256 amount) external {
        deposit(amount);
    }

    /// @notice Liquity V1 two-arg variant (frontEndTag ignored).
    function provideToSP(uint256 amount, address /*frontEndTag*/) external {
        deposit(amount);
    }

    /// @notice Liquity variant with address[] hints (hints ignored).
    function provideToSP(uint256 amount, address[] calldata /*hints*/) external {
        deposit(amount);
    }

    /// @notice Liquity-compatible alias for withdraw().
    function withdrawFromSP(uint256 amount) external {
        withdraw(amount);
    }

    // ============ Views ============

    /**
     * @notice Preview pending collateral gain for a depositor on a given ilk.
     */
    function pendingGain(address user, bytes32 ilk) external view returns (uint256) {
        uint256 userDeposit = deposits[user];
        if (userDeposit == 0) return 0;
        // GOO-361: even for stale-epoch depositors, unclaimed collateral gains are still
        // owed (their gUSD was burned but they earned collateral from the liquidation).
        // Apply scale lazily for view (mirrors _settleGains without state mutation).
        uint256 snapshot = depositScaleSnapshot[user] == 0 ? PRECISION : depositScaleSnapshot[user];
        // GOO-371: mirror the epoch-boundary clamp from _settleGains.
        uint256 userEpoch = depositEpoch[user];
        uint256 effectiveScale = (userEpoch < drainEpoch)
            ? epochBoundaryScaleIndex[userEpoch]
            : scaleIndex;
        if (effectiveScale == 0) effectiveScale = PRECISION;
        if (effectiveScale != snapshot) {
            userDeposit = (userDeposit * effectiveScale) / snapshot;
        }
        uint256 gained = cumulativeGainPerGUSD[ilk] - gainSnapshots[user][ilk];
        return (userDeposit * gained) / PRECISION;
    }

    function poolSize() external view returns (uint256) {
        return totalDeposits;
    }
}
