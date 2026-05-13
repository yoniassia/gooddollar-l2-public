// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/UBIFeeSplitter.sol";
import "../src/perps/FundingRate.sol";
import "../src/perps/MarginVault.sol";
import "../src/perps/PerpEngine.sol";
import "../src/perps/PerpPriceOracle.sol";

/**
 * @notice Fix GOO-450: PerpEngine references a stale UBIFeeSplitter (0x976fcd02…)
 *         that was deployed before setGoodDollar() was added (GOO-402). Because
 *         PerpEngine.feeSplitter is immutable, both the splitter AND the engine
 *         must be redeployed.
 *
 *  Root-cause chain (Chief Architect RCA, 2026-04-05):
 *   1. RedeployUBIAndLiFi run #2 deployed UBIFeeSplitter (old bytecode, no setGoodDollar)
 *   2. DeployPerps used FEE_SPLITTER_DEFAULT = 0x976fcd02 → PerpEngine.feeSplitter is immutable
 *   3. splitFee() on the stale splitter calls transferFrom on genesis GDT (0x5fbdb231)
 *      which PerpEngine never holds → "Insufficient allowance" on every openPosition()
 *
 *  Fix:
 *   1. Deploy new UBIFeeSplitter (PERP variant) initialized with current GDT
 *   2. Deploy new PerpEngine wired to new splitter (existing vault/funding/oracle reused)
 *   3. Rewire FundingRate and MarginVault to new engine
 *   4. Re-register markets on new engine (oracle prices survive — already registered)
 *
 *  Usage (devnet):
 *    forge script script/FixUBIFeeSplitterGDT.s.sol \
 *      --rpc-url http://localhost:8545 --broadcast --legacy
 */
contract FixUBIFeeSplitterGDT is Script {
    // Current GDT — correct, redeployed address (GOO-402)
    address constant CURRENT_GDT     = 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570;
    // Protocol treasury (Anvil deployer for devnet)
    address constant TREASURY        = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    // Existing perps infra — reused as-is
    address constant MARGIN_VAULT    = 0xB22C255250d74B0ADD1bfB936676D2a299BF48Bd;
    address constant FUNDING_RATE    = 0xFD2Cf3b56a73c75A7535fFe44EBABe7723c64719;
    address constant PERP_ORACLE     = 0xf5c4a909455C00B99A90d93b48736F3196DB5621;

    struct Market {
        string  ticker;
        uint256 maxLeverage;
    }

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // 1. Deploy new UBIFeeSplitter for perps, initialized with correct GDT
        UBIFeeSplitter newSplitter = new UBIFeeSplitter(CURRENT_GDT, TREASURY, deployer);
        console.log("New UBIFeeSplitter (PERP):", address(newSplitter));
        require(address(newSplitter.goodDollar()) == CURRENT_GDT, "splitter GDT wrong");

        // 2. Deploy new PerpEngine pointing to new splitter
        PerpEngine newEngine = new PerpEngine(
            MARGIN_VAULT,
            FUNDING_RATE,
            PERP_ORACLE,
            address(newSplitter),
            deployer
        );
        console.log("New PerpEngine:           ", address(newEngine));
        require(newEngine.feeSplitter() == address(newSplitter), "engine splitter wrong");

        // 3. Rewire FundingRate and MarginVault to new engine
        FundingRate(FUNDING_RATE).setPerpEngine(address(newEngine));
        MarginVault(MARGIN_VAULT).setPerpEngine(address(newEngine));
        console.log("FundingRate wired to new engine");
        console.log("MarginVault  wired to new engine");

        // 4. Re-register markets on new engine
        //    Oracle already has prices (PerpPriceOracle is reused) — only createMarket needed.
        Market[6] memory markets = [
            Market("BTC",  50),
            Market("ETH",  50),
            Market("SOL",  25),
            Market("BNB",  25),
            Market("MATIC", 20),
            Market("ARB",  20)
        ];

        for (uint256 i = 0; i < markets.length; i++) {
            bytes32 key = keccak256(abi.encodePacked(markets[i].ticker));
            uint256 marketId = newEngine.createMarket(key, key, markets[i].maxLeverage);
            console.log(
                string.concat(markets[i].ticker, " -> marketId=", vm.toString(marketId))
            );
        }

        vm.stopBroadcast();

        console.log("\n=== GOO-450 fix complete ===");
        console.log("New UBIFeeSplitter:", address(newSplitter));
        console.log("New PerpEngine:    ", address(newEngine));
        console.log("Update FEE_SPLITTER_DEFAULT and DeployPerps.s.sol with these addresses.");
    }
}
