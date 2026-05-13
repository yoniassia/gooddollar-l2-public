// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PerpPriceOracle
 * @notice Multi-source aggregated price oracle for GoodPerps.
 *
 *         The backend OracleAggregator (Pyth + Hyperliquid + Chainlink)
 *         pushes median prices on-chain via updatePrice(). The PerpEngine
 *         reads mark and index prices for margin/liquidation calculations.
 *
 *         Design:
 *           - Authorized keepers push price updates (mark + index)
 *           - Staleness check: reject reads if price older than maxStaleness
 *           - Deviation check: reject updates that deviate >20% from last price
 *           - Emergency: admin can set manual override prices
 *           - Implements IPriceOraclePerp interface for PerpEngine compatibility
 *
 *         Price format: 8 decimals (Chainlink standard). E.g., BTC @ $60,000 = 6_000_000_000_000
 */

interface IPriceOraclePerp {
    function getPriceByKey(bytes32 key) external view returns (uint256);
}

contract PerpPriceOracle is IPriceOraclePerp {

    // ============ Types ============

    struct PriceData {
        uint256 markPrice;      // 8 decimals
        uint256 indexPrice;     // 8 decimals
        uint256 timestamp;      // block.timestamp of last update
        uint8   numSources;     // how many oracle sources contributed
        bool    manualOverride; // true if admin-set, bypasses staleness
    }

    // ============ State ============

    address public admin;
    mapping(address => bool) public keepers;          // authorized price updaters
    mapping(bytes32 => PriceData) public prices;      // market key → price
    mapping(bytes32 => bool) public supportedMarkets; // registered markets

    uint256 public maxStaleness = 120;                // seconds (2 min default)
    uint256 public maxDeviationBps = 2000;            // 20% max deviation per update
    uint256 public constant BPS = 10_000;

    // ============ Events ============

    event PriceUpdated(
        bytes32 indexed key,
        uint256 markPrice,
        uint256 indexPrice,
        uint8 numSources,
        uint256 timestamp
    );
    event ManualPriceSet(bytes32 indexed key, uint256 markPrice, uint256 indexPrice);
    event MarketRegistered(bytes32 indexed key);
    event KeeperUpdated(address indexed keeper, bool authorized);
    event MaxStalenessUpdated(uint256 oldVal, uint256 newVal);
    event MaxDeviationUpdated(uint256 oldVal, uint256 newVal);

    // ============ Errors ============

    error NotAdmin();
    error NotKeeper();
    error ZeroAddress();
    error ZeroPrice();
    error MarketNotSupported(bytes32 key);
    error StalePrice(bytes32 key, uint256 age, uint256 maxAge);
    error DeviationTooLarge(bytes32 key, uint256 oldPrice, uint256 newPrice, uint256 deviationBps);

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyKeeper() {
        if (!keepers[msg.sender] && msg.sender != admin) revert NotKeeper();
        _;
    }

    // ============ Constructor ============

    constructor(address _admin) {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
        keepers[_admin] = true;
    }

    // ============ Admin ============

    function setAdmin(address _admin) external onlyAdmin {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
    }

    function setKeeper(address keeper, bool authorized) external onlyAdmin {
        if (keeper == address(0)) revert ZeroAddress();
        keepers[keeper] = authorized;
        emit KeeperUpdated(keeper, authorized);
    }

    function setMaxStaleness(uint256 _maxStaleness) external onlyAdmin {
        emit MaxStalenessUpdated(maxStaleness, _maxStaleness);
        maxStaleness = _maxStaleness;
    }

    function setMaxDeviation(uint256 _maxDeviationBps) external onlyAdmin {
        emit MaxDeviationUpdated(maxDeviationBps, _maxDeviationBps);
        maxDeviationBps = _maxDeviationBps;
    }

    function registerMarket(bytes32 key) external onlyAdmin {
        supportedMarkets[key] = true;
        emit MarketRegistered(key);
    }

    /**
     * @notice Emergency manual price override (admin only)
     */
    function setManualPrice(bytes32 key, uint256 markPrice, uint256 indexPrice) external onlyAdmin {
        if (!supportedMarkets[key]) revert MarketNotSupported(key);
        if (markPrice == 0 || indexPrice == 0) revert ZeroPrice();

        prices[key] = PriceData({
            markPrice: markPrice,
            indexPrice: indexPrice,
            timestamp: block.timestamp,
            numSources: 1,
            manualOverride: true
        });

        emit ManualPriceSet(key, markPrice, indexPrice);
    }

    /**
     * @notice Clear manual override, allowing keeper updates again
     */
    function clearManualOverride(bytes32 key) external onlyAdmin {
        prices[key].manualOverride = false;
    }

    // ============ Keeper: Price Updates ============

    /**
     * @notice Update price for a single market (called by backend OracleAggregator keeper)
     * @param key Market key (keccak256 of ticker, e.g., keccak256("BTC"))
     * @param markPrice Aggregated mark price (8 decimals)
     * @param indexPrice Index price from primary oracle (8 decimals)
     * @param numSources Number of oracle sources that contributed to this price
     */
    function updatePrice(
        bytes32 key,
        uint256 markPrice,
        uint256 indexPrice,
        uint8 numSources
    ) external onlyKeeper {
        if (!supportedMarkets[key]) revert MarketNotSupported(key);
        if (markPrice == 0 || indexPrice == 0) revert ZeroPrice();

        // Skip deviation check if this is the first price
        PriceData storage current = prices[key];
        if (current.markPrice > 0 && !current.manualOverride) {
            _checkDeviation(key, current.markPrice, markPrice);
        }

        prices[key] = PriceData({
            markPrice: markPrice,
            indexPrice: indexPrice,
            timestamp: block.timestamp,
            numSources: numSources,
            manualOverride: false
        });

        emit PriceUpdated(key, markPrice, indexPrice, numSources, block.timestamp);
    }

    /**
     * @notice Batch update prices for multiple markets (gas efficient)
     */
    function updatePrices(
        bytes32[] calldata keys,
        uint256[] calldata markPrices,
        uint256[] calldata indexPrices,
        uint8[] calldata numSourcesArr
    ) external onlyKeeper {
        require(
            keys.length == markPrices.length &&
            keys.length == indexPrices.length &&
            keys.length == numSourcesArr.length,
            "length mismatch"
        );

        for (uint256 i = 0; i < keys.length; i++) {
            bytes32 key = keys[i];
            uint256 mark = markPrices[i];
            uint256 idx = indexPrices[i];

            if (!supportedMarkets[key]) revert MarketNotSupported(key);
            if (mark == 0 || idx == 0) revert ZeroPrice();

            PriceData storage current = prices[key];
            if (current.markPrice > 0 && !current.manualOverride) {
                _checkDeviation(key, current.markPrice, mark);
            }

            prices[key] = PriceData({
                markPrice: mark,
                indexPrice: idx,
                timestamp: block.timestamp,
                numSources: numSourcesArr[i],
                manualOverride: false
            });

            emit PriceUpdated(key, mark, idx, numSourcesArr[i], block.timestamp);
        }
    }

    // ============ Price Reads (PerpEngine interface) ============

    /**
     * @notice Get mark price by key — implements IPriceOraclePerp
     * @dev Reverts if price is stale (unless manual override)
     */
    function getPriceByKey(bytes32 key) external view override returns (uint256) {
        return getMarkPrice(key);
    }

    /**
     * @notice Get mark price with staleness check
     */
    function getMarkPrice(bytes32 key) public view returns (uint256) {
        PriceData storage p = prices[key];
        if (p.markPrice == 0) revert ZeroPrice();
        _checkStaleness(key, p);
        return p.markPrice;
    }

    /**
     * @notice Get index price with staleness check
     */
    function getIndexPrice(bytes32 key) public view returns (uint256) {
        PriceData storage p = prices[key];
        if (p.indexPrice == 0) revert ZeroPrice();
        _checkStaleness(key, p);
        return p.indexPrice;
    }

    /**
     * @notice Get full price data (mark, index, timestamp, sources)
     */
    function getPriceData(bytes32 key) external view returns (PriceData memory) {
        return prices[key];
    }

    /**
     * @notice Check if a price is considered fresh
     */
    function isFresh(bytes32 key) external view returns (bool) {
        PriceData storage p = prices[key];
        if (p.markPrice == 0) return false;
        if (p.manualOverride) return true;
        return (block.timestamp - p.timestamp) <= maxStaleness;
    }

    // ============ Internal ============

    function _checkStaleness(bytes32 key, PriceData storage p) internal view {
        if (p.manualOverride) return; // manual overrides never go stale
        uint256 age = block.timestamp - p.timestamp;
        if (age > maxStaleness) {
            revert StalePrice(key, age, maxStaleness);
        }
    }

    function _checkDeviation(bytes32 key, uint256 oldPrice, uint256 newPrice) internal view {
        uint256 diff = oldPrice > newPrice ? oldPrice - newPrice : newPrice - oldPrice;
        uint256 deviationBps = (diff * BPS) / oldPrice;
        if (deviationBps > maxDeviationBps) {
            revert DeviationTooLarge(key, oldPrice, newPrice, deviationBps);
        }
    }
}
