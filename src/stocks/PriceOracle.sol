// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GoodStocks Price Oracle
 * @notice Aggregates Chainlink price feeds for synthetic stock assets.
 *         Returns USD prices with 8-decimal precision (Chainlink standard).
 * @dev Admin maps ticker symbols to Chainlink AggregatorV3 feed addresses.
 *      Includes staleness check: prices older than maxAge are rejected.
 */

/// @notice Minimal Chainlink AggregatorV3 interface
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract PriceOracle {
    // ============ State ============

    address public admin;

    /// @notice ticker → Chainlink feed address
    mapping(bytes32 => address) public priceFeeds;

    /// @notice ticker → manually overridden price (used in testing / fallback)
    mapping(bytes32 => uint256) public manualPrices;

    /// @notice ticker → whether manual price is active
    mapping(bytes32 => bool) public useManualPrice;

    /// @notice Maximum age for a price to be considered fresh (default 1 hour)
    uint256 public maxAge = 1 hours;

    // ============ Events ============

    event FeedRegistered(string indexed ticker, address feed);
    event FeedRemoved(string indexed ticker);
    event ManualPriceSet(string indexed ticker, uint256 price);
    event MaxAgeUpdated(uint256 oldAge, uint256 newAge);

    // ============ Errors ============

    error NotAdmin();
    error ZeroAddress();
    error FeedNotFound(bytes32 ticker);
    error StalePrice(bytes32 ticker, uint256 updatedAt, uint256 currentTime);
    error NegativePrice(bytes32 ticker);
    error ZeroPrice(bytes32 ticker);

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ============ Constructor ============

    constructor(address _admin) {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
    }

    // ============ Admin: Feed Management ============

    /**
     * @notice Register a Chainlink price feed for a ticker symbol
     * @param ticker Stock ticker (e.g., "AAPL", "MSFT")
     * @param feed Chainlink AggregatorV3Interface address
     */
    function registerFeed(string calldata ticker, address feed) external onlyAdmin {
        if (feed == address(0)) revert ZeroAddress();
        bytes32 key = _key(ticker);
        priceFeeds[key] = feed;
        emit FeedRegistered(ticker, feed);
    }

    /**
     * @notice Remove a price feed
     */
    function removeFeed(string calldata ticker) external onlyAdmin {
        bytes32 key = _key(ticker);
        delete priceFeeds[key];
        delete useManualPrice[key];
        emit FeedRemoved(ticker);
    }

    /**
     * @notice Set a manual price override (for testing / emergency fallback)
     * @param ticker Stock ticker
     * @param price USD price with 8 decimals (e.g., 17234500000000 = $172345.00)
     * @param active Whether to use this price instead of Chainlink
     */
    function setManualPrice(string calldata ticker, uint256 price, bool active) external onlyAdmin {
        bytes32 key = _key(ticker);
        manualPrices[key] = price;
        useManualPrice[key] = active;
        emit ManualPriceSet(ticker, price);
    }

    /**
     * @notice Update maximum price age
     */
    function setMaxAge(uint256 _maxAge) external onlyAdmin {
        emit MaxAgeUpdated(maxAge, _maxAge);
        maxAge = _maxAge;
    }

    /**
     * @notice Transfer admin
     */
    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    // ============ Price Queries ============

    /**
     * @notice Get the current USD price for a ticker (8 decimals)
     * @param ticker Stock ticker symbol
     * @return price USD price with 8 decimal places
     */
    function getPrice(string calldata ticker) external view returns (uint256 price) {
        return _getPrice(_key(ticker));
    }

    /**
     * @notice Get price by pre-hashed key (gas efficient for internal callers)
     */
    function getPriceByKey(bytes32 key) external view returns (uint256) {
        return _getPrice(key);
    }

    /**
     * @notice Check if a ticker has a registered feed
     */
    function hasFeed(string calldata ticker) external view returns (bool) {
        bytes32 key = _key(ticker);
        return priceFeeds[key] != address(0) || useManualPrice[key];
    }

    // ============ Internals ============

    function _getPrice(bytes32 key) internal view returns (uint256) {
        if (useManualPrice[key]) {
            uint256 p = manualPrices[key];
            if (p == 0) revert ZeroPrice(key);
            return p;
        }

        address feed = priceFeeds[key];
        if (feed == address(0)) revert FeedNotFound(key);

        (, int256 answer,, uint256 updatedAt,) = AggregatorV3Interface(feed).latestRoundData();

        if (block.timestamp - updatedAt > maxAge) {
            revert StalePrice(key, updatedAt, block.timestamp);
        }
        if (answer <= 0) revert NegativePrice(key);

        return uint256(answer);
    }

    function _key(string calldata ticker) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(ticker));
    }
}
