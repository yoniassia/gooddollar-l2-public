// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FundingRate
 * @notice Computes and accumulates 8-hour funding payments for perpetual futures.
 *
 *         Funding formula (simplified):
 *           rate = clamp((markPrice - indexPrice) / indexPrice, -0.05%, +0.05%)
 *
 *         Longs pay shorts when mark > index (premium).
 *         Shorts pay longs when mark < index (discount).
 *
 *         The cumulative funding index (per market) lets each position settle
 *         its accrued funding in one step: funding = size * (index_now - index_entry).
 */
contract FundingRate {
    // ============ Constants ============

    uint256 public constant FUNDING_INTERVAL = 8 hours;
    /// @notice Max funding rate per interval: ±0.05% expressed as 1e18 = 100%
    int256 public constant MAX_FUNDING_RATE = 5e14; // 0.05% = 0.0005 * 1e18

    // ============ State ============

    address public admin;
    address public pendingAdmin;
    address public perpEngine;

    /// @notice marketId → cumulative funding index (1e18-scaled, signed)
    mapping(uint256 => int256) public cumulativeFundingIndex;

    /// @notice marketId → last funding timestamp
    mapping(uint256 => uint256) public lastFundingTime;

    // ============ Events ============

    event FundingApplied(uint256 indexed marketId, int256 rate, int256 newIndex, uint256 timestamp);
    event AdminTransferInitiated(address indexed previousAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    // ============ Errors ============

    error NotAdmin();
    error NotPendingAdmin();
    error NotEngine();
    error ZeroAddress();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyEngineOrAdmin() {
        if (msg.sender != perpEngine && msg.sender != admin) revert NotEngine();
        _;
    }

    // ============ Constructor ============

    constructor(address _admin) {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
    }

    // ============ Setup ============

    function setPerpEngine(address engine) external onlyAdmin {
        if (engine == address(0)) revert ZeroAddress();
        perpEngine = engine;
    }

    // ============ Funding Logic ============

    /**
     * @notice Apply funding for a market if an interval has elapsed.
     * @param marketId Market identifier
     * @param markPrice Current mark price (e.g., from TWAP), 8 decimals
     * @param indexPrice Spot index price (Chainlink), 8 decimals
     */
    function applyFunding(uint256 marketId, uint256 markPrice, uint256 indexPrice)
        external
        onlyEngineOrAdmin
        returns (int256 ratePaid)
    {
        uint256 elapsed = block.timestamp - lastFundingTime[marketId];
        if (elapsed < FUNDING_INTERVAL) return 0;

        // Advance by exactly one interval (not to block.timestamp) so that
        // multiple skipped intervals accumulate correctly on future calls.
        lastFundingTime[marketId] += FUNDING_INTERVAL;

        // rate = (mark - index) / index, clamped to ±MAX_FUNDING_RATE
        int256 diff = int256(markPrice) - int256(indexPrice);
        // Scale to 1e18 for precision
        int256 rawRate = (diff * 1e18) / int256(indexPrice);
        ratePaid = _clamp(rawRate, -MAX_FUNDING_RATE, MAX_FUNDING_RATE);

        cumulativeFundingIndex[marketId] += ratePaid;
        emit FundingApplied(marketId, ratePaid, cumulativeFundingIndex[marketId], block.timestamp);
    }

    /**
     * @notice Initialize funding tracking for a new market.
     */
    function initMarket(uint256 marketId) external onlyEngineOrAdmin {
        lastFundingTime[marketId] = block.timestamp;
        cumulativeFundingIndex[marketId] = 0;
    }

    /**
     * @notice Calculate accrued funding for a position.
     * @param size Position size in collateral units (positive = long)
     * @param entryFundingIndex Cumulative index at position open
     * @param marketId Market
     * @return funding Positive = trader pays (long pays in premium), negative = trader receives
     */
    function accruedFunding(int256 size, int256 entryFundingIndex, uint256 marketId)
        external
        view
        returns (int256 funding)
    {
        int256 delta = cumulativeFundingIndex[marketId] - entryFundingIndex;
        // Long pays when delta > 0 (mark > index accumulated)
        // Short receives when delta > 0 (opposite sign due to negative size)
        funding = (size * delta) / 1e18;
    }

    // ============ Internal ============

    function _clamp(int256 val, int256 lo, int256 hi) internal pure returns (int256) {
        if (val < lo) return lo;
        if (val > hi) return hi;
        return val;
    }

    // ============ Admin ============

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        pendingAdmin = newAdmin;
        emit AdminTransferInitiated(admin, newAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert NotPendingAdmin();
        address previous = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferred(previous, admin);
    }
}
