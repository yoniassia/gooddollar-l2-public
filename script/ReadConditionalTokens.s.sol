// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IConditionalTokens {
    function factory() external view returns (address);
}

contract ReadConditionalTokens is Script {
    address constant CT  = 0x28f057Dc79e3Cb77B2bbF4358D7A690CFe21b2D5;
    address constant MF  = 0xc7cDb7A2E5dDa1B7A0E792Fe1ef08ED20A6F56D4;

    function run() external view {
        address factory = IConditionalTokens(CT).factory();
        console.log("ConditionalTokens:", CT);
        console.log("factory():", factory);
        console.log("Expected MarketFactory:", MF);
        console.log("Match:", factory == MF);
    }
}
