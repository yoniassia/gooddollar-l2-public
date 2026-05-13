// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/governance/GoodTimelock.sol";

/**
 * @title DeployTimelock
 * @notice Deploy GoodTimelock on GoodDollar L2 devnet
 *
 * Usage:
 *   forge script script/DeployTimelock.s.sol --rpc-url http://localhost:8545 \
 *     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
 *     --broadcast -vvv
 */
contract DeployTimelock is Script {
    function run() external {
        // Existing governance addresses from op-stack/addresses.json
        address goodDAO     = 0x5Ffe31E4676D3466268e28a75E51d1eFa4298620;
        address ubiSplitter = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
        address deployer    = msg.sender;

        uint256 timelockDelay = 1 days;

        // GoodDAO and deployer are proposers; anyone can execute
        address[] memory proposers = new address[](2);
        proposers[0] = goodDAO;
        proposers[1] = deployer;

        address[] memory executors = new address[](1);
        executors[0] = address(0); // open executor — anyone can trigger after delay

        vm.startBroadcast();

        GoodTimelock timelock = new GoodTimelock(
            timelockDelay,
            proposers,
            executors,
            deployer,      // admin (can be transferred to timelock itself later)
            ubiSplitter    // UBI treasury
        );

        console.log("GoodTimelock deployed at:", address(timelock));

        vm.stopBroadcast();

        console.log("\n=== Timelock Deployment Summary ===");
        console.log("GoodTimelock:      ", address(timelock));
        console.log("Delay:             1 day");
        console.log("Grace period:      14 days");
        console.log("Proposers:         GoodDAO + deployer");
        console.log("Executors:         open (anyone)");
        console.log("Admin:             ", deployer);
        console.log("UBI Treasury:      ", ubiSplitter);
        console.log("\nTo fully decentralize:");
        console.log("  1. Transfer admin to timelock itself");
        console.log("  2. Set GoodDAO as the sole proposer");
        console.log("  3. Point protocol admin keys to timelock");
    }
}
