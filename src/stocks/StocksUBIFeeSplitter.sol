// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title StocksUBIFeeSplitter
 * @notice Handles UBI fee routing for GoodStocks tokenized equities.
 *         Routes fees from trading (mint/burn) and liquidations to UBI pool.
 * @dev Implements IUBIFeeSplitter interface expected by CollateralVault.
 */

import "../interfaces/IGoodDollarToken.sol";

interface IERC20Transfer {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @notice Interface expected by CollateralVault for trading fee splitting
 */
interface IUBIFeeSplitter {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

contract StocksUBIFeeSplitter is IUBIFeeSplitter {
    IGoodDollarToken public goodDollar;

    // Fee split configuration (in basis points, 10000 = 100%)
    uint256 public ubiBPS = 3333;      // 33.33% to UBI pool
    uint256 public protocolBPS = 1667; // 16.67% to protocol treasury
    // Remaining 50% goes back to the dApp (CollateralVault)

    address public protocolTreasury;
    address public admin;

    // Platform-specific tracking for 24/7 trading impact
    uint256 public totalMintFees;
    uint256 public totalBurnFees;
    uint256 public totalLiquidationProceeds;
    uint256 public totalUBIFromTrading;
    uint256 public totalUBIFromLiquidations;

    // Social impact metrics
    uint256 public dailyVolumeUBI;
    uint256 public lastDayTimestamp;

    // Partnership organizations for impact sharing
    mapping(address => bool) public impactPartners;
    mapping(address => uint256) public partnerImpactShare; // basis points
    address[] public partnerList;

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
        string indexed asset,
        uint256 amount,
        uint256 ubiShare
    );
    event LiquidationUBI(
        address indexed liquidatedUser,
        uint256 collateral,
        uint256 ubiShare
    );
    event PartnerAdded(address indexed partner, uint256 impactShare);
    event PartnerRemoved(address indexed partner);
    event DailyUBIImpact(uint256 date, uint256 ubiAmount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor(address _goodDollar, address _treasury, address _admin) {
        goodDollar = IGoodDollarToken(_goodDollar);
        protocolTreasury = _treasury;
        admin = _admin;
        lastDayTimestamp = block.timestamp / 86400; // Current day
    }

    /**
     * @notice Split trading fees from CollateralVault.
     *         Called for mint fees, burn fees, and liquidation proceeds.
     * @param totalFee Total fee amount in G$ from trading operation
     * @param dAppRecipient Where to send the dApp's share (CollateralVault)
     * @return ubiShare Amount sent to UBI pool
     * @return protocolShare Amount sent to protocol treasury
     * @return dAppShare Amount sent to CollateralVault
     */
    function splitFee(uint256 totalFee, address dAppRecipient) public override returns (
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    ) {
        require(totalFee > 0, "Zero fee");

        // Calculate shares using the same pattern as base UBIFeeSplitter
        ubiShare = (totalFee * ubiBPS) / 10000;
        protocolShare = (totalFee * protocolBPS) / 10000;
        dAppShare = totalFee - ubiShare - protocolShare;

        // Transfer from sender (CollateralVault)
        require(goodDollar.transferFrom(msg.sender, address(this), totalFee), "transfer failed");

        // Route to destinations
        goodDollar.fundUBIPool(ubiShare);
        require(goodDollar.transfer(protocolTreasury, protocolShare), "treasury transfer failed");
        require(goodDollar.transfer(dAppRecipient, dAppShare), "dapp transfer failed");

        // Update daily UBI tracking for 24/7 impact metrics
        _updateDailyUBI(ubiShare);

        emit FeeSplit(msg.sender, "trading", totalFee, ubiShare, protocolShare, dAppShare);
    }

    /**
     * @notice Split mint fees specifically (0.3% of position value).
     *         Called by CollateralVault when users mint synthetic tokens.
     */
    function splitMintFee(
        uint256 totalFee,
        address dAppRecipient,
        address trader,
        string calldata asset,
        uint256 amount
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFee(totalFee, dAppRecipient);

        // Update mint-specific stats
        totalMintFees += totalFee;
        totalUBIFromTrading += ubiShare;

        emit TradingFeeSplit(trader, asset, amount, ubiShare);
    }

    /**
     * @notice Split burn fees specifically (0.3% of position value).
     *         Called by CollateralVault when users burn synthetic tokens.
     */
    function splitBurnFee(
        uint256 totalFee,
        address dAppRecipient,
        address trader,
        string calldata asset,
        uint256 amount
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFee(totalFee, dAppRecipient);

        // Update burn-specific stats
        totalBurnFees += totalFee;
        totalUBIFromTrading += ubiShare;

        emit TradingFeeSplit(trader, asset, amount, ubiShare);
    }

    /**
     * @notice Split liquidation proceeds.
     *         Called by CollateralVault when undercollateralized positions are liquidated.
     */
    function splitLiquidationProceeds(
        uint256 totalProceeds,
        address dAppRecipient,
        address liquidatedUser
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFee(totalProceeds, dAppRecipient);

        // Update liquidation-specific stats
        totalLiquidationProceeds += totalProceeds;
        totalUBIFromLiquidations += ubiShare;

        emit LiquidationUBI(liquidatedUser, totalProceeds, ubiShare);
    }

    /**
     * @notice Update daily UBI tracking for systematic social impact measurement.
     */
    function _updateDailyUBI(uint256 ubiAmount) internal {
        uint256 currentDay = block.timestamp / 86400;

        if (currentDay > lastDayTimestamp) {
            // New day - emit previous day's impact and reset
            if (dailyVolumeUBI > 0) {
                emit DailyUBIImpact(lastDayTimestamp, dailyVolumeUBI);
            }
            dailyVolumeUBI = ubiAmount;
            lastDayTimestamp = currentDay;
        } else {
            // Same day - accumulate
            dailyVolumeUBI += ubiAmount;
        }
    }

    // ============ Impact Partnership System ============

    /**
     * @notice Add impact organization for revenue sharing.
     *         Enables partnerships with social impact organizations.
     */
    function addImpactPartner(address partner, uint256 sharesBPS) external onlyAdmin {
        require(partner != address(0), "zero address");
        require(sharesBPS <= 1000, "max 10% share"); // Cap at 10% of UBI share

        if (!impactPartners[partner]) {
            impactPartners[partner] = true;
            partnerImpactShare[partner] = sharesBPS;
            partnerList.push(partner);
            emit PartnerAdded(partner, sharesBPS);
        }
    }

    function removeImpactPartner(address partner) external onlyAdmin {
        if (impactPartners[partner]) {
            impactPartners[partner] = false;
            partnerImpactShare[partner] = 0;

            // Remove from partnerList
            for (uint i = 0; i < partnerList.length; i++) {
                if (partnerList[i] == partner) {
                    partnerList[i] = partnerList[partnerList.length - 1];
                    partnerList.pop();
                    break;
                }
            }
            emit PartnerRemoved(partner);
        }
    }

    function getPartnerCount() external view returns (uint256) {
        return partnerList.length;
    }

    function getPartner(uint256 index) external view returns (address partner, uint256 sharesBPS) {
        require(index < partnerList.length, "index out of bounds");
        partner = partnerList[index];
        sharesBPS = partnerImpactShare[partner];
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

    /// @notice Update the GoodDollar token address when redeployed
    function setGoodDollar(address _goodDollar) external onlyAdmin {
        require(_goodDollar != address(0), "zero address");
        goodDollar = IGoodDollarToken(_goodDollar);
    }

    // ============ Analytics & Impact Measurement ============

    /**
     * @notice Get tokenized equities specific UBI statistics.
     */
    function getStocksUBIStats() external view returns (
        uint256 mintFees,
        uint256 burnFees,
        uint256 liquidationProceeds,
        uint256 ubiFromTrading,
        uint256 ubiFromLiquidations,
        uint256 totalUBI
    ) {
        mintFees = totalMintFees;
        burnFees = totalBurnFees;
        liquidationProceeds = totalLiquidationProceeds;
        ubiFromTrading = totalUBIFromTrading;
        ubiFromLiquidations = totalUBIFromLiquidations;
        totalUBI = ubiFromTrading + ubiFromLiquidations;
    }

    /**
     * @notice Calculate estimated monthly UBI contribution from 24/7 trading.
     *         Target: $8K+ monthly from tokenized equities.
     */
    function getMonthlyUBIEstimate() external view returns (uint256) {
        // Estimate based on current daily volume
        uint256 avgDailyUBI = (totalUBIFromTrading + totalUBIFromLiquidations) /
                             (block.timestamp / 86400 - lastDayTimestamp + 1);
        return avgDailyUBI * 30; // 30-day estimate
    }

    /**
     * @notice Get current day's UBI impact for real-time monitoring.
     */
    function getTodayUBIImpact() external view returns (uint256 currentDay, uint256 ubiAmount) {
        currentDay = block.timestamp / 86400;
        ubiAmount = dailyVolumeUBI;
    }

    /**
     * @notice Calculate systematic social impact rate.
     *         Returns UBI generated per G$ of trading volume.
     */
    function getSocialImpactRate() external view returns (uint256) {
        uint256 totalVolume = totalMintFees + totalBurnFees;
        if (totalVolume == 0) return 0;

        // Return UBI per 10000 G$ of trading volume (for readability)
        return ((totalUBIFromTrading + totalUBIFromLiquidations) * 10000) / totalVolume;
    }
}