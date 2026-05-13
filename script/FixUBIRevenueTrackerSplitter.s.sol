// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/UBIRevenueTracker.sol";

/**
 * @notice One-shot fix for GOO-245: UBIRevenueTracker.feeSplitter was pointing to
 *         the old UBIFeeHook (0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9) instead
 *         of the current UBIFeeSplitter (0xC0BF43A4Ca27e0976195E6661b099742f10507e5).
 *
 * NOTE: The tracker was redeployed after this fix was applied. Current address is
 *       0x021DBfF4A864Aa25c51F0ad2Cd73266Fde66199d (GOO-281). The old address
 *       0x1D3EDBa... is superseded but kept here for historical reference.
 *
 * Usage (devnet):
 *   forge script script/FixUBIRevenueTrackerSplitter.s.sol \
 *     --rpc-url $DEVNET_RPC --broadcast --legacy
 */
contract FixUBIRevenueTrackerSplitter is Script {
    address constant TRACKER      = 0x021DBfF4A864Aa25c51F0ad2Cd73266Fde66199d;
    address constant FEE_SPLITTER = 0xC0BF43A4Ca27e0976195E6661b099742f10507e5;

    function run() external {
        uint256 key = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(key);

        UBIRevenueTracker tracker = UBIRevenueTracker(TRACKER);

        address before = address(tracker.feeSplitter());
        console.log("feeSplitter before:", before);
        require(before != FEE_SPLITTER, "already correct - nothing to do");

        tracker.setFeeSplitter(FEE_SPLITTER);

        address after_ = address(tracker.feeSplitter());
        console.log("feeSplitter after: ", after_);
        require(after_ == FEE_SPLITTER, "update failed");

        console.log("GOO-245 fixed: UBIRevenueTracker.feeSplitter now points to UBIFeeSplitter");

        vm.stopBroadcast();
    }
}
