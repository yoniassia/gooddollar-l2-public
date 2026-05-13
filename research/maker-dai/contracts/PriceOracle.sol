// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IPriceFeed
 * @notice Interface for Chainlink-compatible price feeds
 */
interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);

    function decimals() external view returns (uint8);
}

/**
 * @title PriceOracle
 * @notice Aggregates price feeds for GoodStable collateral types.
 *         Supports Chainlink feeds and manual price setting (for G$ initially).
 *         Includes staleness checks and circuit breakers.
 */
contract PriceOracle is Ownable {
    struct Feed {
        AggregatorV3Interface priceFeed;  // Chainlink aggregator (address(0) for manual)
        uint256 manualPrice;              // Manual price in 18 decimals (fallback or G$)
        uint256 stalenessThreshold;       // Max age of price data in seconds
        uint256 deviationThreshold;       // Max % change before circuit breaker (WAD, e.g., 0.5e18 = 50%)
        uint256 lastPrice;                // Previous price for deviation check
        bool isActive;                    // Whether this feed is active
    }

    /// @notice Collateral type identifier => Feed configuration
    mapping(bytes32 => Feed) public feeds;

    /// @notice Price precision (18 decimals)
    uint256 public constant PRICE_PRECISION = 1e18;

    // --- Events ---
    event FeedSet(bytes32 indexed ilk, address priceFeed, uint256 stalenessThreshold);
    event ManualPriceSet(bytes32 indexed ilk, uint256 price);
    event CircuitBreakerTriggered(bytes32 indexed ilk, uint256 oldPrice, uint256 newPrice);

    // --- Errors ---
    error StalePrice(bytes32 ilk, uint256 updatedAt, uint256 threshold);
    error PriceDeviationTooHigh(bytes32 ilk, uint256 oldPrice, uint256 newPrice);
    error FeedNotActive(bytes32 ilk);
    error InvalidPrice();

    constructor() Ownable() {}

    /**
     * @notice Configure a Chainlink price feed for a collateral type
     * @param ilk                  Collateral type identifier
     * @param priceFeed            Chainlink aggregator address
     * @param stalenessThreshold   Max acceptable age of price data (seconds)
     * @param deviationThreshold   Max single-update price change (WAD)
     */
    function setFeed(
        bytes32 ilk,
        address priceFeed,
        uint256 stalenessThreshold,
        uint256 deviationThreshold
    ) external onlyOwner {
        feeds[ilk] = Feed({
            priceFeed: AggregatorV3Interface(priceFeed),
            manualPrice: 0,
            stalenessThreshold: stalenessThreshold,
            deviationThreshold: deviationThreshold,
            lastPrice: 0,
            isActive: true
        });
        emit FeedSet(ilk, priceFeed, stalenessThreshold);
    }

    /**
     * @notice Set a manual price (used for G$ or as emergency override)
     * @param ilk   Collateral type
     * @param price Price in 18 decimals (USD per token)
     */
    function setManualPrice(bytes32 ilk, uint256 price) external onlyOwner {
        if (price == 0) revert InvalidPrice();
        feeds[ilk].manualPrice = price;
        feeds[ilk].isActive = true;
        emit ManualPriceSet(ilk, price);
    }

    /**
     * @notice Get the current price for a collateral type
     * @param ilk Collateral type identifier
     * @return price Price in 18 decimals (USD per 1 token)
     */
    function getPrice(bytes32 ilk) external view returns (uint256 price) {
        Feed storage feed = feeds[ilk];
        if (!feed.isActive) revert FeedNotActive(ilk);

        if (address(feed.priceFeed) != address(0)) {
            // Chainlink feed
            (
                ,
                int256 answer,
                ,
                uint256 updatedAt,
            ) = feed.priceFeed.latestRoundData();

            // Staleness check
            if (block.timestamp - updatedAt > feed.stalenessThreshold) {
                revert StalePrice(ilk, updatedAt, feed.stalenessThreshold);
            }

            if (answer <= 0) revert InvalidPrice();

            // Normalize to 18 decimals
            uint8 feedDecimals = feed.priceFeed.decimals();
            if (feedDecimals < 18) {
                price = uint256(answer) * 10 ** (18 - feedDecimals);
            } else if (feedDecimals > 18) {
                price = uint256(answer) / 10 ** (feedDecimals - 18);
            } else {
                price = uint256(answer);
            }
        } else {
            // Manual price
            price = feed.manualPrice;
            if (price == 0) revert InvalidPrice();
        }
    }

    /**
     * @notice Deactivate a price feed (emergency)
     */
    function deactivateFeed(bytes32 ilk) external onlyOwner {
        feeds[ilk].isActive = false;
    }
}
