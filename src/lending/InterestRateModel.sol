// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title InterestRateModel
 * @notice Two-slope (kink) interest rate model inspired by Aave V3 / Compound.
 *         Rates are expressed as per-second values in RAY (1e27) precision.
 * @dev    When utilization <= optimalUtilization:
 *           borrowRate = baseRate + slope1 * (utilization / optimalUtilization)
 *         When utilization >  optimalUtilization:
 *           borrowRate = baseRate + slope1 + slope2 * ((utilization - optimal) / (1 - optimal))
 *
 *         supplyRate = borrowRate * utilization * (1 - reserveFactor)
 */
contract InterestRateModel {
    // All rates are annual, stored as RAY (1e27 = 100%)
    uint256 public constant RAY = 1e27;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    struct RateParams {
        uint256 optimalUtilization;   // RAY — e.g., 0.80e27 = 80%
        uint256 baseVariableRate;     // RAY annual
        uint256 variableSlope1;       // RAY annual
        uint256 variableSlope2;       // RAY annual
    }

    /// @notice Parameters keyed by asset address
    mapping(address => RateParams) public rateParams;

    address public admin;

    event RateParamsSet(address indexed asset, uint256 optimal, uint256 base, uint256 slope1, uint256 slope2);

    modifier onlyAdmin() {
        require(msg.sender == admin, "InterestRateModel: not admin");
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function setRateParams(
        address asset,
        uint256 optimalUtilization,
        uint256 baseVariableRate,
        uint256 variableSlope1,
        uint256 variableSlope2
    ) external onlyAdmin {
        require(optimalUtilization > 0 && optimalUtilization < RAY, "bad optimal");
        rateParams[asset] = RateParams({
            optimalUtilization: optimalUtilization,
            baseVariableRate: baseVariableRate,
            variableSlope1: variableSlope1,
            variableSlope2: variableSlope2
        });
        emit RateParamsSet(asset, optimalUtilization, baseVariableRate, variableSlope1, variableSlope2);
    }

    /**
     * @notice Calculate borrow and supply rates.
     * @param asset            The reserve asset.
     * @param totalDeposits    Total deposited (available + borrowed).
     * @param totalBorrows     Total borrowed.
     * @param reserveFactorBPS Reserve factor in basis points (e.g., 2000 = 20%).
     * @return borrowRate  Annual borrow rate (RAY).
     * @return supplyRate  Annual supply rate (RAY).
     */
    function calculateRates(
        address asset,
        uint256 totalDeposits,
        uint256 totalBorrows,
        uint256 reserveFactorBPS
    ) external view returns (uint256 borrowRate, uint256 supplyRate) {
        RateParams memory p = rateParams[asset];
        if (p.optimalUtilization == 0) {
            // No params set — return 0
            return (0, 0);
        }
        if (totalDeposits == 0) {
            return (p.baseVariableRate, 0);
        }

        uint256 utilization = (totalBorrows * RAY) / totalDeposits;
        if (utilization > RAY) utilization = RAY;

        if (utilization <= p.optimalUtilization) {
            // Below kink
            borrowRate = p.baseVariableRate + (p.variableSlope1 * utilization) / p.optimalUtilization;
        } else {
            // Above kink
            uint256 excessUtilization = utilization - p.optimalUtilization;
            uint256 maxExcess = RAY - p.optimalUtilization;
            borrowRate = p.baseVariableRate + p.variableSlope1 + (p.variableSlope2 * excessUtilization) / maxExcess;
        }

        // supplyRate = borrowRate * utilization * (1 - reserveFactor)
        uint256 reserveFactorRay = (reserveFactorBPS * RAY) / 10_000;
        supplyRate = (borrowRate * utilization / RAY) * (RAY - reserveFactorRay) / RAY;
    }

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }
}
