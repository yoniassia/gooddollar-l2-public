// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {DefaultReserveInterestRateStrategy} from
    "@aave/core-v3/contracts/protocol/pool/DefaultReserveInterestRateStrategy.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {WadRayMath} from "@aave/core-v3/contracts/protocol/libraries/math/WadRayMath.sol";

/**
 * @title GoodLendInterestRateStrategy
 * @notice Custom interest rate strategy for G$ with UBI-optimized parameters
 * @dev Extends DefaultReserveInterestRateStrategy with:
 *   - Configurable minimum rate floor for guaranteed UBI generation
 *   - Steeper slope2 to discourage excessive borrowing of G$
 */
contract GoodLendInterestRateStrategy is DefaultReserveInterestRateStrategy {
    using WadRayMath for uint256;

    /// @notice Minimum borrow rate floor (ensures some UBI generation even at low utilization)
    uint256 public immutable MIN_BORROW_RATE;

    constructor(
        IPoolAddressesProvider provider,
        uint256 optimalUsageRatio,
        uint256 baseVariableBorrowRate,
        uint256 variableRateSlope1,
        uint256 variableRateSlope2,
        uint256 stableRateSlope1,
        uint256 stableRateSlope2,
        uint256 baseStableRateOffset,
        uint256 stableRateExcessOffset,
        uint256 optimalStableToTotalDebtRatio,
        uint256 minBorrowRate
    )
        DefaultReserveInterestRateStrategy(
            provider,
            optimalUsageRatio,
            baseVariableBorrowRate,
            variableRateSlope1,
            variableRateSlope2,
            stableRateSlope1,
            stableRateSlope2,
            baseStableRateOffset,
            stableRateExcessOffset,
            optimalStableToTotalDebtRatio
        )
    {
        MIN_BORROW_RATE = minBorrowRate;
    }

    /// @inheritdoc DefaultReserveInterestRateStrategy
    function calculateInterestRates(
        DataTypes.CalculateInterestRatesParams memory params
    ) public view override returns (uint256, uint256, uint256) {
        (
            uint256 liquidityRate,
            uint256 stableBorrowRate,
            uint256 variableBorrowRate
        ) = super.calculateInterestRates(params);

        // Apply minimum borrow rate floor
        if (variableBorrowRate < MIN_BORROW_RATE) {
            variableBorrowRate = MIN_BORROW_RATE;
        }
        if (stableBorrowRate < MIN_BORROW_RATE) {
            stableBorrowRate = MIN_BORROW_RATE;
        }

        return (liquidityRate, stableBorrowRate, variableBorrowRate);
    }
}
