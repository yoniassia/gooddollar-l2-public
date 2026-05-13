// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CollateralRegistry
 * @notice Registry for approved collateral types (ilks) used by VaultManager.
 *
 * Precision:
 *   - liquidationRatio    : WAD (1e18) e.g. 1.5e18 = 150%
 *   - liquidationPenalty  : WAD (1e18) e.g. 0.13e18 = 13% penalty on seized collateral value
 *   - debtCeiling         : absolute gUSD amount (18 decimals)
 *   - stabilityFeeRate    : RAY (1e27) per-second accumulator factor
 *                           e.g. 1000000000315522921573372069 ≈ 1% APY
 *
 * Default ilks seeded in constructor:
 *   ETH  : 150% liquidation ratio
 *   G$   : 200% liquidation ratio
 *   USDC : 101% liquidation ratio
 */
contract CollateralRegistry {
    // ============ Constants ============

    uint256 public constant WAD = 1e18;
    uint256 public constant RAY = 1e27;

    /// @dev 0% fee per second in RAY  (rate = RAY means no fee growth)
    uint256 public constant ZERO_FEE_RATE = RAY;

    // ============ Structs ============

    struct CollateralConfig {
        address token;              // ERC-20 token address (address(0) for native ETH)
        uint256 liquidationRatio;   // WAD — minimum collateral/debt ratio
        uint256 liquidationPenalty; // WAD — extra penalty taken from seized collateral
        uint256 debtCeiling;        // absolute gUSD ceiling for this ilk
        uint256 stabilityFeeRate;   // RAY per-second rate multiplier
        bool    active;             // whether new vaults can be opened
    }

    // ============ State ============

    address public admin;
    bytes32[] public ilkList;
    mapping(bytes32 => CollateralConfig) private _configs;
    mapping(bytes32 => bool) private _exists;

    // ============ Events ============

    event IlkAdded(bytes32 indexed ilk, address token, uint256 liquidationRatio);
    event IlkUpdated(bytes32 indexed ilk);
    event IlkActivated(bytes32 indexed ilk, bool active);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ============ Constructor ============

    constructor(address _admin, address ethToken, address gdToken, address usdcToken) {
        require(_admin != address(0), "Registry: zero admin");
        admin = _admin;

        // Seed ETH ilk — 150% ratio, 13% penalty, ~2% APY fee
        _addIlk(
            "ETH",
            ethToken,
            15e17,               // 1.5e18  — 150%
            13e16,               // 0.13e18 — 13% penalty
            1_000_000e18,        // 1M gUSD debt ceiling
            1000000000627937192433212422  // ~2% APY in RAY per-second
        );

        // Seed G$ ilk — 200% ratio, 15% penalty, ~3% APY fee
        _addIlk(
            "GD",
            gdToken,
            2e18,                // 2.0e18  — 200%
            15e16,               // 0.15e18 — 15% penalty
            500_000e18,          // 500k gUSD debt ceiling
            1000000000951293759512929108  // ~3% APY in RAY per-second
        );

        // Seed USDC ilk — 101% ratio, 1% penalty, ~0.5% APY fee
        _addIlk(
            "USDC",
            usdcToken,
            101e16,              // 1.01e18 — 101%
            1e16,                // 0.01e18 — 1% penalty
            10_000_000e18,       // 10M gUSD debt ceiling
            1000000000158153903837946258  // ~0.5% APY in RAY per-second
        );
    }

    // ============ Modifiers ============

    modifier onlyAdmin() {
        require(msg.sender == admin, "Registry: not admin");
        _;
    }

    // ============ Internal helpers ============

    function _addIlk(
        bytes32 ilk,
        address token,
        uint256 liquidationRatio,
        uint256 liquidationPenalty,
        uint256 debtCeiling,
        uint256 stabilityFeeRate
    ) internal {
        require(!_exists[ilk], "Registry: ilk exists");
        require(liquidationRatio >= WAD, "Registry: ratio below 1");
        require(stabilityFeeRate >= RAY,  "Registry: fee rate below RAY");

        _configs[ilk] = CollateralConfig({
            token:             token,
            liquidationRatio:  liquidationRatio,
            liquidationPenalty: liquidationPenalty,
            debtCeiling:       debtCeiling,
            stabilityFeeRate:  stabilityFeeRate,
            active:            true
        });
        _exists[ilk] = true;
        ilkList.push(ilk);

        emit IlkAdded(ilk, token, liquidationRatio);
    }

    // ============ Admin ============

    /**
     * @notice Add a new collateral type.
     */
    function addIlk(
        bytes32 ilk,
        address token,
        uint256 liquidationRatio,
        uint256 liquidationPenalty,
        uint256 debtCeiling,
        uint256 stabilityFeeRate
    ) external onlyAdmin {
        _addIlk(ilk, token, liquidationRatio, liquidationPenalty, debtCeiling, stabilityFeeRate);
    }

    /**
     * @notice Update an existing ilk's configuration parameters.
     */
    function updateIlk(
        bytes32 ilk,
        uint256 liquidationRatio,
        uint256 liquidationPenalty,
        uint256 debtCeiling,
        uint256 stabilityFeeRate
    ) external onlyAdmin {
        require(_exists[ilk], "Registry: ilk not found");
        require(liquidationRatio >= WAD, "Registry: ratio below 1");
        require(stabilityFeeRate >= RAY,  "Registry: fee rate below RAY");

        CollateralConfig storage cfg = _configs[ilk];
        cfg.liquidationRatio   = liquidationRatio;
        cfg.liquidationPenalty = liquidationPenalty;
        cfg.debtCeiling        = debtCeiling;
        cfg.stabilityFeeRate   = stabilityFeeRate;

        emit IlkUpdated(ilk);
    }

    function setIlkActive(bytes32 ilk, bool active) external onlyAdmin {
        require(_exists[ilk], "Registry: ilk not found");
        _configs[ilk].active = active;
        emit IlkActivated(ilk, active);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Registry: zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // ============ Views ============

    function getConfig(bytes32 ilk) external view returns (CollateralConfig memory) {
        require(_exists[ilk], "Registry: ilk not found");
        return _configs[ilk];
    }

    function ilkExists(bytes32 ilk) external view returns (bool) {
        return _exists[ilk];
    }

    function ilkCount() external view returns (uint256) {
        return ilkList.length;
    }
}
