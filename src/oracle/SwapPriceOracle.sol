// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SwapPriceOracle
 * @notice Unified price oracle for GoodSwap DEX and cross-protocol price feeds.
 *         Keepers push CoinGecko/CMC prices on-chain; contracts read USD prices.
 *
 * @dev Price format: 8 decimals (Chainlink standard). ETH @ $3,500 = 350_000_000_000
 *
 *      Features:
 *        - Multi-token support (ETH, G$, USDC, WBTC, etc.)
 *        - Staleness protection (configurable maxAge per token)
 *        - Deviation guard (rejects >25% jumps without admin override)
 *        - TWAP accumulator for on-chain TWAP queries
 *        - Batch updates to save gas
 *        - Emergency admin override
 */
contract SwapPriceOracle {

    // ============ Types ============

    struct PriceData {
        uint256 price;          // USD price, 8 decimals
        uint256 timestamp;      // last update time
        uint256 twapCumulative; // cumulative price * time for TWAP (from twapWindowStart)
        uint256 twapWindowStart; // timestamp when TWAP accumulation began (set on first price)
    }

    struct TokenConfig {
        string  symbol;         // human-readable (e.g., "ETH")
        uint8   decimals;       // token decimals (18 for ETH, 6 for USDC)
        uint256 maxAge;         // max staleness in seconds
        bool    active;         // whether this token is tracked
    }

    // ============ State ============

    address public admin;
    mapping(address => bool) public keepers;

    /// @notice token address → price data
    mapping(address => PriceData) public prices;

    /// @notice token address → config
    mapping(address => TokenConfig) public tokenConfigs;

    /// @notice all registered token addresses
    address[] public registeredTokens;

    uint256 public defaultMaxAge = 300;       // 5 minutes
    uint256 public maxDeviationBps = 2500;    // 25%
    uint256 public constant BPS = 10_000;
    uint256 public constant PRICE_DECIMALS = 8;

    // ============ Events ============

    event PriceUpdated(address indexed token, uint256 price, uint256 timestamp);
    event BatchPriceUpdate(uint256 count, uint256 timestamp);
    event TokenRegistered(address indexed token, string symbol, uint8 decimals);
    event TokenRemoved(address indexed token);
    event KeeperUpdated(address indexed keeper, bool authorized);
    event AdminOverride(address indexed token, uint256 price);
    event MaxAgeUpdated(address indexed token, uint256 maxAge);

    // ============ Errors ============

    error NotAdmin();
    error NotKeeper();
    error TokenNotRegistered(address token);
    error StalePrice(address token, uint256 age, uint256 maxAge);
    error DeviationTooHigh(address token, uint256 oldPrice, uint256 newPrice);
    error ZeroPrice();
    error ZeroAddress();
    error ArrayLengthMismatch();

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

    // ============ Admin: Token Management ============

    function registerToken(
        address token,
        string calldata symbol,
        uint8 decimals,
        uint256 maxAge
    ) external onlyAdmin {
        if (token == address(0)) revert ZeroAddress();
        if (!tokenConfigs[token].active) {
            registeredTokens.push(token);
        }
        tokenConfigs[token] = TokenConfig({
            symbol: symbol,
            decimals: decimals,
            maxAge: maxAge > 0 ? maxAge : defaultMaxAge,
            active: true
        });
        emit TokenRegistered(token, symbol, decimals);
    }

    function removeToken(address token) external onlyAdmin {
        tokenConfigs[token].active = false;
        delete prices[token];

        // Remove from registeredTokens array (swap and pop)
        uint256 len = registeredTokens.length;
        for (uint256 i = 0; i < len; i++) {
            if (registeredTokens[i] == token) {
                registeredTokens[i] = registeredTokens[len - 1];
                registeredTokens.pop();
                break;
            }
        }

        emit TokenRemoved(token);
    }

    function setKeeper(address keeper, bool authorized) external onlyAdmin {
        keepers[keeper] = authorized;
        emit KeeperUpdated(keeper, authorized);
    }

    function setDefaultMaxAge(uint256 _maxAge) external onlyAdmin {
        defaultMaxAge = _maxAge;
    }

    function setMaxDeviation(uint256 _bps) external onlyAdmin {
        maxDeviationBps = _bps;
    }

    function setTokenMaxAge(address token, uint256 _maxAge) external onlyAdmin {
        tokenConfigs[token].maxAge = _maxAge;
        emit MaxAgeUpdated(token, _maxAge);
    }

    // ============ Keeper: Price Updates ============

    /**
     * @notice Update price for a single token.
     * @param token Token address
     * @param price USD price with 8 decimals
     */
    function updatePrice(address token, uint256 price) external onlyKeeper {
        _updatePrice(token, price);
    }

    /**
     * @notice Batch update prices for multiple tokens in one tx.
     * @param tokens Array of token addresses
     * @param _prices Array of USD prices (8 decimals each)
     */
    function batchUpdatePrices(
        address[] calldata tokens,
        uint256[] calldata _prices
    ) external onlyKeeper {
        if (tokens.length != _prices.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < tokens.length; i++) {
            _updatePrice(tokens[i], _prices[i]);
        }
        emit BatchPriceUpdate(tokens.length, block.timestamp);
    }

    /**
     * @notice Admin emergency price override (bypasses deviation check).
     */
    function adminSetPrice(address token, uint256 price) external onlyAdmin {
        if (price == 0) revert ZeroPrice();
        if (!tokenConfigs[token].active) revert TokenNotRegistered(token);

        PriceData storage pd = prices[token];
        _updateTWAP(pd);
        pd.price = price;
        pd.timestamp = block.timestamp;

        emit AdminOverride(token, price);
    }

    // ============ View: Price Reads ============

    /**
     * @notice Get the latest price for a token. Reverts if stale.
     * @param token Token address
     * @return price USD price with 8 decimals
     */
    function getPrice(address token) external view returns (uint256) {
        TokenConfig storage cfg = tokenConfigs[token];
        if (!cfg.active) revert TokenNotRegistered(token);

        PriceData storage pd = prices[token];
        if (pd.price == 0) revert ZeroPrice();

        uint256 age = block.timestamp - pd.timestamp;
        if (age > cfg.maxAge) revert StalePrice(token, age, cfg.maxAge);

        return pd.price;
    }

    /**
     * @notice Get price without staleness check (for UIs / non-critical reads).
     */
    function getPriceUnsafe(address token) external view returns (uint256 price, uint256 timestamp) {
        PriceData storage pd = prices[token];
        return (pd.price, pd.timestamp);
    }

    /**
     * @notice Get relative price of tokenA in terms of tokenB.
     *         E.g., ETH/USDC = ethPrice / usdcPrice
     * @return price tokenA price denominated in tokenB, 18 decimals
     */
    function getRelativePrice(address tokenA, address tokenB) external view returns (uint256) {
        uint256 priceA = this.getPrice(tokenA);
        uint256 priceB = this.getPrice(tokenB);
        // Return with 18 decimal precision
        return (priceA * 1e18) / priceB;
    }

    /**
     * @notice Get TWAP (time-weighted average price) since the first price update.
     * @dev cumulative price*time divided by total elapsed since twapWindowStart.
     */
    function getTWAP(address token) external view returns (uint256) {
        PriceData storage pd = prices[token];
        if (pd.twapWindowStart == 0 || pd.twapWindowStart == block.timestamp) {
            return pd.price; // fallback to spot
        }
        uint256 elapsed = block.timestamp - pd.twapWindowStart;
        uint256 cumWithCurrent = pd.twapCumulative + pd.price * (block.timestamp - pd.timestamp);
        return cumWithCurrent / elapsed;
    }

    /**
     * @notice Number of registered tokens.
     */
    function registeredTokenCount() external view returns (uint256) {
        return registeredTokens.length;
    }

    /**
     * @notice Get all registered token addresses.
     */
    function getAllTokens() external view returns (address[] memory) {
        return registeredTokens;
    }

    // ============ Internal ============

    function _updatePrice(address token, uint256 price) internal {
        if (price == 0) revert ZeroPrice();
        if (!tokenConfigs[token].active) revert TokenNotRegistered(token);

        PriceData storage pd = prices[token];

        // Deviation check (skip for first price)
        if (pd.price > 0) {
            uint256 deviation;
            if (price > pd.price) {
                deviation = ((price - pd.price) * BPS) / pd.price;
            } else {
                deviation = ((pd.price - price) * BPS) / pd.price;
            }
            if (deviation > maxDeviationBps) {
                revert DeviationTooHigh(token, pd.price, price);
            }
        }

        // Update TWAP accumulator
        _updateTWAP(pd);

        pd.price = price;
        pd.timestamp = block.timestamp;

        emit PriceUpdated(token, price, block.timestamp);
    }

    function _updateTWAP(PriceData storage pd) internal {
        if (pd.timestamp > 0 && pd.price > 0) {
            uint256 elapsed = block.timestamp - pd.timestamp;
            pd.twapCumulative += pd.price * elapsed;
        }
        // Set window start only once — marks the beginning of the TWAP period.
        // Never reset so getTWAP always divides by total accumulated time.
        if (pd.twapWindowStart == 0) {
            pd.twapWindowStart = block.timestamp;
        }
    }
}
