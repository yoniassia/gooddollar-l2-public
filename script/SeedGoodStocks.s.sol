// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stocks/PriceOracle.sol";
import "../src/stocks/CollateralVault.sol";
import "../src/stocks/SyntheticAssetFactory.sol";
import "../src/stocks/SyntheticAsset.sol";
import "../src/GoodDollarToken.sol";

/**
 * @title SeedGoodStocks
 * @notice Seeds the GoodStocks system with initial positions.
 *         Also (re-)sets manual oracle prices for all 12 stocks so that
 *         prices survive devnet redeployments where the oracle bytecode is
 *         fresh but `setManualPrice` was not called again.
 *
 * Usage:
 *   PRIVATE_KEY=0x... \
 *   GOOD_DOLLAR_TOKEN=0x... \
 *   COLLATERAL_VAULT=0x... \
 *   forge script script/SeedGoodStocks.s.sol --rpc-url $RPC --broadcast --legacy
 */
contract SeedGoodStocks is Script {
    struct SeedPosition {
        string ticker;
        uint256 collateralG;  // G$ to deposit (18 decimals)
        uint256 shares;       // Synthetic shares to mint (18 decimals, 1e18 = 1 share)
    }

    struct StockPrice {
        string ticker;
        uint256 price; // 8 decimals, Chainlink standard
    }

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address gdToken = vm.envAddress("GOOD_DOLLAR_TOKEN");
        address vaultAddr = vm.envAddress("COLLATERAL_VAULT");

        CollateralVault vault = CollateralVault(vaultAddr);
        PriceOracle oracle = vault.oracle();
        GoodDollarToken gd = GoodDollarToken(gdToken);

        // ── 1. (Re-)set manual oracle prices for all 12 stocks ──────────────
        StockPrice[] memory prices = new StockPrice[](12);
        prices[0]  = StockPrice("AAPL",  178_72_000_000);
        prices[1]  = StockPrice("TSLA",  248_50_000_000);
        prices[2]  = StockPrice("NVDA",  875_30_000_000);
        prices[3]  = StockPrice("MSFT",  415_60_000_000);
        prices[4]  = StockPrice("AMZN",  182_15_000_000);
        prices[5]  = StockPrice("GOOGL", 155_80_000_000);
        prices[6]  = StockPrice("META",  503_25_000_000);
        prices[7]  = StockPrice("JPM",   198_40_000_000);
        prices[8]  = StockPrice("V",     279_90_000_000);
        prices[9]  = StockPrice("DIS",   112_35_000_000);
        prices[10] = StockPrice("NFLX",  628_90_000_000);
        prices[11] = StockPrice("AMD",   164_80_000_000);

        vm.startBroadcast(deployerKey);

        for (uint256 i = 0; i < prices.length; i++) {
            oracle.setManualPrice(prices[i].ticker, prices[i].price, true);
            console.log("Oracle price set:", prices[i].ticker, prices[i].price);
        }

        // ── 2. Seed initial positions ────────────────────────────────────────
        SeedPosition[] memory positions = new SeedPosition[](4);
        positions[0] = SeedPosition("AAPL",  50_000e18, 10e18);  // 10 sAAPL
        positions[1] = SeedPosition("TSLA",  75_000e18, 10e18);  // 10 sTSLA
        positions[2] = SeedPosition("NVDA", 250_000e18, 10e18);  // 10 sNVDA
        positions[3] = SeedPosition("GOOGL", 50_000e18, 10e18);  // 10 sGOOGL

        // Approve vault to spend G$
        gd.approve(vaultAddr, type(uint256).max);

        for (uint256 i = 0; i < positions.length; i++) {
            SeedPosition memory pos = positions[i];

            // Deposit collateral
            vault.depositCollateral(pos.ticker, pos.collateralG);
            console.log(string.concat("Deposited ", vm.toString(pos.collateralG / 1e18), " G$ for ", pos.ticker));

            // Mint synthetic shares
            vault.mint(pos.ticker, pos.shares);
            console.log(string.concat("Minted ", vm.toString(pos.shares / 1e18), " s", pos.ticker));
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== GoodStocks Seeding Complete ===");
        console.log("Oracle prices set: 12 stocks");
        console.log("Positions created: 4 (sAAPL, sTSLA, sNVDA, sGOOGL)");
    }
}
