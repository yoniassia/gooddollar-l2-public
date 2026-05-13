// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/perps/PerpPriceOracle.sol";
import "../src/perps/PerpEngine.sol";

/**
 * @title RedeployOracle
 * @notice Redeploys PerpPriceOracle, registers 6 markets with prices,
 *         and updates PerpEngine's oracle reference.
 */
contract RedeployOracle is Script {
    address constant PERP_ENGINE = 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853;

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // Deploy fresh oracle
        PerpPriceOracle newOracle = new PerpPriceOracle(deployer);
        console.log("New PerpPriceOracle:", address(newOracle));

        // Register and price all 6 markets
        _seed(newOracle, "BTC",   6_500_000_000_000,  6_498_000_000_000);
        _seed(newOracle, "ETH",     250_000_000_000,    249_800_000_000);
        _seed(newOracle, "SOL",      18_000_000_000,     17_990_000_000);
        _seed(newOracle, "BNB",      60_000_000_000,     59_980_000_000);
        _seed(newOracle, "MATIC",        90_000_000,         89_500_000);
        _seed(newOracle, "ARB",         120_000_000,        119_800_000);

        // Add 4 more markets to PerpEngine (currently has 2: ETH + BTC)
        PerpEngine engine = PerpEngine(PERP_ENGINE);
        uint256 existingCount = engine.marketCount();
        console.log("Existing PerpEngine markets:", existingCount);

        if (existingCount < 3) {
            engine.createMarket(keccak256(abi.encodePacked("SOL")), keccak256(abi.encodePacked("SOL")), 25);
            console.log("Added SOL market to engine");
        }
        if (existingCount < 4) {
            engine.createMarket(keccak256(abi.encodePacked("BNB")), keccak256(abi.encodePacked("BNB")), 25);
            console.log("Added BNB market to engine");
        }
        if (existingCount < 5) {
            engine.createMarket(keccak256(abi.encodePacked("MATIC")), keccak256(abi.encodePacked("MATIC")), 20);
            console.log("Added MATIC market to engine");
        }
        if (existingCount < 6) {
            engine.createMarket(keccak256(abi.encodePacked("ARB")), keccak256(abi.encodePacked("ARB")), 20);
            console.log("Added ARB market to engine");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Oracle Redeployment Complete ===");
        console.log("PerpPriceOracle:", address(newOracle));
        console.log("PerpEngine:     ", PERP_ENGINE);
        console.log("Total markets:   6 (ETH, BTC, SOL, BNB, MATIC, ARB)");
        console.log("");
        console.log("IMPORTANT: Update addresses.json and frontend/src/lib/devnet.ts");
        console.log("with the new PerpPriceOracle address!");
    }

    function _seed(PerpPriceOracle oracle, string memory ticker, uint256 mark, uint256 index) internal {
        bytes32 key = keccak256(abi.encodePacked(ticker));
        oracle.registerMarket(key);
        oracle.setManualPrice(key, mark, index);
        console.log(string.concat("  ", ticker, " registered + priced"));
    }
}
