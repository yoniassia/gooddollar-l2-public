// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PerpUBIFeeSplitter
 * @notice Handles UBI fee routing for GoodPerps perpetual futures trading.
 *         Routes fees from trading, funding rates, and liquidations to UBI pool.
 * @dev Implements IFeeSplitterPerp interface expected by PerpEngine.
 */

import "../interfaces/IGoodDollarToken.sol";

interface IERC20Transfer {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @notice Interface expected by PerpEngine for trading fee splitting
 */
interface IFeeSplitterPerp {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
    function goodDollar() external view returns (address);
}

contract PerpUBIFeeSplitter is IFeeSplitterPerp {
    IGoodDollarToken public goodDollarToken;

    // Fee split configuration (in basis points, 10000 = 100%)
    uint256 public ubiBPS = 3333;      // 33.33% to UBI pool
    uint256 public protocolBPS = 1667; // 16.67% to protocol treasury
    // Remaining 50% goes back to the dApp (PerpEngine)

    address public protocolTreasury;
    address public admin;

    // Platform-specific tracking for derivatives trading impact
    uint256 public totalTradingFees;
    uint256 public totalFundingFees;
    uint256 public totalLiquidationFees;
    uint256 public totalUBIFromTrading;
    uint256 public totalUBIFromFunding;
    uint256 public totalUBIFromLiquidations;

    // Social impact metrics for derivatives market
    uint256 public dailyDerivativesUBI;
    uint256 public lastDayTimestamp;
    uint256 public monthlyTargetUBI = 10_000e18; // $10K target monthly UBI

    // Market maker and liquidity provider impact tracking
    mapping(address => uint256) public marketMakerContributions;
    mapping(address => uint256) public liquidatorContributions;
    address[] public activeLiquidators;

    event FeeSplit(
        address indexed source,
        string indexed feeType,
        uint256 totalFee,
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    );
    event TradingFeeSplit(
        address indexed trader,
        uint256 marketId,
        uint256 positionSize,
        uint256 ubiShare
    );
    event FundingFeeSplit(
        uint256 indexed marketId,
        uint256 fundingAmount,
        uint256 ubiShare
    );
    event LiquidationUBI(
        address indexed liquidator,
        address indexed liquidatedTrader,
        uint256 liquidationBonus,
        uint256 ubiShare
    );
    event DailyDerivativesImpact(uint256 date, uint256 ubiAmount);
    event MonthlyTargetUpdated(uint256 oldTarget, uint256 newTarget);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor(address _goodDollar, address _treasury, address _admin) {
        goodDollarToken = IGoodDollarToken(_goodDollar);
        protocolTreasury = _treasury;
        admin = _admin;
        lastDayTimestamp = block.timestamp / 86400; // Current day
    }

    /**
     * @notice Split trading fees from PerpEngine.
     *         Called for position open/close fees automatically.
     * @param totalFee Total fee amount in G$ from trading operation
     * @param dAppRecipient Where to send the dApp's share (PerpEngine)
     * @return ubiShare Amount sent to UBI pool
     * @return protocolShare Amount sent to protocol treasury
     * @return dAppShare Amount sent to PerpEngine
     */
    function splitFee(uint256 totalFee, address dAppRecipient) public override returns (
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    ) {
        require(totalFee > 0, "Zero fee");

        // Calculate shares using the standard UBI fee split
        ubiShare = (totalFee * ubiBPS) / 10000;
        protocolShare = (totalFee * protocolBPS) / 10000;
        dAppShare = totalFee - ubiShare - protocolShare;

        // Transfer from sender (PerpEngine)
        require(goodDollarToken.transferFrom(msg.sender, address(this), totalFee), "transfer failed");

        // Route to destinations
        goodDollarToken.fundUBIPool(ubiShare);
        require(goodDollarToken.transfer(protocolTreasury, protocolShare), "treasury transfer failed");
        require(goodDollarToken.transfer(dAppRecipient, dAppShare), "dapp transfer failed");

        // Update daily UBI tracking for derivatives impact metrics
        _updateDailyDerivativesUBI(ubiShare);

        emit FeeSplit(msg.sender, "trading", totalFee, ubiShare, protocolShare, dAppShare);
    }

    /**
     * @notice Split trading fees with additional tracking.
     *         Called by PerpEngine for detailed position tracking.
     */
    function splitTradingFee(
        uint256 totalFee,
        address dAppRecipient,
        address trader,
        uint256 marketId,
        uint256 positionSize
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFee(totalFee, dAppRecipient);

        // Update trading-specific stats
        totalTradingFees += totalFee;
        totalUBIFromTrading += ubiShare;

        emit TradingFeeSplit(trader, marketId, positionSize, ubiShare);
    }

    /**
     * @notice Split funding rate fees.
     *         Called when funding payments generate protocol revenue.
     */
    function splitFundingFee(
        uint256 totalFee,
        address dAppRecipient,
        uint256 marketId
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFee(totalFee, dAppRecipient);

        // Update funding-specific stats
        totalFundingFees += totalFee;
        totalUBIFromFunding += ubiShare;

        emit FundingFeeSplit(marketId, totalFee, ubiShare);
    }

    /**
     * @notice Split liquidation fees/bonuses with UBI routing.
     *         Called by PerpEngine when positions are liquidated.
     */
    function splitLiquidationFee(
        uint256 totalFee,
        address dAppRecipient,
        address liquidator,
        address liquidatedTrader
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFee(totalFee, dAppRecipient);

        // Update liquidation-specific stats
        totalLiquidationFees += totalFee;
        totalUBIFromLiquidations += ubiShare;

        // Track liquidator contributions
        liquidatorContributions[liquidator] += ubiShare;
        _addLiquidatorIfNew(liquidator);

        emit LiquidationUBI(liquidator, liquidatedTrader, totalFee, ubiShare);
    }

    /**
     * @notice Update daily UBI tracking for systematic derivatives impact measurement.
     */
    function _updateDailyDerivativesUBI(uint256 ubiAmount) internal {
        uint256 currentDay = block.timestamp / 86400;

        if (currentDay > lastDayTimestamp) {
            // New day - emit previous day's impact and reset
            if (dailyDerivativesUBI > 0) {
                emit DailyDerivativesImpact(lastDayTimestamp, dailyDerivativesUBI);
            }
            dailyDerivativesUBI = ubiAmount;
            lastDayTimestamp = currentDay;
        } else {
            // Same day - accumulate
            dailyDerivativesUBI += ubiAmount;
        }
    }

    /**
     * @notice Add liquidator to active list if not already tracked.
     */
    function _addLiquidatorIfNew(address liquidator) internal {
        // Check if liquidator already exists
        for (uint256 i = 0; i < activeLiquidators.length; i++) {
            if (activeLiquidators[i] == liquidator) {
                return; // Already exists
            }
        }
        activeLiquidators.push(liquidator);
    }

    /**
     * @notice Required by PerpEngine to get GoodDollar token address.
     * @return address GoodDollar token contract address
     */
    function goodDollar() external view override returns (address) {
        return address(goodDollarToken);
    }

    // ============ Governance ============

    function setFeeSplit(uint256 _ubiBPS, uint256 _protocolBPS) external onlyAdmin {
        require(_ubiBPS + _protocolBPS <= 10000, "Exceeds 100%");
        ubiBPS = _ubiBPS;
        protocolBPS = _protocolBPS;
    }

    function setTreasury(address _treasury) external onlyAdmin {
        require(_treasury != address(0), "zero address");
        protocolTreasury = _treasury;
    }

    function setMonthlyTarget(uint256 _target) external onlyAdmin {
        uint256 oldTarget = monthlyTargetUBI;
        monthlyTargetUBI = _target;
        emit MonthlyTargetUpdated(oldTarget, _target);
    }

    /// @notice Update the GoodDollar token address when redeployed
    function setGoodDollar(address _goodDollar) external onlyAdmin {
        require(_goodDollar != address(0), "zero address");
        goodDollarToken = IGoodDollarToken(_goodDollar);
    }

    // ============ Analytics & Impact Measurement ============

    /**
     * @notice Get perpetual futures specific UBI statistics.
     */
    function getPerpsUBIStats() external view returns (
        uint256 tradingFees,
        uint256 fundingFees,
        uint256 liquidationFees,
        uint256 ubiFromTrading,
        uint256 ubiFromFunding,
        uint256 ubiFromLiquidations,
        uint256 totalUBI
    ) {
        tradingFees = totalTradingFees;
        fundingFees = totalFundingFees;
        liquidationFees = totalLiquidationFees;
        ubiFromTrading = totalUBIFromTrading;
        ubiFromFunding = totalUBIFromFunding;
        ubiFromLiquidations = totalUBIFromLiquidations;
        totalUBI = ubiFromTrading + ubiFromFunding + ubiFromLiquidations;
    }

    /**
     * @notice Calculate estimated monthly UBI contribution from derivatives trading.
     *         Target: $10K+ monthly from perpetual futures.
     */
    function getMonthlyUBIEstimate() external view returns (uint256 estimated, uint256 target, uint256 progress) {
        // Estimate based on current daily volume
        uint256 totalUBI = totalUBIFromTrading + totalUBIFromFunding + totalUBIFromLiquidations;
        uint256 daysSinceLaunch = (block.timestamp / 86400) - lastDayTimestamp + 1;

        if (daysSinceLaunch > 0) {
            uint256 avgDailyUBI = totalUBI / daysSinceLaunch;
            estimated = avgDailyUBI * 30; // 30-day estimate
        }

        target = monthlyTargetUBI;
        progress = target > 0 ? (estimated * 10000) / target : 0; // BPS
    }

    /**
     * @notice Get current day's UBI impact for real-time monitoring.
     */
    function getTodayDerivativesImpact() external view returns (uint256 currentDay, uint256 ubiAmount) {
        currentDay = block.timestamp / 86400;
        ubiAmount = dailyDerivativesUBI;
    }

    /**
     * @notice Get liquidator leaderboard for gamification.
     */
    function getTopLiquidators(uint256 limit) external view returns (
        address[] memory liquidators,
        uint256[] memory contributions
    ) {
        uint256 len = activeLiquidators.length;
        if (len > limit) len = limit;

        liquidators = new address[](len);
        contributions = new uint256[](len);

        // Simple selection (could be optimized with sorting for larger datasets)
        for (uint256 i = 0; i < len; i++) {
            liquidators[i] = activeLiquidators[i];
            contributions[i] = liquidatorContributions[activeLiquidators[i]];
        }
    }

    /**
     * @notice Calculate derivatives social impact rate.
     *         Returns UBI generated per G$ of trading volume.
     */
    function getDerivativesSocialImpactRate() external view returns (uint256) {
        uint256 totalVolume = totalTradingFees + totalFundingFees + totalLiquidationFees;
        if (totalVolume == 0) return 0;

        uint256 totalUBI = totalUBIFromTrading + totalUBIFromFunding + totalUBIFromLiquidations;
        // Return UBI per 10000 G$ of trading volume (for readability)
        return (totalUBI * 10000) / totalVolume;
    }

    /**
     * @notice Get active liquidators count.
     */
    function getActiveLiquidatorsCount() external view returns (uint256) {
        return activeLiquidators.length;
    }
}