// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/predict/OptimisticResolver.sol";

/**
 * @title DeployOptimisticResolver
 * @notice Deploys OptimisticResolver and wires it to the current MarketFactory.
 *
 * Fixes GOO-239: prediction market resolution was admin-EOA only because
 * OptimisticResolver was never deployed on devnet.
 *
 * After deployment, create new markets with `resolver = address(OptimisticResolver)`
 * to enable trustless UMA-style dispute windows.
 *
 * Usage:
 *   forge script script/DeployOptimisticResolver.s.sol \
 *     --rpc-url https://rpc.goodclaw.org --broadcast --legacy
 */
contract DeployOptimisticResolver is Script {

    address constant GOOD_DOLLAR    = 0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1;
    address constant MARKET_FACTORY = 0xc7cDb7A2E5dDa1B7A0E792Fe1ef08ED20A6F56D4;
    address constant FEE_SPLITTER   = 0xC0BF43A4Ca27e0976195E6661b099742f10507e5;
    address constant ADMIN          = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(pk);

        OptimisticResolver resolver = new OptimisticResolver(
            GOOD_DOLLAR,
            MARKET_FACTORY,
            FEE_SPLITTER,
            ADMIN
        );

        vm.stopBroadcast();

        console.log("=== OptimisticResolver Deployed ===");
        console.log("OptimisticResolver:", address(resolver));
        console.log("bondToken:         ", GOOD_DOLLAR);
        console.log("marketFactory:     ", MARKET_FACTORY);
        console.log("feeSplitter:       ", FEE_SPLITTER);
        console.log("admin:             ", ADMIN);
        console.log("bondAmount:        ", resolver.bondAmount());
        console.log("disputeWindow:     ", resolver.disputeWindow());
        console.log("");
        console.log("Update devnet.ts and addresses.json with:");
        console.log("  OptimisticResolver:", address(resolver));
        console.log("");
        console.log("Create future markets with resolver = address(OptimisticResolver)");
        console.log("to enable permissionless dispute-window resolution.");
    }
}
