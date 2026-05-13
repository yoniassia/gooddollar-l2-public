// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGoodStable — Shared interfaces for GoodStable protocol
 * @notice Extracted to avoid duplicate declarations across contracts.
 */

interface IgUSD {
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
    function burnFrom(address from, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

interface ICollateralRegistry {
    struct CollateralConfig {
        address token;
        uint256 liquidationRatio;   // WAD
        uint256 liquidationPenalty; // WAD
        uint256 debtCeiling;        // absolute gUSD
        uint256 stabilityFeeRate;   // RAY per-second
        bool    active;
    }
    function getConfig(bytes32 ilk) external view returns (CollateralConfig memory);
    function ilkExists(bytes32 ilk) external view returns (bool);
}

interface IPriceOracle {
    /// @notice Returns the USD price of the collateral for the given ilk, 18-decimal.
    function getPrice(bytes32 ilk) external view returns (uint256);
}

interface IStabilityPool {
    /// @notice Absorb debtAmount of bad debt, distributing collAmount to depositors.
    function offset(uint256 debtAmount, bytes32 ilk, uint256 collAmount) external;
    function totalDeposits() external view returns (uint256);
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

interface IUBIFeeSplitter {
    function splitFee(uint256 totalFee, address dAppRecipient)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);

    /// @notice Token-agnostic variant — use when fees are in any ERC-20 other than G$.
    function splitFeeToken(uint256 totalFee, address dAppRecipient, address token)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare);
}
