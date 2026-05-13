// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stocks/PriceOracle.sol";

/**
 * @title SeedStocksOracle
 * @notice Re-seeds manual prices on the GoodStocks PriceOracle (0x20d7B364…).
 *
 * Background (GOO-451 follow-up):
 *   The StocksPriceOracle at 0x20d7B364E8Ed1F4260b5B90C41c2deC3C1F6D367
 *   has setManualPrice() called during DeployGoodStocks.s.sol, but devnet
 *   restarts from snapshot wipe oracle storage, leaving prices = 0.
 *
 *   Symptoms:
 *     - E2E test stocks/live_prices_from_oracle: wagmi useReadContracts calls
 *       revert with FeedNotFound for all tickers (useManualPrice[key]=false)
 *     - Frontend falls back to static FALLBACK_PRICES, isLive=false
 *     - E2E canary detects 0 live oracle calls → test fails
 *
 * Fix:
 *   Call setManualPrice(ticker, price, true) for all 12 tickers on the
 *   current oracle without redeploying any contracts.
 *
 * Usage (devnet):
 *   forge script script/SeedStocksOracle.s.sol \
 *     --rpc-url http://localhost:8545 --broadcast --legacy
 *
 *   Or via rpc.goodclaw.org:
 *   forge script script/SeedStocksOracle.s.sol \
 *     --rpc-url https://rpc.goodclaw.org --broadcast --legacy
 */
contract SeedStocksOracle is Script {
    // Current StocksPriceOracle — from devnet.ts (unchanged since GOO-414)
    address constant PRICE_ORACLE = 0x20d7B364E8Ed1F4260b5B90C41c2deC3C1F6D367;

    struct StockPrice {
        string  ticker;
        uint256 price; // 8-decimal USD (Chainlink format, e.g. 17_872_000_000 = $178.72)
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        PriceOracle oracle = PriceOracle(PRICE_ORACLE);

        // Prices match DeployGoodStocks.s.sol seeds exactly
        StockPrice[12] memory stocks = [
            StockPrice("AAPL",   17_872_000_000),  // $178.72
            StockPrice("TSLA",   24_850_000_000),  // $248.50
            StockPrice("NVDA",   87_530_000_000),  // $875.30
            StockPrice("MSFT",   41_560_000_000),  // $415.60
            StockPrice("AMZN",   18_215_000_000),  // $182.15
            StockPrice("GOOGL",  15_580_000_000),  // $155.80
            StockPrice("META",   50_325_000_000),  // $503.25
            StockPrice("JPM",    19_840_000_000),  // $198.40
            StockPrice("V",      27_990_000_000),  // $279.90
            StockPrice("DIS",    11_235_000_000),  // $112.35
            StockPrice("NFLX",   62_890_000_000),  // $628.90
            StockPrice("AMD",    16_480_000_000)   // $164.80
        ];

        vm.startBroadcast(pk);

        for (uint256 i = 0; i < stocks.length; i++) {
            oracle.setManualPrice(stocks[i].ticker, stocks[i].price, true);
            console.log("Seeded:", stocks[i].ticker, stocks[i].price);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== SeedStocksOracle complete ===");
        console.log("Oracle:", PRICE_ORACLE);
        console.log("12 stock prices active. E2E test stocks/live_prices_from_oracle should now pass.");
    }
}
