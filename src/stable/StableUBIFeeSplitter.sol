// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title StableUBIFeeSplitter
 * @notice Handles UBI fee routing for GoodStable protocol operations.
 *         Routes fees from stability fees, minting fees, liquidation penalties, and governance fees.
 * @dev Implements IUBIFeeSplitter interface expected by VaultManager and PegStabilityModule.
 */

import "../interfaces/IGoodDollarToken.sol";

interface IERC20Transfer {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @notice Interface expected by VaultManager and PSM for fee splitting
 */
interface IUBIFeeSplitter {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
    function splitFeeToken(uint256 totalFee, address dAppRecipient, address token)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

contract StableUBIFeeSplitter is IUBIFeeSplitter {
    IGoodDollarToken public goodDollar;

    // Fee split configuration (in basis points, 10000 = 100%)
    uint256 public ubiBPS = 3333;      // 33.33% to UBI pool
    uint256 public protocolBPS = 1667; // 16.67% to protocol treasury
    // Remaining 50% goes back to the dApp (VaultManager/PSM)

    address public protocolTreasury;
    address public admin;
    address public ubiRecipient; // For non-G$ tokens (defaults to treasury)

    // Platform-specific tracking for stablecoin impact
    uint256 public totalStabilityFees;
    uint256 public totalMintingFees;
    uint256 public totalLiquidationFees;
    uint256 public totalGovernanceFees;
    uint256 public totalUBIFromStability;
    uint256 public totalUBIFromMinting;
    uint256 public totalUBIFromLiquidations;
    uint256 public totalUBIFromGovernance;

    // Social impact metrics for stablecoin market
    uint256 public dailyStablecoinUBI;
    uint256 public lastDayTimestamp;
    uint256 public monthlyTargetUBI = 15_000e18; // $15K target monthly UBI

    // Protocol-specific tracking for analytics
    mapping(bytes32 => uint256) public stabilityFeesByIlk; // Per-collateral-type fees
    mapping(address => uint256) public mintingFeesByUser;
    mapping(address => uint256) public vaultManagerContributions;
    mapping(address => uint256) public psmContributions;

    // Collateral type tracking
    bytes32[] public activeIlks;
    mapping(bytes32 => bool) public ilkExists;

    event FeeSplit(
        address indexed source,
        string indexed feeType,
        uint256 totalFee,
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare,
        address token
    );
    event StabilityFeeSplit(
        bytes32 indexed ilk,
        uint256 feeGUSD,
        uint256 ubiShare
    );
    event MintingFeeSplit(
        address indexed user,
        string indexed swapDirection,
        uint256 fee,
        uint256 ubiShare
    );
    event LiquidationPenaltySplit(
        bytes32 indexed ilk,
        address indexed liquidatedUser,
        uint256 penalty,
        uint256 ubiShare
    );
    event GovernanceFeeSplit(
        address indexed proposer,
        uint256 fee,
        uint256 ubiShare
    );
    event DailyStablecoinImpact(uint256 date, uint256 ubiAmount);
    event MonthlyTargetUpdated(uint256 oldTarget, uint256 newTarget);
    event UBIRecipientUpdated(address oldRecipient, address newRecipient);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor(address _goodDollar, address _treasury, address _admin) {
        goodDollar = IGoodDollarToken(_goodDollar);
        protocolTreasury = _treasury;
        admin = _admin;
        ubiRecipient = _treasury; // Default fallback
        lastDayTimestamp = block.timestamp / 86400; // Current day
    }

    /**
     * @notice Split fees denominated in G$.
     *         Called by dApps when fees are collected in GoodDollar tokens.
     * @param totalFee Total fee amount in G$
     * @param dAppRecipient Where to send the dApp's share
     * @return ubiShare Amount sent to UBI pool
     * @return protocolShare Amount sent to protocol treasury
     * @return dAppShare Amount sent to dApp recipient
     */
    function splitFee(uint256 totalFee, address dAppRecipient) external override returns (
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    ) {
        require(totalFee > 0, "Zero fee");

        // Calculate shares using the standard UBI fee split
        ubiShare = (totalFee * ubiBPS) / 10000;
        protocolShare = (totalFee * protocolBPS) / 10000;
        dAppShare = totalFee - ubiShare - protocolShare;

        // Transfer from sender
        require(goodDollar.transferFrom(msg.sender, address(this), totalFee), "transfer failed");

        // Route to destinations
        goodDollar.fundUBIPool(ubiShare);
        require(goodDollar.transfer(protocolTreasury, protocolShare), "treasury transfer failed");
        require(goodDollar.transfer(dAppRecipient, dAppShare), "dapp transfer failed");

        // Update daily UBI tracking
        _updateDailyStablecoinUBI(ubiShare);

        emit FeeSplit(msg.sender, "g-dollar", totalFee, ubiShare, protocolShare, dAppShare, address(goodDollar));
    }

    /**
     * @notice Split fees denominated in any ERC-20 token (especially gUSD).
     *         Called by VaultManager (stability fees) and PSM (minting fees).
     * @param totalFee Total fee amount in token units
     * @param dAppRecipient Where to send the dApp's share
     * @param token The ERC-20 token in which the fee is denominated
     * @return ubiShare Amount sent to UBI recipient
     * @return protocolShare Amount sent to protocol treasury
     * @return dAppShare Amount sent to dApp recipient
     */
    function splitFeeToken(
        uint256 totalFee,
        address dAppRecipient,
        address token
    ) public override returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        require(totalFee > 0, "Zero fee");
        require(ubiRecipient != address(0), "UBI recipient not set");

        // Calculate shares
        ubiShare = (totalFee * ubiBPS) / 10000;
        protocolShare = (totalFee * protocolBPS) / 10000;
        dAppShare = totalFee - ubiShare - protocolShare;

        IERC20Transfer t = IERC20Transfer(token);
        require(t.transferFrom(msg.sender, address(this), totalFee), "transferFrom failed");
        require(t.transfer(ubiRecipient, ubiShare), "UBI transfer failed");
        require(t.transfer(protocolTreasury, protocolShare), "treasury transfer failed");
        require(t.transfer(dAppRecipient, dAppShare), "dapp transfer failed");

        // Update daily UBI tracking (convert to USD equivalent if needed)
        _updateDailyStablecoinUBI(ubiShare);

        emit FeeSplit(msg.sender, "token", totalFee, ubiShare, protocolShare, dAppShare, token);
    }

    /**
     * @notice Split stability fees with enhanced tracking.
     *         Called by VaultManager with detailed collateral type tracking.
     */
    function splitStabilityFee(
        uint256 totalFee,
        address dAppRecipient,
        address token,
        bytes32 ilk
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFeeToken(totalFee, dAppRecipient, token);

        // Update stability-specific stats
        totalStabilityFees += totalFee;
        totalUBIFromStability += ubiShare;
        stabilityFeesByIlk[ilk] += totalFee;
        vaultManagerContributions[msg.sender] += ubiShare;

        // Track new collateral types
        _addIlkIfNew(ilk);

        emit StabilityFeeSplit(ilk, totalFee, ubiShare);
    }

    /**
     * @notice Split minting fees with enhanced tracking.
     *         Called by PSM for USDC↔gUSD swaps.
     */
    function splitMintingFee(
        uint256 totalFee,
        address dAppRecipient,
        address token,
        address user,
        string calldata direction
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFeeToken(totalFee, dAppRecipient, token);

        // Update minting-specific stats
        totalMintingFees += totalFee;
        totalUBIFromMinting += ubiShare;
        mintingFeesByUser[user] += totalFee;
        psmContributions[msg.sender] += ubiShare;

        emit MintingFeeSplit(user, direction, totalFee, ubiShare);
    }

    /**
     * @notice Split liquidation penalties (future enhancement).
     *         Called when liquidation penalties are implemented as separate fees.
     */
    function splitLiquidationPenalty(
        uint256 totalFee,
        address dAppRecipient,
        address token,
        bytes32 ilk,
        address liquidatedUser
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFeeToken(totalFee, dAppRecipient, token);

        // Update liquidation-specific stats
        totalLiquidationFees += totalFee;
        totalUBIFromLiquidations += ubiShare;

        emit LiquidationPenaltySplit(ilk, liquidatedUser, totalFee, ubiShare);
    }

    /**
     * @notice Split governance fees (future enhancement).
     *         Called when governance fees are implemented.
     */
    function splitGovernanceFee(
        uint256 totalFee,
        address dAppRecipient,
        address token,
        address proposer
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) {
        (ubiShare, protocolShare, dAppShare) = splitFeeToken(totalFee, dAppRecipient, token);

        // Update governance-specific stats
        totalGovernanceFees += totalFee;
        totalUBIFromGovernance += ubiShare;

        emit GovernanceFeeSplit(proposer, totalFee, ubiShare);
    }

    /**
     * @notice Update daily UBI tracking for systematic stablecoin impact measurement.
     */
    function _updateDailyStablecoinUBI(uint256 ubiAmount) internal {
        uint256 currentDay = block.timestamp / 86400;

        if (currentDay > lastDayTimestamp) {
            // New day - emit previous day's impact and reset
            if (dailyStablecoinUBI > 0) {
                emit DailyStablecoinImpact(lastDayTimestamp, dailyStablecoinUBI);
            }
            dailyStablecoinUBI = ubiAmount;
            lastDayTimestamp = currentDay;
        } else {
            // Same day - accumulate
            dailyStablecoinUBI += ubiAmount;
        }
    }

    /**
     * @notice Add collateral type to active list if not already tracked.
     */
    function _addIlkIfNew(bytes32 ilk) internal {
        if (!ilkExists[ilk]) {
            ilkExists[ilk] = true;
            activeIlks.push(ilk);
        }
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

    function setUBIRecipient(address _ubiRecipient) external onlyAdmin {
        require(_ubiRecipient != address(0), "zero address");
        address oldRecipient = ubiRecipient;
        ubiRecipient = _ubiRecipient;
        emit UBIRecipientUpdated(oldRecipient, _ubiRecipient);
    }

    function setMonthlyTarget(uint256 _target) external onlyAdmin {
        uint256 oldTarget = monthlyTargetUBI;
        monthlyTargetUBI = _target;
        emit MonthlyTargetUpdated(oldTarget, _target);
    }

    /// @notice Update the GoodDollar token address when redeployed
    function setGoodDollar(address _goodDollar) external onlyAdmin {
        require(_goodDollar != address(0), "zero address");
        goodDollar = IGoodDollarToken(_goodDollar);
    }

    // ============ Analytics & Impact Measurement ============

    /**
     * @notice Get stablecoin protocol specific UBI statistics.
     */
    function getStablecoinUBIStats() external view returns (
        uint256 stabilityFees,
        uint256 mintingFees,
        uint256 liquidationFees,
        uint256 governanceFees,
        uint256 ubiFromStability,
        uint256 ubiFromMinting,
        uint256 ubiFromLiquidations,
        uint256 ubiFromGovernance,
        uint256 totalUBI
    ) {
        stabilityFees = totalStabilityFees;
        mintingFees = totalMintingFees;
        liquidationFees = totalLiquidationFees;
        governanceFees = totalGovernanceFees;
        ubiFromStability = totalUBIFromStability;
        ubiFromMinting = totalUBIFromMinting;
        ubiFromLiquidations = totalUBIFromLiquidations;
        ubiFromGovernance = totalUBIFromGovernance;
        totalUBI = ubiFromStability + ubiFromMinting + ubiFromLiquidations + ubiFromGovernance;
    }

    /**
     * @notice Calculate estimated monthly UBI contribution from stablecoin protocol.
     *         Target: $15K+ monthly from stablecoin operations.
     */
    function getMonthlyUBIEstimate() external view returns (uint256 estimated, uint256 target, uint256 progress) {
        // Estimate based on current daily activity
        uint256 totalUBI = totalUBIFromStability + totalUBIFromMinting + totalUBIFromLiquidations + totalUBIFromGovernance;
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
    function getTodayStablecoinImpact() external view returns (uint256 currentDay, uint256 ubiAmount) {
        currentDay = block.timestamp / 86400;
        ubiAmount = dailyStablecoinUBI;
    }

    /**
     * @notice Get collateral type breakdown for stability fees.
     */
    function getIlkBreakdown() external view returns (
        bytes32[] memory ilks,
        uint256[] memory fees
    ) {
        uint256 len = activeIlks.length;
        ilks = new bytes32[](len);
        fees = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            ilks[i] = activeIlks[i];
            fees[i] = stabilityFeesByIlk[activeIlks[i]];
        }
    }

    /**
     * @notice Calculate stablecoin social impact rate.
     *         Returns UBI generated per dollar of transaction volume.
     */
    function getStablecoinSocialImpactRate() external view returns (uint256) {
        uint256 totalVolume = totalStabilityFees + totalMintingFees + totalLiquidationFees + totalGovernanceFees;
        if (totalVolume == 0) return 0;

        uint256 totalUBI = totalUBIFromStability + totalUBIFromMinting + totalUBIFromLiquidations + totalUBIFromGovernance;
        // Return UBI per 10000 units of fee volume (for readability)
        return (totalUBI * 10000) / totalVolume;
    }

    /**
     * @notice Get number of active collateral types.
     */
    function getActiveIlkCount() external view returns (uint256) {
        return activeIlks.length;
    }

    /**
     * @notice Get stability fees for specific collateral type.
     */
    function getIlkStabilityFees(bytes32 ilk) external view returns (uint256) {
        return stabilityFeesByIlk[ilk];
    }

    /**
     * @notice Get minting fees for specific user.
     */
    function getUserMintingFees(address user) external view returns (uint256) {
        return mintingFeesByUser[user];
    }
}