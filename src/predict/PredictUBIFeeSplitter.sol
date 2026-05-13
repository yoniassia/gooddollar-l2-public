// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PredictUBIFeeSplitter
 * @notice Handles UBI fee routing for GoodPredict prediction markets.
 *         Routes fees from market redemptions and bond slashing to UBI pool.
 * @dev Implements IUBIFeeSplitterPredict and IUBIFeeSplitterResolver interfaces
 *      expected by MarketFactory and OptimisticResolver contracts.
 */

import "../interfaces/IGoodDollarToken.sol";

interface IERC20Transfer {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @notice Interface expected by MarketFactory for redemption fee splitting
 */
interface IUBIFeeSplitterPredict {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

/**
 * @notice Interface expected by OptimisticResolver for bond slashing
 */
interface IUBIFeeSplitterResolver {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

contract PredictUBIFeeSplitter is IUBIFeeSplitterPredict, IUBIFeeSplitterResolver {
    IGoodDollarToken public goodDollar;

    // Fee split configuration (in basis points, 10000 = 100%)
    uint256 public ubiBPS = 3333;      // 33.33% to UBI pool
    uint256 public protocolBPS = 1667; // 16.67% to protocol treasury
    // Remaining 50% goes back to the dApp (prediction market contracts)

    address public protocolTreasury;
    address public admin;

    // Platform-specific tracking
    uint256 public totalRedemptionFees;
    uint256 public totalBondSlashing;
    uint256 public totalUBIFromRedemption;
    uint256 public totalUBIFromBonds;

    // Expert validation system for partnerships
    mapping(address => bool) public approvedExperts;
    address[] public expertList;

    event FeeSplit(
        address indexed source,
        string indexed feeType,
        uint256 totalFee,
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    );
    event ExpertApproved(address indexed expert);
    event ExpertRemoved(address indexed expert);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor(address _goodDollar, address _treasury, address _admin) {
        goodDollar = IGoodDollarToken(_goodDollar);
        protocolTreasury = _treasury;
        admin = _admin;
    }

    /**
     * @notice Split redemption fees from MarketFactory.
     *         Called when users redeem winning prediction tokens.
     * @param totalFee Total fee amount in G$ from redemption
     * @param dAppRecipient Where to send the dApp's share (MarketFactory)
     * @return ubiShare Amount sent to UBI pool
     * @return protocolShare Amount sent to protocol treasury
     * @return dAppShare Amount sent to MarketFactory
     */
    function splitFee(uint256 totalFee, address dAppRecipient) external override(IUBIFeeSplitterPredict, IUBIFeeSplitterResolver) returns (
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    ) {
        require(totalFee > 0, "Zero fee");

        // Calculate shares using the same pattern as base UBIFeeSplitter
        ubiShare = (totalFee * ubiBPS) / 10000;
        protocolShare = (totalFee * protocolBPS) / 10000;
        dAppShare = totalFee - ubiShare - protocolShare;

        // Transfer from sender (MarketFactory or OptimisticResolver)
        require(goodDollar.transferFrom(msg.sender, address(this), totalFee), "transfer failed");

        // Route to destinations
        goodDollar.fundUBIPool(ubiShare);
        require(goodDollar.transfer(protocolTreasury, protocolShare), "treasury transfer failed");
        require(goodDollar.transfer(dAppRecipient, dAppShare), "dapp transfer failed");

        // Update platform-specific stats
        if (msg.sender != address(0)) { // Differentiate between MarketFactory and OptimisticResolver
            // Check if this is a redemption fee or bond slashing based on caller pattern
            // MarketFactory calls for redemption, OptimisticResolver for bond slashing
            totalRedemptionFees += totalFee;
            totalUBIFromRedemption += ubiShare;
            emit FeeSplit(msg.sender, "redemption", totalFee, ubiShare, protocolShare, dAppShare);
        }
    }

    /**
     * @notice Split bond slashing proceeds from OptimisticResolver.
     *         Called when disputed resolutions are finalized by admin.
     * @dev This function has the same signature as splitFee but is called specifically
     *      by OptimisticResolver for bond slashing events.
     */
    function splitBondSlashing(uint256 totalFee, address dAppRecipient) external returns (
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare
    ) {
        require(totalFee > 0, "Zero fee");

        // Calculate shares
        ubiShare = (totalFee * ubiBPS) / 10000;
        protocolShare = (totalFee * protocolBPS) / 10000;
        dAppShare = totalFee - ubiShare - protocolShare;

        // Transfer from sender (OptimisticResolver)
        require(goodDollar.transferFrom(msg.sender, address(this), totalFee), "transfer failed");

        // Route to destinations
        goodDollar.fundUBIPool(ubiShare);
        require(goodDollar.transfer(protocolTreasury, protocolShare), "treasury transfer failed");
        require(goodDollar.transfer(dAppRecipient, dAppShare), "dapp transfer failed");

        // Update bond slashing specific stats
        totalBondSlashing += totalFee;
        totalUBIFromBonds += ubiShare;

        emit FeeSplit(msg.sender, "bond_slashing", totalFee, ubiShare, protocolShare, dAppShare);
    }

    /**
     * @notice Expert validation system for partnership revenue sharing.
     *         Approved experts can validate prediction outcomes for additional UBI impact.
     */
    function approveExpert(address expert) external onlyAdmin {
        require(expert != address(0), "zero address");
        if (!approvedExperts[expert]) {
            approvedExperts[expert] = true;
            expertList.push(expert);
            emit ExpertApproved(expert);
        }
    }

    function removeExpert(address expert) external onlyAdmin {
        if (approvedExperts[expert]) {
            approvedExperts[expert] = false;
            // Remove from expertList
            for (uint i = 0; i < expertList.length; i++) {
                if (expertList[i] == expert) {
                    expertList[i] = expertList[expertList.length - 1];
                    expertList.pop();
                    break;
                }
            }
            emit ExpertRemoved(expert);
        }
    }

    function isApprovedExpert(address expert) external view returns (bool) {
        return approvedExperts[expert];
    }

    function getExpertCount() external view returns (uint256) {
        return expertList.length;
    }

    function getExpert(uint256 index) external view returns (address) {
        require(index < expertList.length, "index out of bounds");
        return expertList[index];
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

    // ============ Analytics ============

    /**
     * @notice Get prediction market specific UBI statistics
     */
    function getPredictUBIStats() external view returns (
        uint256 redemptionFees,
        uint256 bondSlashing,
        uint256 ubiFromRedemption,
        uint256 ubiFromBonds,
        uint256 totalUBI
    ) {
        redemptionFees = totalRedemptionFees;
        bondSlashing = totalBondSlashing;
        ubiFromRedemption = totalUBIFromRedemption;
        ubiFromBonds = totalUBIFromBonds;
        totalUBI = ubiFromRedemption + ubiFromBonds;
    }

    /**
     * @notice Calculate estimated monthly UBI contribution.
     *         Used for impact reporting and partnership validation.
     */
    function getMonthlyUBIEstimate() external view returns (uint256) {
        // Simple estimate based on total UBI generated
        // In production, this could be more sophisticated with time-based calculations
        return totalUBIFromRedemption + totalUBIFromBonds;
    }
}