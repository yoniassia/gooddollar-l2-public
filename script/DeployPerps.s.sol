// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/perps/PerpPriceOracle.sol";
import "../src/perps/FundingRate.sol";
import "../src/perps/MarginVault.sol";
import "../src/perps/PerpEngine.sol";

/**
 * @title DeployPerps
 * @notice Full fresh deployment of the GoodPerps system on devnet.
 *
 *   Deploy order:
 *     1. PerpPriceOracle  — price feed (admin is keeper by default)
 *     2. FundingRate      — 8-hour funding calculator
 *     3. MarginVault      — G$ collateral vault (linked to engine after step 4)
 *     4. PerpEngine       — core trading engine (vault + funding + oracle wired in constructor)
 *     5. Wire FundingRate.setPerpEngine(engine)
 *     6. Wire MarginVault.setPerpEngine(engine)
 *     7. Seed 6 markets: BTC, ETH, SOL, BNB, MATIC, ARB
 *
 *   Environment:
 *     PRIVATE_KEY  — deployer private key
 *     GD_TOKEN     — GoodDollar token address (defaults to current devnet address)
 *     FEE_SPLITTER — UBIFeeSplitter address (defaults to current devnet address)
 */
contract DeployPerps is Script {

    // Current devnet addresses (chain 42069)
    // FEE_SPLITTER updated by FixUBIFeeSplitterGDT.s.sol (GOO-450 fix, 2026-04-05)
    address constant GD_TOKEN_DEFAULT     = 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570;
    address constant FEE_SPLITTER_DEFAULT = 0x3abBB0D6ad848d64c8956edC9Bf6f18aC22E1485;

    struct Market {
        string  ticker;
        uint256 markPrice;   // 8-decimal USD (Chainlink format)
        uint256 indexPrice;  // 8-decimal USD
        uint256 maxLeverage;
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(pk);

        address gdToken     = vm.envOr("GD_TOKEN",     GD_TOKEN_DEFAULT);
        address feeSplitter = vm.envOr("FEE_SPLITTER", FEE_SPLITTER_DEFAULT);

        vm.startBroadcast(pk);

        // 1. Deploy PerpPriceOracle
        PerpPriceOracle oracle = new PerpPriceOracle(deployer);
        console.log("PerpPriceOracle:", address(oracle));

        // 2. Deploy FundingRate
        FundingRate funding = new FundingRate(deployer);
        console.log("FundingRate:    ", address(funding));

        // 3. Deploy MarginVault
        MarginVault vault = new MarginVault(gdToken, deployer);
        console.log("MarginVault:    ", address(vault));

        // 4. Deploy PerpEngine
        PerpEngine engine = new PerpEngine(
            address(vault),
            address(funding),
            address(oracle),
            feeSplitter,
            deployer
        );
        console.log("PerpEngine:     ", address(engine));

        // 5. Wire FundingRate → PerpEngine
        funding.setPerpEngine(address(engine));
        console.log("FundingRate wired to engine");

        // 6. Wire MarginVault → PerpEngine
        vault.setPerpEngine(address(engine));
        console.log("MarginVault wired to engine");

        // 7. Seed markets
        Market[6] memory markets = [
            Market("BTC",  6_500_000_000_000,  6_498_000_000_000, 50),
            Market("ETH",    320_000_000_000,    319_800_000_000, 50),
            Market("SOL",     18_000_000_000,     17_990_000_000, 25),
            Market("BNB",     60_000_000_000,     59_980_000_000, 25),
            Market("MATIC",       90_000_000,        89_500_000, 20),
            Market("ARB",        120_000_000,       119_800_000, 20)
        ];

        for (uint256 i = 0; i < markets.length; i++) {
            Market memory m = markets[i];
            bytes32 key = keccak256(abi.encodePacked(m.ticker));

            oracle.registerMarket(key);
            oracle.setManualPrice(key, m.markPrice, m.indexPrice);
            uint256 marketId = engine.createMarket(key, key, m.maxLeverage);
            console.log(
                string.concat(m.ticker, " market id=", vm.toString(marketId),
                    " leverage=", vm.toString(m.maxLeverage), "x")
            );
        }

        vm.stopBroadcast();

        console.log("\n=== GoodPerps Deployment Complete ===");
        console.log("Chain:          42069 (devnet)");
        console.log("PerpPriceOracle:", address(oracle));
        console.log("FundingRate:    ", address(funding));
        console.log("MarginVault:    ", address(vault));
        console.log("PerpEngine:     ", address(engine));
        console.log("GD collateral:  ", gdToken);
        console.log("FeeSplitter:    ", feeSplitter);
        console.log("Markets:        6 (BTC ETH SOL BNB MATIC ARB)");
        console.log("\nNOTE: Update SeedPerpOracle.s.sol and SeedRemainingPerps.s.sol");
        console.log("      with the new PerpPriceOracle and PerpEngine addresses above.");
    }
}
