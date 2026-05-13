// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stocks/PriceOracle.sol";

/**
 * @title SeedMissingOraclePrices
 * @notice Registers SOL/BNB/MATIC/ARB manual prices in the PriceOracle that
 *         PerpEngine actually uses (0x0165878...).
 *
 * Root cause (GOO-224 / GOO-225):
 *   PerpEngine.oracle is immutable and points to a PriceOracle (stocks contract)
 *   at 0x0165878A594ca255338adfa4d48449f69242Eb8F. That oracle was only seeded
 *   with ETH and AAPL manual prices. Markets 2-5 (SOL, BNB, MATIC, ARB) were
 *   created in PerpEngine by RedeployOracle.s.sol but their prices were mistakenly
 *   seeded into the new PerpPriceOracle (0x286b8de...) which PerpEngine does NOT use.
 *
 *   Result:
 *     - openPosition(2-5,...) reverts with FeedNotFound  (GOO-225)
 *     - closePosition(2-5) / liquidate(2-5) also revert  (GOO-224)
 *
 * Fix: call setManualPrice(ticker, price, true) on 0x0165878... for the 4 missing
 *      tickers so getPriceByKey(keccak256(abi.encodePacked(ticker))) returns a valid
 *      price for all 6 markets.
 *
 * Usage (devnet, default anvil key):
 *   forge script script/SeedMissingOraclePrices.s.sol \
 *     --rpc-url https://rpc.goodclaw.org --broadcast --legacy
 */
contract SeedMissingOraclePrices is Script {

    // PriceOracle (stocks) that PerpEngine.oracle points to (immutable)
    address constant PRICE_ORACLE = 0x0165878A594ca255338adfa4d48449f69242Eb8F;

    struct Market {
        string  ticker;
        uint256 price;  // 8-decimal USD (Chainlink format)
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        PriceOracle oracle = PriceOracle(PRICE_ORACLE);

        // These 4 markets were created in PerpEngine by RedeployOracle.s.sol but
        // their prices were never registered in this oracle instance.
        Market[4] memory markets = [
            Market("SOL",    18_000_000_000),  // SOL  @ $180.00
            Market("BNB",    60_000_000_000),  // BNB  @ $600.00
            Market("MATIC",      90_000_000),  // MATIC @ $0.90
            Market("ARB",       120_000_000)   // ARB  @ $1.20
        ];

        vm.startBroadcast(pk);

        for (uint256 i = 0; i < markets.length; i++) {
            oracle.setManualPrice(markets[i].ticker, markets[i].price, true);
            console.log(string.concat(
                "Seeded: ", markets[i].ticker, " @ ", vm.toString(markets[i].price)
            ));
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== SeedMissingOraclePrices Complete ===");
        console.log("PriceOracle:", PRICE_ORACLE);
        console.log("Markets seeded: SOL, BNB, MATIC, ARB");
        console.log("Fixes: GOO-224 (closePosition/liquidate revert) and");
        console.log("       GOO-225 (openPosition FeedNotFound)");
    }
}
