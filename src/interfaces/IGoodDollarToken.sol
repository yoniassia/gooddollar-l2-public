// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IGoodDollarToken — Shared interface for GoodDollar token interactions
 */
interface IGoodDollarToken {
    function mint(address to, uint256 amount) external;
    function isVerifiedHuman(address account) external view returns (bool);
    function dailyUBIAmount() external view returns (uint256);
    function fundUBIPool(uint256 amount) external;
    function ubiPool() external view returns (uint256);
    function totalVerifiedHumans() external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
