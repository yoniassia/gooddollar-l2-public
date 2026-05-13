// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {TestRegistry} from "../src/TestRegistry.sol";

/// @notice Deploy TestRegistry to devnet.
///
/// Usage:
///   forge script script/TestRegistry.s.sol \
///     --rpc-url $DEVNET_RPC_URL \
///     --broadcast \
///     --private-key $DEPLOYER_PRIVATE_KEY
///
/// After deployment the contract address is printed and saved in the
/// broadcast artefacts under broadcast/TestRegistry.s.sol/.
contract TestRegistryScript is Script {
    function run() external returns (TestRegistry registry) {
        vm.startBroadcast();
        registry = new TestRegistry();
        vm.stopBroadcast();
    }
}
