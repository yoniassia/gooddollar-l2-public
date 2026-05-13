// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stocks/CollateralVault.sol";
import "../src/stocks/SyntheticAssetFactory.sol";
import "../src/stocks/PriceOracle.sol";

/**
 * @notice Fix GOO-473: CollateralVault.goodDollar wired to dead address 0x6533158b.
 *         Because goodDollar is immutable, the vault must be redeployed.
 *
 *  Root-cause: DeployGoodStocks was run with GOOD_DOLLAR_TOKEN=0x6533158b (stale/stub
 *  address, 2 bytes bytecode). depositCollateral() calls goodDollar.transferFrom()
 *  which reverts because 0x6533158b is not a valid ERC20. Same pattern as GOO-402.
 *
 *  Fix:
 *   1. Deploy new CollateralVault with correct GDT (0x36C02dA8…) and current
 *      UBIFeeSplitter (0x3abBB0D6…)
 *   2. Re-list all 12 sTokens via existing SyntheticAssetFactory (new clones,
 *      new vault as minter — old clones are orphaned, no positions existed)
 *   3. Register each sToken on the new vault
 *   4. Existing PriceOracle (0x20d7B364…) is reused — manual prices already set
 *
 *  Usage (devnet):
 *    forge script script/FixGoodStocksVault.s.sol \
 *      --rpc-url http://localhost:8545 --broadcast --legacy
 *
 *  After broadcast:
 *    Update frontend/src/lib/devnet.ts with new CollateralVault + all sToken addresses.
 */
contract FixGoodStocksVault is Script {
    // Correct GDT — current redeployed address (GOO-402)
    address constant CURRENT_GDT      = 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570;
    // Current UBIFeeSplitter (op-stack/addresses.json)
    address constant UBI_FEE_SPLITTER = 0x3abBB0D6ad848d64c8956edC9Bf6f18aC22E1485;
    // Existing PriceOracle — manual prices for all 12 stocks already set
    address constant PRICE_ORACLE     = 0x20d7B364E8Ed1F4260b5B90C41c2deC3C1F6D367;
    // Existing SyntheticAssetFactory — reused to mint new clone sTokens
    address constant FACTORY          = 0x2d13826359803522cCe7a4Cfa2c1b582303DD0B4;
    // Devnet deployer (Anvil default)
    address constant TREASURY         = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    struct Stock {
        string ticker;
        string name;
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // 1. Deploy new CollateralVault with correct GDT
        CollateralVault newVault = new CollateralVault(
            CURRENT_GDT,
            PRICE_ORACLE,
            UBI_FEE_SPLITTER,
            deployer
        );
        console.log("New CollateralVault:", address(newVault));
        require(address(newVault.goodDollar()) == CURRENT_GDT, "vault GDT wrong");

        // 2 + 3. Re-list all 12 synthetic stocks and register on new vault
        SyntheticAssetFactory factory = SyntheticAssetFactory(FACTORY);

        Stock[12] memory stocks = [
            Stock("AAPL",  "Apple Inc."),
            Stock("TSLA",  "Tesla Inc."),
            Stock("NVDA",  "NVIDIA Corp."),
            Stock("MSFT",  "Microsoft Corp."),
            Stock("AMZN",  "Amazon.com Inc."),
            Stock("GOOGL", "Alphabet Inc."),
            Stock("META",  "Meta Platforms"),
            Stock("JPM",   "JPMorgan Chase"),
            Stock("V",     "Visa Inc."),
            Stock("DIS",   "Walt Disney Co."),
            Stock("NFLX",  "Netflix Inc."),
            Stock("AMD",   "Advanced Micro Devices")
        ];

        // 2a. Delist old sTokens (factory still points to old vault-as-minter clones)
        for (uint256 i = 0; i < stocks.length; i++) {
            factory.delistAsset(stocks[i].ticker);
        }

        // 2b. Re-list with new vault as minter (creates fresh clones)
        for (uint256 i = 0; i < stocks.length; i++) {
            string memory sName = string.concat("Synthetic ", stocks[i].name);
            address sToken = factory.listAsset(stocks[i].ticker, sName, address(newVault));
            newVault.registerAsset(stocks[i].ticker, sToken);
            console.log(string.concat("s", stocks[i].ticker, ":"), sToken);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== GOO-473 fix complete ===");
        console.log("New CollateralVault:", address(newVault));
        console.log("Update frontend/src/lib/devnet.ts with CollateralVault + sToken addresses above.");
    }
}
