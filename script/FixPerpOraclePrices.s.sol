// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/perps/PerpPriceOracle.sol";

/**
 * @notice Fix GOO-476: PerpPriceOracle (0xf5c4a909…) has no markets registered
 *         and all prices return 0. Regression introduced when FixUBIFeeSplitterGDT
 *         (GOO-450) redeployed PerpEngine but incorrectly assumed the oracle already
 *         had prices — the oracle was never seeded after that redeploy.
 *
 *  Root-cause: FixUBIFeeSplitterGDT reused the existing PerpPriceOracle but skipped
 *  calling registerMarket() + setManualPrice() on it, leaving all 6 markets absent.
 *  PerpEngine.openPosition() reads the oracle via getPriceByKey() which returns 0,
 *  causing margin/liquidation checks to revert.
 *
 *  Fix: register all 6 markets and seed manual prices.
 *  Prices are 8-decimal (Chainlink standard): $1 = 1_00_000_000.
 *
 *  Usage (devnet):
 *    forge script script/FixPerpOraclePrices.s.sol \
 *      --rpc-url http://localhost:8545 --broadcast --legacy
 */
contract FixPerpOraclePrices is Script {
    // Current PerpPriceOracle — admin = 0xf39Fd6e5 (Anvil deployer)
    address constant ORACLE = 0xf5c4a909455C00B99A90d93b48736F3196DB5621;

    struct Market {
        string  ticker;
        uint256 markPrice;   // 8 decimals
        uint256 indexPrice;  // 8 decimals
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(pk);

        PerpPriceOracle oracle = PerpPriceOracle(ORACLE);

        Market[6] memory markets = [
            Market("BTC",   6_500_000_000_000,  6_498_000_000_000),
            Market("ETH",     320_000_000_000,    319_800_000_000),
            Market("SOL",      18_000_000_000,     17_990_000_000),
            Market("BNB",      60_000_000_000,     59_980_000_000),
            Market("MATIC",        90_000_000,         89_500_000),
            Market("ARB",         120_000_000,        119_800_000)
        ];

        for (uint256 i = 0; i < markets.length; i++) {
            bytes32 key = keccak256(abi.encodePacked(markets[i].ticker));
            oracle.registerMarket(key);
            oracle.setManualPrice(key, markets[i].markPrice, markets[i].indexPrice);
            console.log(
                string.concat(markets[i].ticker, " registered + priced: mark=", vm.toString(markets[i].markPrice))
            );
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== GOO-476 fix complete ===");
        console.log("PerpPriceOracle:", ORACLE);
        console.log("All 6 markets registered and priced.");
    }
}
