// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MarginVault.sol";
import "./FundingRate.sol";
import {IPriceOraclePerp} from "./PerpPriceOracle.sol";

/**
 * @title PerpEngine
 * @notice Core GoodPerps perpetual futures engine.
 *
 *         Users open long/short positions on markets (BTC, ETH, etc.)
 *         with up to 50x leverage backed by G$ margin in MarginVault.
 *
 *         Position lifecycle:
 *           1. User deposits G$ into MarginVault
 *           2. openPosition(market, size, isLong) — reserves margin
 *           3. Price moves → accrued PnL updated on close
 *           4. closePosition() — settles PnL and funding, returns margin
 *           5. If margin ratio < MAINTENANCE_MARGIN_BPS → liquidatable
 *
 *         Fee model: 0.1% on notional, routed to UBI fee splitter.
 */

interface IFeeSplitterPerp {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256, uint256, uint256);
    function goodDollar() external view returns (address);
}

interface IMarginToken2 {
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract PerpEngine {
    // ============ Types ============

    struct Position {
        bool isOpen;
        bool isLong;
        uint256 size;           // notional size in G$ (price * qty at entry)
        uint256 entryPrice;     // 8-decimal oracle price at open
        uint256 margin;         // G$ margin reserved for this position
        int256 entryFundingIdx; // cumulative funding index at open
        uint256 marketId;
    }

    struct Market {
        bytes32 oracleKey;      // mark price feed (TWAP in production)
        bytes32 indexOracleKey; // spot/Chainlink index price feed
        uint256 maxLeverage;    // e.g., 50 = 50x
        bool active;
        uint256 openInterestLong;
        uint256 openInterestShort;
    }

    // ============ Constants ============

    /// @notice Minimum maintenance margin: 2% → liquidatable below this
    uint256 public constant MAINTENANCE_MARGIN_BPS = 200; // 2%
    /// @notice Trade fee: 0.1% on notional
    uint256 public constant TRADE_FEE_BPS = 10;
    uint256 public constant BPS = 10000;
    uint256 public constant LIQUIDATION_BONUS_BPS = 500; // 5% to liquidator

    // ============ State ============

    MarginVault public immutable vault;
    FundingRate public immutable funding;
    IPriceOraclePerp public immutable oracle;
    address public immutable feeSplitter;
    address public admin;
    address public pendingAdmin;
    bool public paused;

    Market[] public markets;

    /// @notice user → marketId → Position
    mapping(address => mapping(uint256 => Position)) public positions;

    // ============ Events ============

    event AdminTransferInitiated(address indexed previousAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event MarketCreated(uint256 indexed marketId, bytes32 oracleKey, uint256 maxLeverage);
    event PositionOpened(
        address indexed trader,
        uint256 indexed marketId,
        bool isLong,
        uint256 size,
        uint256 margin,
        uint256 entryPrice
    );
    event PositionClosed(
        address indexed trader,
        uint256 indexed marketId,
        int256 pnl,
        uint256 exitPrice
    );
    event PositionLiquidated(
        address indexed liquidator,
        address indexed trader,
        uint256 indexed marketId,
        uint256 exitPrice
    );

    // ============ Errors ============

    error NotAdmin();
    error NotPendingAdmin();
    error Paused();
    error ZeroAddress();
    error ZeroAmount();
    error MarketNotActive();
    error PositionAlreadyOpen();
    error NoOpenPosition();
    error LeverageTooHigh(uint256 leverage, uint256 max);
    error InsufficientMargin(uint256 have, uint256 need);
    error PositionHealthy(uint256 marginRatio, uint256 threshold);
    error TransferFailed();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    // ============ Constructor ============

    constructor(
        address _vault,
        address _funding,
        address _oracle,
        address _feeSplitter,
        address _admin
    ) {
        if (_vault == address(0)) revert ZeroAddress();
        if (_funding == address(0)) revert ZeroAddress();
        if (_oracle == address(0)) revert ZeroAddress();
        if (_feeSplitter == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();

        vault = MarginVault(_vault);
        funding = FundingRate(_funding);
        oracle = IPriceOraclePerp(_oracle);
        feeSplitter = _feeSplitter;
        admin = _admin;
    }

    // ============ Admin ============

    /**
     * @notice Create a new perp market.
     * @param oracleKey keccak256 of the mark price ticker (e.g., keccak256("BTC"))
     * @param indexOracleKey keccak256 of the index price ticker (e.g., keccak256("BTC_INDEX"))
     * @param maxLeverage Maximum allowed leverage (e.g., 50)
     */
    function createMarket(bytes32 oracleKey, bytes32 indexOracleKey, uint256 maxLeverage) external onlyAdmin returns (uint256 marketId) {
        marketId = markets.length;
        markets.push(Market({
            oracleKey: oracleKey,
            indexOracleKey: indexOracleKey,
            maxLeverage: maxLeverage,
            active: true,
            openInterestLong: 0,
            openInterestShort: 0
        }));
        funding.initMarket(marketId);
        emit MarketCreated(marketId, oracleKey, maxLeverage);
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
    }

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

    // ============ Trading ============

    /**
     * @notice Open a leveraged perpetual position.
     * @param marketId Market index
     * @param size Notional position size in G$ (e.g., 10000e18 = $10k long BTC)
     * @param isLong True for long, false for short
     * @param margin G$ margin to post (size / leverage)
     */
    function openPosition(
        uint256 marketId,
        uint256 size,
        bool isLong,
        uint256 margin
    ) external whenNotPaused {
        if (size == 0 || margin == 0) revert ZeroAmount();
        Market storage m = markets[marketId];
        if (!m.active) revert MarketNotActive();

        Position storage pos = positions[msg.sender][marketId];
        if (pos.isOpen) revert PositionAlreadyOpen();

        // Check leverage: use multiplication to avoid truncation from integer division.
        // size / margin truncates down and could allow real leverage > maxLeverage.
        if (size > margin * m.maxLeverage) revert LeverageTooHigh(size / margin, m.maxLeverage);

        // Calculate fee
        uint256 fee = (size * TRADE_FEE_BPS) / BPS;
        uint256 totalRequired = margin + fee;

        if (vault.balances(msg.sender) < totalRequired) {
            revert InsufficientMargin(vault.balances(msg.sender), totalRequired);
        }

        // Settle any pending funding first (no-op if interval not elapsed)
        uint256 markPrice = oracle.getPriceByKey(m.oracleKey);
        uint256 indexPriceAtOpen = oracle.getPriceByKey(m.indexOracleKey);
        funding.applyFunding(marketId, markPrice, indexPriceAtOpen);

        // CEI: write all state before any external interaction (GOO-461)
        pos.isOpen = true;
        pos.isLong = isLong;
        pos.size = size;
        pos.entryPrice = markPrice;
        pos.margin = margin;
        pos.entryFundingIdx = funding.cumulativeFundingIndex(marketId);
        pos.marketId = marketId;

        if (isLong) {
            m.openInterestLong += size;
        } else {
            m.openInterestShort += size;
        }

        emit PositionOpened(msg.sender, marketId, isLong, size, margin, markPrice);

        // Lock margin in vault (prevents withdrawal while position is open)
        vault.debit(msg.sender, margin);

        // Debit fee from vault and route to UBI fee splitter
        if (fee > 0) {
            vault.debit(msg.sender, fee);
            vault.flushFee(address(this), fee);

            // CRITICAL FIX: Approve the correct token (goodDollar) that FeeSplitter will transferFrom
            // Previous bug: approved vault.collateral() but FeeSplitter uses goodDollar.transferFrom()
            address goodDollarToken = IFeeSplitterPerp(feeSplitter).goodDollar();
            IMarginToken2 token = IMarginToken2(goodDollarToken);

            // USDT-style approve: reset to 0 first, then set actual amount
            // This prevents "Insufficient allowance" when previous approval exists
            token.approve(feeSplitter, 0);
            token.approve(feeSplitter, fee);

            IFeeSplitterPerp(feeSplitter).splitFee(fee, address(this));
        }
    }

    /**
     * @notice Close an open position and settle PnL + funding.
     * @param marketId Market index
     */
    function closePosition(uint256 marketId) external whenNotPaused {
        Position storage pos = positions[msg.sender][marketId];
        if (!pos.isOpen) revert NoOpenPosition();

        uint256 exitPrice = oracle.getPriceByKey(markets[marketId].oracleKey);
        uint256 indexPriceAtClose = oracle.getPriceByKey(markets[marketId].indexOracleKey);
        // GOO-462: apply funding at close so the cumulative index is current
        funding.applyFunding(marketId, exitPrice, indexPriceAtClose);

        (int256 pnl, int256 fundingPayment) = _settlePnL(msg.sender, marketId, exitPrice);

        _closePosition(msg.sender, marketId, pnl, fundingPayment, exitPrice);
    }

    // ============ Liquidation ============

    /**
     * @notice Liquidate an undercollateralized position.
     * @param trader Address of the trader to liquidate
     * @param marketId Market index
     */
    function liquidate(address trader, uint256 marketId) external whenNotPaused {
        Position storage pos = positions[trader][marketId];
        if (!pos.isOpen) revert NoOpenPosition();

        uint256 exitPrice = oracle.getPriceByKey(markets[marketId].oracleKey);
        uint256 indexPriceAtLiquidation = oracle.getPriceByKey(markets[marketId].indexOracleKey);
        // GOO-462: apply funding at liquidation so the cumulative index is current
        funding.applyFunding(marketId, exitPrice, indexPriceAtLiquidation);
        (int256 pnl, int256 fundingPayment) = _settlePnL(trader, marketId, exitPrice);

        int256 totalPnL = pnl - fundingPayment;
        int256 remainingMargin = int256(pos.margin) + totalPnL;

        uint256 mRatio = remainingMargin > 0
            ? (uint256(remainingMargin) * BPS) / pos.size
            : 0;

        if (mRatio >= MAINTENANCE_MARGIN_BPS) {
            revert PositionHealthy(mRatio, MAINTENANCE_MARGIN_BPS);
        }

        // Liquidator bonus (paid from remaining margin after close)
        uint256 bonus = remainingMargin > 0
            ? (uint256(remainingMargin) * LIQUIDATION_BONUS_BPS) / BPS
            : 0;

        // Close position first — credits trader with any remaining margin.
        // Bonus is then transferred from that credited balance to the liquidator.
        _closePosition(trader, marketId, pnl, fundingPayment, exitPrice);

        if (bonus > 0) {
            // Route liquidation bonus through UBI fee splitter for systematic social impact
            vault.transfer(trader, address(this), bonus);

            // Get goodDollar token for fee splitter interaction
            address goodDollarToken = IFeeSplitterPerp(feeSplitter).goodDollar();
            IMarginToken2 token = IMarginToken2(goodDollarToken);

            // Approve and split liquidation bonus (33% UBI, 16.67% protocol, 50% liquidator)
            token.approve(feeSplitter, 0);
            token.approve(feeSplitter, bonus);

            (, , uint256 liquidatorShare) = IFeeSplitterPerp(feeSplitter).splitFee(bonus, msg.sender);

            // Note: The liquidator receives ~50% instead of 100% of the bonus,
            // with 33% going to UBI pool and 16.67% to protocol treasury
        }

        emit PositionLiquidated(msg.sender, trader, marketId, exitPrice);
    }

    // ============ View ============

    /**
     * @notice Get unrealized PnL for a position, including pending funding payments.
     * @return pnl Positive = profit, negative = loss (net of funding)
     */
    function unrealizedPnL(address trader, uint256 marketId) external view returns (int256 pnl) {
        Position storage pos = positions[trader][marketId];
        if (!pos.isOpen) return 0;
        uint256 currentPrice = oracle.getPriceByKey(markets[marketId].oracleKey);
        int256 rawPnL = _calcPnL(pos, currentPrice);
        int256 size = pos.isLong ? int256(pos.size) : -int256(pos.size);
        int256 fundingPayment = funding.accruedFunding(size, pos.entryFundingIdx, marketId);
        return rawPnL - fundingPayment;
    }

    /**
     * @notice Get current margin ratio in BPS (e.g., 500 = 5%), including pending funding.
     *         Matches the health calculation used in liquidate() — suitable for liquidation bots.
     */
    function marginRatio(address trader, uint256 marketId) external view returns (uint256) {
        Position storage pos = positions[trader][marketId];
        if (!pos.isOpen) return type(uint256).max;
        uint256 currentPrice = oracle.getPriceByKey(markets[marketId].oracleKey);
        int256 rawPnL = _calcPnL(pos, currentPrice);
        int256 size = pos.isLong ? int256(pos.size) : -int256(pos.size);
        int256 fundingPayment = funding.accruedFunding(size, pos.entryFundingIdx, marketId);
        int256 remainingMargin = int256(pos.margin) + rawPnL - fundingPayment;
        if (remainingMargin <= 0) return 0;
        return (uint256(remainingMargin) * BPS) / pos.size;
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    // ============ Internals ============

    function _calcPnL(Position storage pos, uint256 currentPrice) internal view returns (int256) {
        // PnL = size * (currentPrice - entryPrice) / entryPrice * isLong
        int256 priceDelta = int256(currentPrice) - int256(pos.entryPrice);
        int256 pnl = (int256(pos.size) * priceDelta) / int256(pos.entryPrice);
        return pos.isLong ? pnl : -pnl;
    }

    function _settlePnL(address trader, uint256 marketId, uint256 exitPrice)
        internal
        view
        returns (int256 pnl, int256 fundingPayment)
    {
        Position storage pos = positions[trader][marketId];
        pnl = _calcPnL(pos, exitPrice);
        int256 size = pos.isLong ? int256(pos.size) : -int256(pos.size);
        fundingPayment = funding.accruedFunding(size, pos.entryFundingIdx, marketId);
    }

    function _closePosition(
        address trader,
        uint256 marketId,
        int256 pnl,
        int256 fundingPayment,
        uint256 exitPrice
    ) internal {
        Position storage pos = positions[trader][marketId];
        Market storage m = markets[marketId];

        if (pos.isLong) {
            m.openInterestLong -= pos.size;
        } else {
            m.openInterestShort -= pos.size;
        }

        // Net PnL after funding
        int256 netPnL = pnl - fundingPayment;

        if (netPnL >= 0) {
            // Profit: return locked margin + profit
            vault.credit(trader, pos.margin + uint256(netPnL));
        } else {
            uint256 loss = uint256(-netPnL);
            if (loss >= pos.margin) {
                // Wipe out — margin was already debited at open; nothing to return
                // (insurance fund would cover excess loss in production)
            } else {
                // Return remaining margin after loss
                vault.credit(trader, pos.margin - loss);
            }
        }

        emit PositionClosed(trader, marketId, pnl, exitPrice);
        delete positions[trader][marketId];
    }
}
