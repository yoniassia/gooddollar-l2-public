// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/bridge/MultiChainBridge.sol";

/**
 * @title DeployMultiChainBridge
 * @notice Deploys the MultiChainBridge router with Li.Fi + native bridge + fast withdrawal integration.
 *
 * Usage:
 *   forge script script/DeployMultiChainBridge.s.sol --rpc-url http://localhost:8545 --broadcast
 */
contract DeployMultiChainBridge is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        // Known deployed addresses (from previous deployments on devnet)
        address ubiPool = vm.envOr("UBI_POOL", address(0));
        address lifiAggregator = vm.envOr("LIFI_AGGREGATOR", address(0));
        address nativeBridgeL2 = vm.envOr("NATIVE_BRIDGE_L2", address(0));
        address fastWithdrawalLP = vm.envOr("FAST_WITHDRAWAL_LP", address(0));

        vm.startBroadcast(deployerKey);

        MultiChainBridge bridge = new MultiChainBridge(
            deployer,
            ubiPool,
            lifiAggregator,
            nativeBridgeL2,
            fastWithdrawalLP
        );

        console.log("MultiChainBridge deployed at:", address(bridge));
        console.log("  admin:", deployer);
        console.log("  ubiPool:", ubiPool);
        console.log("  lifiAggregator:", lifiAggregator);
        console.log("  nativeBridge:", nativeBridgeL2);
        console.log("  fastWithdrawalLP:", fastWithdrawalLP);

        vm.stopBroadcast();
    }
}
