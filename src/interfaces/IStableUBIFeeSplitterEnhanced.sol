// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStableUBIFeeSplitterEnhanced
 * @notice Enhanced interface for stability fee tracking by collateral type.
 */
interface IStableUBIFeeSplitterEnhanced {
    function splitStabilityFee(
        uint256 totalFee,
        address dAppRecipient,
        address token,
        bytes32 ilk
    ) external returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}