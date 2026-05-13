// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IPerpPriceOracle {
    function registerMarket(bytes32 key) external;
    function setManualPrice(bytes32 key, uint256 markPrice, uint256 indexPrice) external;
    function supportedMarkets(bytes32 key) external view returns (bool);
}

interface IPerpEngine {
    function createMarket(bytes32 oracleKey, bytes32 indexOracleKey, uint256 maxLeverage) external returns (uint256);
    function marketCount() external view returns (uint256);
}

/**
 * @title SeedRemainingPerps
 * @notice Seeds the remaining perps markets (SOL, BNB, MATIC, ARB) that weren't
 *         created in the initial deployment. Skips already-registered markets.
 */
contract SeedRemainingPerps is Script {
    address constant ORACLE = 0xf5c4a909455C00B99A90d93b48736F3196DB5621;
    address constant ENGINE = 0x666D0c3da3dBc946D5128D06115bb4eed4595580;

    struct Market {
        string  ticker;
        uint256 markPrice;   // 8 decimals
        uint256 indexPrice;  // 8 decimals
        uint256 maxLeverage;
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        IPerpPriceOracle oracle = IPerpPriceOracle(ORACLE);
        IPerpEngine engine = IPerpEngine(ENGINE);

        uint256 existingCount = engine.marketCount();
        console.log("Existing markets:", existingCount);

        // Markets to add (skipping BTC and ETH which already exist)
        Market[4] memory markets = [
            Market("SOL",    18_000_000_000,    17_990_000_000, 25),   // SOL @ $180
            Market("BNB",    60_000_000_000,    59_980_000_000, 25),   // BNB @ $600
            Market("MATIC",      90_000_000,       89_500_000, 20),    // MATIC @ $0.90
            Market("ARB",       120_000_000,      119_800_000, 20)     // ARB @ $1.20
        ];

        vm.startBroadcast(pk);

        uint256 added = 0;
        for (uint256 i = 0; i < markets.length; i++) {
            bytes32 key = keccak256(abi.encodePacked(markets[i].ticker));

            // Register in oracle (idempotent)
            if (!oracle.supportedMarkets(key)) {
                oracle.registerMarket(key);
                console.log("Registered oracle market:", markets[i].ticker);
            } else {
                console.log("Oracle market already registered:", markets[i].ticker);
            }

            // Set manual price
            oracle.setManualPrice(key, markets[i].markPrice, markets[i].indexPrice);
            console.log("  Price set:", markets[i].markPrice);

            // Create in engine
            uint256 marketId = engine.createMarket(key, key, markets[i].maxLeverage);
            console.log("  Engine market created (id:", marketId, ")");
            added++;
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Seeding Complete ===");
        console.log("Markets added:", added);
        console.log("Total markets:", existingCount + added);
    }
}
