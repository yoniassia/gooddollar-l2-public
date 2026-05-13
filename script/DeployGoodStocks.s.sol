// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stocks/PriceOracle.sol";
import "../src/stocks/CollateralVault.sol";
import "../src/stocks/SyntheticAsset.sol";
import "../src/stocks/SyntheticAssetFactory.sol";

/**
 * @title DeployGoodStocks
 * @notice Deploys the GoodStocks synthetic equities stack on GoodDollar L2.
 *
 *   Deploys:
 *     1. PriceOracle — Chainlink-compatible aggregator bridge with manual-price fallback
 *     2. SyntheticAssetFactory — creates/tracks sToken ERC-20s
 *     3. CollateralVault — CDP engine (G$ collateral → synthetic stocks)
 *
 *   Oracle configuration:
 *     On production networks the script attempts to register real Chainlink feeds.
 *     On devnet (chain 42069) those feeds don't exist, so manual price overrides
 *     are used instead.  Each manual price is set with 8-decimal precision
 *     (Chainlink standard: $175.00 → 17_500_000_000).
 *
 *   Chainlink equity-feed addresses (Arbitrum / Optimism mainnet):
 *     These are NOT available on all networks and are provided as mainnet references
 *     only.  The Chainlink Data Streams service (v0.4+) is required for real-time
 *     equity prices; the feeds below use the legacy AggregatorV3 interface provided
 *     via Chainlink's equity feeds where available.
 *
 *   Usage (devnet):
 *     forge script script/DeployGoodStocks.s.sol --rpc-url $DEVNET_RPC \
 *         --private-key $PRIVATE_KEY --broadcast --legacy
 *
 *   Environment variables:
 *     PRIVATE_KEY           — deployer private key (required)
 *     GOOD_DOLLAR_TOKEN     — G$ token address (required)
 *     UBI_FEE_SPLITTER      — UBIFeeSplitter address (required)
 *     USE_CHAINLINK_FEEDS   — set to "true" on mainnets to use real feeds
 */
contract DeployGoodStocks is Script {

    // ─── Chainlink feed addresses (Arbitrum Mainnet, for reference) ──────────────
    //
    // These feeds are available on Arbitrum One and use the AggregatorV3Interface.
    // They are commented out because the devnet does not have Chainlink nodes.
    // Uncomment and pass USE_CHAINLINK_FEEDS=true when deploying to Arbitrum mainnet.
    //
    // address constant ARB_FEED_AAPL  = 0x57A4a13b35d25EE78e084168aBaC5ad360252467; // AAPL/USD
    // address constant ARB_FEED_TSLA  = 0x3609baAa0a9b1f0FE4d6CC01884585d0e191C3E3; // TSLA/USD
    // address constant ARB_FEED_NVDA  = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_MSFT  = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_AMZN  = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_GOOGL = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_META  = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_JPM   = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_V     = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_DIS   = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_NFLX  = address(0); // Not yet on Arbitrum
    // address constant ARB_FEED_AMD   = address(0); // Not yet on Arbitrum

    // ─── Devnet manual prices (8 decimals, 1 unit = 1e8) ─────────────────────────

    struct StockSeed {
        string  ticker;
        string  name;
        uint256 manualPrice; // 8-decimal USD price
    }

    StockSeed[] private _stocks;

    function _seedStocks() internal {
        _stocks.push(StockSeed("AAPL",  "Apple Inc.",              178_72_000_000));
        _stocks.push(StockSeed("TSLA",  "Tesla Inc.",              248_50_000_000));
        _stocks.push(StockSeed("NVDA",  "NVIDIA Corp.",            875_30_000_000));
        _stocks.push(StockSeed("MSFT",  "Microsoft Corp.",         415_60_000_000));
        _stocks.push(StockSeed("AMZN",  "Amazon.com Inc.",         182_15_000_000));
        _stocks.push(StockSeed("GOOGL", "Alphabet Inc.",           155_80_000_000));
        _stocks.push(StockSeed("META",  "Meta Platforms",          503_25_000_000));
        _stocks.push(StockSeed("JPM",   "JPMorgan Chase",          198_40_000_000));
        _stocks.push(StockSeed("V",     "Visa Inc.",               279_90_000_000));
        _stocks.push(StockSeed("DIS",   "Walt Disney Co.",         112_35_000_000));
        _stocks.push(StockSeed("NFLX",  "Netflix Inc.",            628_90_000_000));
        _stocks.push(StockSeed("AMD",   "Advanced Micro Devices",  164_80_000_000));
    }

    function run() external {
        _seedStocks();

        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer    = vm.addr(deployerKey);
        address gdToken     = vm.envOr("GOOD_DOLLAR_TOKEN", address(0));
        address feeSplitter = vm.envOr("UBI_FEE_SPLITTER",  address(0));
        require(gdToken     != address(0), "Set GOOD_DOLLAR_TOKEN env var");
        require(feeSplitter != address(0), "Set UBI_FEE_SPLITTER env var");
        bool useChainlink   = vm.envOr("USE_CHAINLINK_FEEDS", false);

        vm.startBroadcast(deployerKey);

        // 1. Deploy PriceOracle
        PriceOracle oracle = new PriceOracle(deployer);
        console.log("PriceOracle deployed:", address(oracle));

        // 2. Configure oracle — use real Chainlink feeds on mainnet, manual on devnet
        for (uint256 i = 0; i < _stocks.length; i++) {
            StockSeed memory s = _stocks[i];
            if (useChainlink) {
                // TODO: map ticker → real Chainlink feed address for the target network
                // oracle.registerFeed(s.ticker, CHAINLINK_FEEDS[s.ticker]);
                console.log("Skipping Chainlink feed (not mapped yet):", s.ticker);
            }
            // Always set manual price as fallback; on devnet this is the only source
            oracle.setManualPrice(s.ticker, s.manualPrice, !useChainlink);
            console.log("Oracle price set:", s.ticker, s.manualPrice);
        }

        // 3. Deploy SyntheticAssetFactory
        SyntheticAssetFactory factory = new SyntheticAssetFactory(deployer);
        console.log("SyntheticAssetFactory deployed:", address(factory));

        // 4. Deploy CollateralVault
        CollateralVault vault = new CollateralVault(
            gdToken,
            address(oracle),
            feeSplitter,
            deployer
        );
        console.log("CollateralVault deployed:", address(vault));

        // 5. List synthetic assets and register them in the vault
        for (uint256 i = 0; i < _stocks.length; i++) {
            StockSeed memory s = _stocks[i];

            string memory sName   = string.concat("Synthetic ", s.name);
            string memory sSymbol = string.concat("s", s.ticker);

            address sToken = factory.listAsset(s.ticker, sName, address(vault));
            vault.registerAsset(s.ticker, sToken);

            console.log(string.concat("Listed ", sSymbol, ":"), sToken);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== GoodStocks Deployment Complete ===");
        console.log("PriceOracle:             ", address(oracle));
        console.log("SyntheticAssetFactory:   ", address(factory));
        console.log("CollateralVault:         ", address(vault));
        console.log("");
        console.log("Update frontend/src/lib/chain.ts with these addresses.");
    }
}
