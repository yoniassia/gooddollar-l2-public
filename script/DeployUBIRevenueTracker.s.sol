// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/UBIRevenueTracker.sol";

/**
 * @notice Deploy UBIRevenueTracker and register all 7 protocols.
 *         Seed initial stats and take first snapshot.
 *
 * Usage:
 *   forge script script/DeployUBIRevenueTracker.s.sol --rpc-url http://localhost:8545 --broadcast
 */
contract DeployUBIRevenueTracker is Script {
    function run() external {
        uint256 key = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(key);

        // UBIFeeSplitter address — from op-stack/addresses.json (post-RedeployUBIAndLiFi)
        // NOTE: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 was the old UBIFeeHook; do NOT use it.
        address feeSplitter = vm.envOr("UBI_FEE_SPLITTER", address(0xC0BF43A4Ca27e0976195E6661b099742f10507e5));

        vm.startBroadcast(key);

        UBIRevenueTracker tracker = new UBIRevenueTracker(deployer, feeSplitter);
        console.log("UBIRevenueTracker deployed:", address(tracker));

        // Register all 7 protocols
        // Using placeholder fee-source addresses (the actual dApp contracts)
        tracker.registerProtocol("GoodSwap", "swap", address(0x1001));
        tracker.registerProtocol("GoodPerps", "perps", address(0x1002));
        tracker.registerProtocol("GoodPredict", "predict", address(0x1003));
        tracker.registerProtocol("GoodLend", "lend", address(0x1004));
        tracker.registerProtocol("GoodStable", "stable", address(0x1005));
        tracker.registerProtocol("GoodStocks", "stocks", address(0x1006));
        tracker.registerProtocol("GoodBridge", "bridge", address(0x1007));

        // Seed initial stats (simulating first week of activity)
        // GoodSwap — most active, 150 swaps
        tracker.reportFees(0, 4500e18, 1500e18, 150);
        // GoodPerps — 80 trades
        tracker.reportFees(1, 3200e18, 1066e18, 80);
        // GoodPredict — 60 market bets
        tracker.reportFees(2, 1800e18, 600e18, 60);
        // GoodLend — 40 supply/borrow ops
        tracker.reportFees(3, 1200e18, 400e18, 40);
        // GoodStable — 25 vault operations
        tracker.reportFees(4, 750e18, 250e18, 25);
        // GoodStocks — 35 synthetic mints/redeems
        tracker.reportFees(5, 1050e18, 350e18, 35);
        // GoodBridge — 20 bridge operations
        tracker.reportFees(6, 600e18, 200e18, 20);

        // Take first daily snapshot
        tracker.takeSnapshot();

        console.log("Registered 7 protocols, seeded stats, took snapshot");
        console.log("Total fees tracked:", tracker.totalFeesTracked() / 1e18, "G$");
        console.log("Total UBI funded:", tracker.totalUBITracked() / 1e18, "G$");
        console.log("Total transactions:", tracker.totalTxTracked());

        vm.stopBroadcast();
    }
}
