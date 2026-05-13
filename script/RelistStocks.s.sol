// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stocks/SyntheticAssetFactory.sol";
import "../src/stocks/CollateralVault.sol";
import "../src/stocks/PriceOracle.sol";

/**
 * @title RelistStocks
 * @notice Re-lists all 12 synthetic stocks on redeployed Factory + Vault,
 *         and sets manual prices on the existing (verified) PriceOracle.
 */
contract RelistStocks is Script {
    address constant FACTORY = 0xd710a67624Ad831683C86a48291c597adE30F787;
    address constant VAULT   = 0xd30bF3219A0416602bE8D482E0396eF332b0494E;
    address constant ORACLE  = 0xa4E00CB342B36eC9fDc4B50b3d527c3643D4C49e;

    struct Stock { string ticker; string name; uint256 price; }

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        SyntheticAssetFactory factory = SyntheticAssetFactory(FACTORY);
        CollateralVault vault = CollateralVault(VAULT);
        PriceOracle oracle = PriceOracle(ORACLE);

        Stock[12] memory stocks = [
            Stock("AAPL",  "Apple Inc.",              178_72_000_000),
            Stock("TSLA",  "Tesla Inc.",              248_50_000_000),
            Stock("NVDA",  "NVIDIA Corp.",            875_30_000_000),
            Stock("MSFT",  "Microsoft Corp.",         415_60_000_000),
            Stock("AMZN",  "Amazon.com Inc.",         182_15_000_000),
            Stock("GOOGL", "Alphabet Inc.",           155_80_000_000),
            Stock("META",  "Meta Platforms",          503_25_000_000),
            Stock("JPM",   "JPMorgan Chase",          198_40_000_000),
            Stock("V",     "Visa Inc.",               278_90_000_000),
            Stock("DIS",   "Walt Disney Co.",          98_45_000_000),
            Stock("NFLX",  "Netflix Inc.",            625_10_000_000),
            Stock("AMD",   "Advanced Micro Devices",  162_35_000_000)
        ];

        for (uint256 i = 0; i < stocks.length; i++) {
            string memory sName = string.concat("Synthetic ", stocks[i].name);
            address sToken = factory.listAsset(stocks[i].ticker, sName, address(vault));
            vault.registerAsset(stocks[i].ticker, sToken);
            oracle.setManualPrice(stocks[i].ticker, stocks[i].price, true);
            console.log(string.concat("s", stocks[i].ticker, ":"), sToken);
        }

        vm.stopBroadcast();
    }
}
