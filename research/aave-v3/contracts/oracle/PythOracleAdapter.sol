// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {AggregatorInterface} from "@aave/core-v3/contracts/dependencies/chainlink/AggregatorInterface.sol";

/**
 * @title PythOracleAdapter
 * @notice Adapts Pyth Network price feeds to Chainlink AggregatorInterface
 * @dev AaveOracle expects Chainlink-compatible sources — this bridges the gap
 */
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint publishTime;
    }
    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (Price memory);
    function getPriceUnsafe(bytes32 id) external view returns (Price memory);
}

contract PythOracleAdapter is AggregatorInterface {
    IPyth public immutable pyth;
    bytes32 public immutable priceFeedId;
    uint256 public immutable maxStaleness;
    uint8 public immutable targetDecimals;

    constructor(
        address _pyth,
        bytes32 _priceFeedId,
        uint256 _maxStaleness,
        uint8 _targetDecimals
    ) {
        pyth = IPyth(_pyth);
        priceFeedId = _priceFeedId;
        maxStaleness = _maxStaleness;
        targetDecimals = _targetDecimals;
    }

    function latestAnswer() external view override returns (int256) {
        IPyth.Price memory price = pyth.getPriceNoOlderThan(priceFeedId, maxStaleness);
        int256 normalizedPrice;
        if (price.expo >= 0) {
            normalizedPrice = int256(price.price) * int256(10 ** (uint32(price.expo) + targetDecimals));
        } else {
            uint32 absExpo = uint32(-price.expo);
            if (absExpo > targetDecimals) {
                normalizedPrice = int256(price.price) / int256(10 ** (absExpo - targetDecimals));
            } else {
                normalizedPrice = int256(price.price) * int256(10 ** (targetDecimals - absExpo));
            }
        }
        return normalizedPrice;
    }

    function latestTimestamp() external view override returns (uint256) {
        IPyth.Price memory price = pyth.getPriceUnsafe(priceFeedId);
        return price.publishTime;
    }

    function latestRound() external pure override returns (uint256) {
        return 0;
    }

    function getAnswer(uint256) external view override returns (int256) {
        return this.latestAnswer();
    }

    function getTimestamp(uint256) external view override returns (uint256) {
        return this.latestTimestamp();
    }
}
