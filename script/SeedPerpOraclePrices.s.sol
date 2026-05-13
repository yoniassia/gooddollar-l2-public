// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/perps/PerpPriceOracle.sol";

/**
 * @title SeedPerpOraclePrices
 * @notice Seeds manual prices into PerpPriceOracle WITHOUT creating new engine markets.
 *
 *         Use this after a devnet restart when PerpEngine state is gone but the
 *         oracle just needs prices refreshed, OR when markets are already registered
 *         in PerpEngine and you only need to ensure oracle prices are live.
 *
 *         Differences from SeedPerpOracle.s.sol:
 *           - Does NOT call engine.createMarket() — avoids duplicate market IDs (GOO-399)
 *           - Calls registerMarket idempotently before setManualPrice
 *           - Safe to re-run at any time
 *
 * Usage:
 *   forge script script/SeedPerpOraclePrices.s.sol \
 *     --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
 */
contract SeedPerpOraclePrices is Script {

    // Latest deployment addresses (GOO-399, 2026-04-05)
    address constant PERP_PRICE_ORACLE = 0xf5c4a909455C00B99A90d93b48736F3196DB5621;

    struct PerpMarket {
        string  ticker;
        uint256 markPrice;   // 8-decimal USD (Chainlink format)
        uint256 indexPrice;  // 8-decimal USD
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        vm.startBroadcast(pk);

        PerpPriceOracle oracle = PerpPriceOracle(PERP_PRICE_ORACLE);

        PerpMarket[6] memory markets = [
            PerpMarket("BTC",  6_500_000_000_000,  6_498_000_000_000),
            PerpMarket("ETH",    320_000_000_000,    319_800_000_000),
            PerpMarket("SOL",     18_000_000_000,     17_990_000_000),
            PerpMarket("BNB",     60_000_000_000,     59_980_000_000),
            PerpMarket("MATIC",       90_000_000,        89_500_000),
            PerpMarket("ARB",        120_000_000,       119_800_000)
        ];

        for (uint256 i = 0; i < markets.length; i++) {
            PerpMarket memory m = markets[i];
            bytes32 key = keccak256(abi.encodePacked(m.ticker));

            // registerMarket is idempotent — safe to call even if already registered
            oracle.registerMarket(key);

            // setManualPrice requires market to be registered first
            oracle.setManualPrice(key, m.markPrice, m.indexPrice);

            console.log(string.concat(
                m.ticker,
                " mark=", vm.toString(m.markPrice),
                " index=", vm.toString(m.indexPrice)
            ));
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== PerpPriceOracle seeded (prices only) ===");
        console.log("Oracle:", PERP_PRICE_ORACLE);
        console.log("Markets: BTC ETH SOL BNB MATIC ARB");
        console.log("Manual override = true (prices never expire)");
    }
}
