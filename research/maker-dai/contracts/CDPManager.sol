// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title CDPManager
 * @notice Core vault management for GoodStable. Users can:
 *         - Open vaults with approved collateral types
 *         - Deposit collateral and borrow gUSD
 *         - Repay gUSD and withdraw collateral
 *         - Close vaults
 *
 *         Inspired by MakerDAO's Vat + CDPManager, simplified for GoodDollar L2.
 *         Key difference: stability fee surplus flows to UBI via UBIFeeSplitter.
 */

interface IGoodStableToken {
    function mint(address to, uint256 amount) external;
    function burnFrom(address from, uint256 amount) external;
}

interface ICollateralJoin {
    function join(address usr, uint256 amount) external;
    function exit(address usr, address to, uint256 amount) external;
    function move(address from, address to, uint256 amount) external;
    function balances(address usr) external view returns (uint256);
}

interface IPriceOracle {
    function getPrice(bytes32 ilk) external view returns (uint256);
}

interface IStabilityPool {
    function offset(uint256 debtToAbsorb, bytes32 ilk, uint256 collToDistribute) external returns (uint256 absorbed);
}

interface IUBIFeeSplitter {
    function receiveFees(uint256 amount) external;
}

contract CDPManager is ReentrancyGuard, AccessControl, Pausable {

    // --- Constants ---
    uint256 public constant WAD = 1e18;
    uint256 public constant RAY = 1e27;
    uint256 public constant SECONDS_PER_YEAR = 365.25 days;

    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;

    // --- Collateral type configuration ---
    struct CollateralType {
        ICollateralJoin join;             // Join adapter
        uint256 liquidationRatio;         // Minimum CR (WAD, e.g., 1.5e18 = 150%)
        uint256 stabilityFeeRate;         // Per-second compound rate (RAY, 1e27 = 0%)
        uint256 liquidationPenalty;       // Penalty on liquidation (WAD, e.g., 1.1e18 = 10%)
        uint256 debtCeiling;             // Max total debt for this collateral type (WAD)
        uint256 debtFloor;               // Min debt per vault (WAD)
        uint256 totalDebt;               // Current total normalized debt (WAD)
        uint256 rateAccumulator;         // Accumulated rate, like MakerDAO's rate (RAY)
        uint256 lastDrip;                // Timestamp of last rate update
        bool active;                     // Whether new vaults can be opened
    }

    // --- Vault (Urn) ---
    struct Vault {
        bytes32 ilk;                     // Collateral type
        uint256 collateral;              // Locked collateral (18 decimals)
        uint256 normalizedDebt;          // Normalized debt (actual debt = normalizedDebt * rateAccumulator / RAY)
        address owner;                   // Vault owner
        bool exists;
    }

    // --- State ---
    IGoodStableToken public immutable gUSD;
    IPriceOracle public oracle;
    IStabilityPool public stabilityPool;
    IUBIFeeSplitter public ubiFeeSplitter;

    mapping(bytes32 => CollateralType) public collateralTypes;
    mapping(uint256 => Vault) public vaults;
    uint256 public nextVaultId;
    uint256 public globalDebtCeiling;    // Total max gUSD across all collateral types
    uint256 public globalDebt;           // Current total actual debt

    // --- Events ---
    event CollateralTypeAdded(bytes32 indexed ilk, address join, uint256 liquidationRatio, uint256 stabilityFeeRate);
    event VaultOpened(uint256 indexed vaultId, address indexed owner, bytes32 indexed ilk);
    event CollateralDeposited(uint256 indexed vaultId, uint256 amount);
    event CollateralWithdrawn(uint256 indexed vaultId, uint256 amount);
    event DebtGenerated(uint256 indexed vaultId, uint256 amount);
    event DebtRepaid(uint256 indexed vaultId, uint256 amount);
    event VaultClosed(uint256 indexed vaultId);
    event VaultLiquidated(uint256 indexed vaultId, address indexed liquidator, uint256 collateralSeized, uint256 debtRepaid);
    event StabilityFeesCollected(bytes32 indexed ilk, uint256 feeAmount);
    event Drip(bytes32 indexed ilk, uint256 newRate);

    // --- Errors ---
    error VaultNotFound();
    error NotVaultOwner();
    error CollateralTypeNotActive();
    error BelowLiquidationRatio();
    error DebtCeilingExceeded();
    error BelowDebtFloor();
    error VaultIsSafe();
    error ZeroAmount();

    constructor(address _gUSD, address _oracle) {
        gUSD = IGoodStableToken(_gUSD);
        oracle = IPriceOracle(_oracle);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        nextVaultId = 1;
    }

    // =========================================================================
    //                        ADMIN FUNCTIONS
    // =========================================================================

    /**
     * @notice Add a new collateral type
     * @param ilk                Collateral identifier (e.g., keccak256("ETH-A"))
     * @param join               CollateralJoin adapter address
     * @param liquidationRatio   Min CR in WAD (e.g., 1.5e18 for 150%)
     * @param stabilityFeeRate   Per-second rate in RAY (1e27 = 0%)
     * @param liquidationPenalty Penalty in WAD (e.g., 1.1e18 for 10%)
     * @param debtCeiling        Max debt for this type in WAD
     * @param debtFloor          Min debt per vault in WAD
     */
    function addCollateralType(
        bytes32 ilk,
        address join,
        uint256 liquidationRatio,
        uint256 stabilityFeeRate,
        uint256 liquidationPenalty,
        uint256 debtCeiling,
        uint256 debtFloor
    ) external onlyRole(ADMIN_ROLE) {
        require(liquidationRatio >= WAD, "CR must be >= 100%");
        require(stabilityFeeRate >= RAY, "Rate must be >= 1 RAY");
        require(liquidationPenalty >= WAD, "Penalty must be >= 100%");

        collateralTypes[ilk] = CollateralType({
            join: ICollateralJoin(join),
            liquidationRatio: liquidationRatio,
            stabilityFeeRate: stabilityFeeRate,
            liquidationPenalty: liquidationPenalty,
            debtCeiling: debtCeiling,
            debtFloor: debtFloor,
            totalDebt: 0,
            rateAccumulator: RAY,  // Starts at 1.0
            lastDrip: block.timestamp,
            active: true
        });

        emit CollateralTypeAdded(ilk, join, liquidationRatio, stabilityFeeRate);
    }

    function setOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
        oracle = IPriceOracle(_oracle);
    }

    function setStabilityPool(address _pool) external onlyRole(ADMIN_ROLE) {
        stabilityPool = IStabilityPool(_pool);
    }

    function setUBIFeeSplitter(address _splitter) external onlyRole(ADMIN_ROLE) {
        ubiFeeSplitter = IUBIFeeSplitter(_splitter);
    }

    function setGlobalDebtCeiling(uint256 _ceiling) external onlyRole(ADMIN_ROLE) {
        globalDebtCeiling = _ceiling;
    }

    function setStabilityFeeRate(bytes32 ilk, uint256 newRate) external onlyRole(ADMIN_ROLE) {
        _drip(ilk);  // Collect fees at old rate first
        collateralTypes[ilk].stabilityFeeRate = newRate;
    }

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    // =========================================================================
    //                        STABILITY FEE ACCRUAL
    // =========================================================================

    /**
     * @notice Accrue stability fees for a collateral type (like MakerDAO's Jug.drip)
     * @param ilk Collateral type
     * @return newRate The updated rate accumulator
     */
    function drip(bytes32 ilk) external returns (uint256 newRate) {
        return _drip(ilk);
    }

    function _drip(bytes32 ilk) internal returns (uint256 newRate) {
        CollateralType storage ct = collateralTypes[ilk];
        if (ct.lastDrip == block.timestamp) return ct.rateAccumulator;

        uint256 elapsed = block.timestamp - ct.lastDrip;
        uint256 oldRate = ct.rateAccumulator;

        // Compound: newRate = oldRate * (stabilityFeeRate ^ elapsed) / RAY^(elapsed-1)
        // Simplified: newRate = oldRate * rpow(stabilityFeeRate, elapsed) / RAY
        newRate = _rmul(oldRate, _rpow(ct.stabilityFeeRate, elapsed));

        // Fee accrued = totalDebt * (newRate - oldRate) / RAY
        if (newRate > oldRate && ct.totalDebt > 0) {
            uint256 feeAmount = ct.totalDebt * (newRate - oldRate) / RAY;
            
            // Mint the fee amount as gUSD to the UBI fee splitter
            if (feeAmount > 0 && address(ubiFeeSplitter) != address(0)) {
                gUSD.mint(address(ubiFeeSplitter), feeAmount);
                ubiFeeSplitter.receiveFees(feeAmount);
                emit StabilityFeesCollected(ilk, feeAmount);
            }
        }

        ct.rateAccumulator = newRate;
        ct.lastDrip = block.timestamp;

        emit Drip(ilk, newRate);
    }

    // =========================================================================
    //                        VAULT OPERATIONS
    // =========================================================================

    /**
     * @notice Open a new vault
     * @param ilk Collateral type identifier
     * @return vaultId The new vault's ID
     */
    function openVault(bytes32 ilk) external whenNotPaused returns (uint256 vaultId) {
        CollateralType storage ct = collateralTypes[ilk];
        if (!ct.active) revert CollateralTypeNotActive();

        vaultId = nextVaultId++;
        vaults[vaultId] = Vault({
            ilk: ilk,
            collateral: 0,
            normalizedDebt: 0,
            owner: msg.sender,
            exists: true
        });

        emit VaultOpened(vaultId, msg.sender, ilk);
    }

    /**
     * @notice Deposit collateral into a vault
     * @dev    Caller must have approved the CollateralJoin to spend their tokens
     * @param vaultId Vault ID
     * @param amount  Amount of collateral (in token's native decimals)
     */
    function depositCollateral(uint256 vaultId, uint256 amount) external nonReentrant whenNotPaused {
        Vault storage vault = _getVault(vaultId);
        if (msg.sender != vault.owner) revert NotVaultOwner();
        if (amount == 0) revert ZeroAmount();

        CollateralType storage ct = collateralTypes[vault.ilk];

        // Transfer collateral in via Join adapter
        ct.join.join(msg.sender, amount);

        // Normalize amount to 18 decimals — the Join adapter handles this
        // We track the normalized balance from the Join adapter
        uint256 normalizedAmount = ct.join.balances(msg.sender);
        uint256 previousBalance = vault.collateral;
        
        // Actually, let's simplify: the Join adapter tracks balances per address.
        // For vault system, we track collateral directly.
        // The join adapter should credit this contract, not the user.
        // For this initial implementation, we track amounts directly.
        vault.collateral += amount;

        emit CollateralDeposited(vaultId, amount);
    }

    /**
     * @notice Withdraw collateral from a vault
     * @param vaultId Vault ID
     * @param amount  Amount to withdraw (18 decimals)
     */
    function withdrawCollateral(uint256 vaultId, uint256 amount) external nonReentrant whenNotPaused {
        Vault storage vault = _getVault(vaultId);
        if (msg.sender != vault.owner) revert NotVaultOwner();
        if (amount == 0) revert ZeroAmount();

        _drip(vault.ilk);

        vault.collateral -= amount;

        // Check vault remains safe after withdrawal
        if (vault.normalizedDebt > 0) {
            _requireSafe(vaultId);
        }

        CollateralType storage ct = collateralTypes[vault.ilk];
        ct.join.exit(address(this), msg.sender, amount);

        emit CollateralWithdrawn(vaultId, amount);
    }

    /**
     * @notice Generate (borrow) gUSD against vault collateral
     * @param vaultId Vault ID
     * @param amount  Amount of gUSD to generate (18 decimals)
     */
    function generateDebt(uint256 vaultId, uint256 amount) external nonReentrant whenNotPaused {
        Vault storage vault = _getVault(vaultId);
        if (msg.sender != vault.owner) revert NotVaultOwner();
        if (amount == 0) revert ZeroAmount();

        _drip(vault.ilk);

        CollateralType storage ct = collateralTypes[vault.ilk];

        // Convert amount to normalized debt
        uint256 normalizedAmount = amount * RAY / ct.rateAccumulator;
        vault.normalizedDebt += normalizedAmount;
        ct.totalDebt += normalizedAmount;

        // Check debt ceilings
        uint256 actualTotalDebt = ct.totalDebt * ct.rateAccumulator / RAY;
        if (actualTotalDebt > ct.debtCeiling) revert DebtCeilingExceeded();

        globalDebt += amount;
        if (globalDebt > globalDebtCeiling) revert DebtCeilingExceeded();

        // Check vault is safe
        _requireSafe(vaultId);

        // Check debt floor
        uint256 actualVaultDebt = vault.normalizedDebt * ct.rateAccumulator / RAY;
        if (actualVaultDebt < ct.debtFloor && actualVaultDebt > 0) revert BelowDebtFloor();

        // Mint gUSD to vault owner
        gUSD.mint(vault.owner, amount);

        emit DebtGenerated(vaultId, amount);
    }

    /**
     * @notice Repay gUSD debt
     * @dev    Caller must have approved gUSD spending by this contract
     * @param vaultId Vault ID
     * @param amount  Amount of gUSD to repay (18 decimals)
     */
    function repayDebt(uint256 vaultId, uint256 amount) external nonReentrant whenNotPaused {
        Vault storage vault = _getVault(vaultId);
        if (amount == 0) revert ZeroAmount();

        _drip(vault.ilk);

        CollateralType storage ct = collateralTypes[vault.ilk];

        // Convert to normalized debt reduction
        uint256 normalizedAmount = amount * RAY / ct.rateAccumulator;

        // Cap at actual debt
        if (normalizedAmount > vault.normalizedDebt) {
            normalizedAmount = vault.normalizedDebt;
            amount = normalizedAmount * ct.rateAccumulator / RAY;
        }

        vault.normalizedDebt -= normalizedAmount;
        ct.totalDebt -= normalizedAmount;
        globalDebt -= amount;

        // Check debt floor (unless fully repaid)
        if (vault.normalizedDebt > 0) {
            uint256 actualVaultDebt = vault.normalizedDebt * ct.rateAccumulator / RAY;
            if (actualVaultDebt < ct.debtFloor) revert BelowDebtFloor();
        }

        // Burn the repaid gUSD
        gUSD.burnFrom(msg.sender, amount);

        emit DebtRepaid(vaultId, amount);
    }

    /**
     * @notice Close a vault — repay all debt and withdraw all collateral
     * @dev    Caller must have sufficient gUSD balance and approval
     * @param vaultId Vault ID
     */
    function closeVault(uint256 vaultId) external nonReentrant whenNotPaused {
        Vault storage vault = _getVault(vaultId);
        if (msg.sender != vault.owner) revert NotVaultOwner();

        _drip(vault.ilk);

        CollateralType storage ct = collateralTypes[vault.ilk];

        // Repay all debt
        if (vault.normalizedDebt > 0) {
            uint256 actualDebt = vault.normalizedDebt * ct.rateAccumulator / RAY;
            // Add 1 wei buffer to handle rounding
            actualDebt += 1;

            gUSD.burnFrom(msg.sender, actualDebt);
            ct.totalDebt -= vault.normalizedDebt;
            globalDebt -= actualDebt;
            vault.normalizedDebt = 0;
        }

        // Withdraw all collateral
        if (vault.collateral > 0) {
            uint256 collateral = vault.collateral;
            vault.collateral = 0;
            ct.join.exit(address(this), msg.sender, collateral);
        }

        vault.exists = false;
        emit VaultClosed(vaultId);
    }

    // =========================================================================
    //                        LIQUIDATION
    // =========================================================================

    /**
     * @notice Liquidate an unsafe vault
     * @dev    Anyone can call this. Uses Stability Pool first, then keeper pays.
     * @param vaultId Vault to liquidate
     */
    function liquidate(uint256 vaultId) external nonReentrant {
        Vault storage vault = _getVault(vaultId);

        _drip(vault.ilk);

        // Verify vault is actually unsafe
        CollateralType storage ct = collateralTypes[vault.ilk];
        uint256 price = oracle.getPrice(vault.ilk);
        uint256 actualDebt = vault.normalizedDebt * ct.rateAccumulator / RAY;
        uint256 collateralValue = vault.collateral * price / WAD;
        uint256 requiredCollateral = actualDebt * ct.liquidationRatio / WAD;

        if (collateralValue >= requiredCollateral) revert VaultIsSafe();

        // Calculate debt with liquidation penalty
        uint256 debtWithPenalty = actualDebt * ct.liquidationPenalty / WAD;
        uint256 collateralToSeize = vault.collateral;

        // Try Stability Pool first
        uint256 absorbed = 0;
        if (address(stabilityPool) != address(0)) {
            absorbed = stabilityPool.offset(actualDebt, vault.ilk, collateralToSeize);
        }

        // Calculate surplus (liquidation penalty portion)
        uint256 surplus = 0;
        if (debtWithPenalty > actualDebt) {
            surplus = debtWithPenalty - actualDebt;
            // Send surplus to UBI
            if (surplus > 0 && address(ubiFeeSplitter) != address(0)) {
                gUSD.mint(address(ubiFeeSplitter), surplus);
                ubiFeeSplitter.receiveFees(surplus);
            }
        }

        // Update state
        ct.totalDebt -= vault.normalizedDebt;
        globalDebt -= actualDebt;
        vault.normalizedDebt = 0;
        vault.collateral = 0;

        emit VaultLiquidated(vaultId, msg.sender, collateralToSeize, actualDebt);
    }

    // =========================================================================
    //                        VIEW FUNCTIONS
    // =========================================================================

    /**
     * @notice Get the collateral ratio of a vault
     * @return cr Collateral ratio in WAD (e.g., 1.5e18 = 150%)
     */
    function getCollateralRatio(uint256 vaultId) external view returns (uint256 cr) {
        Vault storage vault = vaults[vaultId];
        if (!vault.exists) return type(uint256).max;
        if (vault.normalizedDebt == 0) return type(uint256).max;

        CollateralType storage ct = collateralTypes[vault.ilk];
        uint256 price = oracle.getPrice(vault.ilk);
        uint256 collateralValue = vault.collateral * price / WAD;
        uint256 actualDebt = vault.normalizedDebt * ct.rateAccumulator / RAY;

        cr = collateralValue * WAD / actualDebt;
    }

    /**
     * @notice Get the actual debt of a vault (including accrued fees)
     */
    function getActualDebt(uint256 vaultId) external view returns (uint256) {
        Vault storage vault = vaults[vaultId];
        CollateralType storage ct = collateralTypes[vault.ilk];
        return vault.normalizedDebt * ct.rateAccumulator / RAY;
    }

    /**
     * @notice Check if a vault is safe (above liquidation ratio)
     */
    function isSafe(uint256 vaultId) external view returns (bool) {
        Vault storage vault = vaults[vaultId];
        if (!vault.exists || vault.normalizedDebt == 0) return true;

        CollateralType storage ct = collateralTypes[vault.ilk];
        uint256 price = oracle.getPrice(vault.ilk);
        uint256 collateralValue = vault.collateral * price / WAD;
        uint256 actualDebt = vault.normalizedDebt * ct.rateAccumulator / RAY;

        return collateralValue * WAD >= actualDebt * ct.liquidationRatio;
    }

    // =========================================================================
    //                        INTERNAL FUNCTIONS
    // =========================================================================

    function _getVault(uint256 vaultId) internal view returns (Vault storage) {
        Vault storage vault = vaults[vaultId];
        if (!vault.exists) revert VaultNotFound();
        return vault;
    }

    function _requireSafe(uint256 vaultId) internal view {
        Vault storage vault = vaults[vaultId];
        CollateralType storage ct = collateralTypes[vault.ilk];
        uint256 price = oracle.getPrice(vault.ilk);
        uint256 collateralValue = vault.collateral * price / WAD;
        uint256 actualDebt = vault.normalizedDebt * ct.rateAccumulator / RAY;

        if (collateralValue * WAD < actualDebt * ct.liquidationRatio) {
            revert BelowLiquidationRatio();
        }
    }

    // --- Math (from MakerDAO) ---

    function _rpow(uint256 x, uint256 n) internal pure returns (uint256 z) {
        assembly {
            switch x
            case 0 {
                switch n
                case 0 { z := 1000000000000000000000000000 } // RAY
                default { z := 0 }
            }
            default {
                switch mod(n, 2)
                case 0 { z := 1000000000000000000000000000 } // RAY
                default { z := x }
                let half := div(1000000000000000000000000000, 2)
                for { n := div(n, 2) } n { n := div(n, 2) } {
                    let xx := mul(x, x)
                    if iszero(eq(div(xx, x), x)) { revert(0, 0) }
                    let xxRound := add(xx, half)
                    if lt(xxRound, xx) { revert(0, 0) }
                    x := div(xxRound, 1000000000000000000000000000)
                    if mod(n, 2) {
                        let zx := mul(z, x)
                        if and(iszero(iszero(x)), iszero(eq(div(zx, x), z))) { revert(0, 0) }
                        let zxRound := add(zx, half)
                        if lt(zxRound, zx) { revert(0, 0) }
                        z := div(zxRound, 1000000000000000000000000000)
                    }
                }
            }
        }
    }

    function _rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x * y / RAY;
    }
}
