// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UBI Fee Splitter Interfaces
 * @notice Interfaces for all UBI fee splitter contracts used across GoodDollar L2 platforms.
 */

/**
 * @notice Base interface for UBI fee splitting used by most dApps
 */
interface IUBIFeeSplitter {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

/**
 * @notice Interface for GoodPredict prediction market fee splitting
 *         Used by MarketFactory for redemption fees
 */
interface IUBIFeeSplitterPredict {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);

    function splitBondSlashing(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);

    function approveExpert(address expert) external;
    function removeExpert(address expert) external;
    function isApprovedExpert(address expert) external view returns (bool);
    function getPredictUBIStats() external view returns (
        uint256 redemptionFees,
        uint256 bondSlashing,
        uint256 ubiFromRedemption,
        uint256 ubiFromBonds,
        uint256 totalUBI
    );
    function getMonthlyUBIEstimate() external view returns (uint256);
}

/**
 * @notice Interface for OptimisticResolver bond slashing
 *         Used by OptimisticResolver for disputed resolution fees
 */
interface IUBIFeeSplitterResolver {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}

/**
 * @notice Extended interface for GoodStocks tokenized equity fee splitting
 *         Used by CollateralVault for trading and liquidation fees
 */
interface IUBIFeeSplitterStocks {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);

    function splitMintFee(
        uint256 totalFee,
        address dAppRecipient,
        address trader,
        string calldata asset,
        uint256 amount
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);

    function splitBurnFee(
        uint256 totalFee,
        address dAppRecipient,
        address trader,
        string calldata asset,
        uint256 amount
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);

    function splitLiquidationProceeds(
        uint256 totalProceeds,
        address dAppRecipient,
        address liquidatedUser
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);

    function addImpactPartner(address partner, uint256 sharesBPS) external;
    function removeImpactPartner(address partner) external;
    function getStocksUBIStats() external view returns (
        uint256 mintFees,
        uint256 burnFees,
        uint256 liquidationProceeds,
        uint256 ubiFromTrading,
        uint256 ubiFromLiquidations,
        uint256 totalUBI
    );
    function getMonthlyUBIEstimate() external view returns (uint256);
    function getTodayUBIImpact() external view returns (uint256 currentDay, uint256 ubiAmount);
    function getSocialImpactRate() external view returns (uint256);
}