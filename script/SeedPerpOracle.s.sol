// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/perps/PerpPriceOracle.sol";
import "../src/perps/PerpEngine.sol";

/**
 * @title SeedPerpOracle
 * @notice Seeds the PerpPriceOracle with initial markets and manual prices,
 *         and registers those markets in PerpEngine.
 *
 * The PerpPriceOracle requires:
 *   1. registerMarket(key)     — admin registers a market key before any price can be set
 *   2. setManualPrice(key, mark, index) — admin sets manual override price
 *
 * PerpEngine.addMarket(oracleKey, maxLeverage) registers the market in the engine.
 *
 * Usage (devnet):
 *   PRIVATE_KEY=0x... \
 *   forge script script/SeedPerpOracle.s.sol \
 *     --rpc-url $DEVNET_RPC --broadcast --legacy
 *
 * Prices use 8-decimal Chainlink format (e.g., BTC @ $65,000 = 6_500_000_000_000).
 */
contract SeedPerpOracle is Script {

    // ─── Deployed addresses (devnet, chain 42069) ────────────────────────────
    address constant PERP_PRICE_ORACLE = 0xf5c4a909455C00B99A90d93b48736F3196DB5621;
    address constant PERP_ENGINE       = 0x666D0c3da3dBc946D5128D06115bb4eed4595580;

    struct PerpMarket {
        string  ticker;
        uint256 markPrice;   // 8-decimal USD (Chainlink format)
        uint256 indexPrice;  // 8-decimal USD
        uint256 maxLeverage; // e.g., 50 = 50x
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        vm.startBroadcast(pk);

        PerpPriceOracle oracle = PerpPriceOracle(PERP_PRICE_ORACLE);
        PerpEngine      engine = PerpEngine(PERP_ENGINE);

        // ─── Markets: ticker, markPrice (8 dec), indexPrice (8 dec), maxLeverage ─
        PerpMarket[6] memory markets = [
            PerpMarket("BTC",  6_500_000_000_000,  6_498_000_000_000, 50),
            PerpMarket("ETH",    320_000_000_000,    319_800_000_000, 50),
            PerpMarket("SOL",      180_00_000_000,     179_90_000_000, 25),
            PerpMarket("BNB",      600_00_000_000,     599_80_000_000, 25),
            PerpMarket("MATIC",       90_000_000,        89_500_000, 20),
            PerpMarket("ARB",       120_000_000,       119_800_000, 20)
        ];

        for (uint256 i = 0; i < markets.length; i++) {
            PerpMarket memory m = markets[i];
            bytes32 key = keccak256(abi.encodePacked(m.ticker));

            // 1. Register market in oracle
            oracle.registerMarket(key);
            console.log("Registered market:", m.ticker);

            // 2. Set initial manual price (manualOverride = true so it never goes stale)
            oracle.setManualPrice(key, m.markPrice, m.indexPrice);
            console.log(string.concat("  mark=", vm.toString(m.markPrice),
                " index=", vm.toString(m.indexPrice)));

            // 3. Register market in PerpEngine
            uint256 marketId = engine.createMarket(key, key, m.maxLeverage);
            console.log(string.concat("  PerpEngine market added (id=",
                vm.toString(marketId), ", maxLeverage=", vm.toString(m.maxLeverage), "x)"));
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== PerpOracle Seeding Complete ===");
        console.log("PerpPriceOracle:", PERP_PRICE_ORACLE);
        console.log("PerpEngine:     ", PERP_ENGINE);
        console.log("Markets seeded: 6 (BTC, ETH, SOL, BNB, MATIC, ARB)");
        console.log("");
        console.log("NOTE: Manual override prices never expire.");
        console.log("Run a keeper to push live prices for production.");
    }
}
