// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IMarketFactory {
    function tokens() external view returns (address);
}

contract ReadMarketFactory is Script {
    address constant MF = 0xc7cDb7A2E5dDa1B7A0E792Fe1ef08ED20A6F56D4;

    function run() external view {
        address ct = IMarketFactory(MF).tokens();
        console.log("MarketFactory:", MF);
        console.log("ConditionalTokens (tokens()):", ct);
    }
}
