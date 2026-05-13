// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/governance/VoteEscrowedGD.sol";
import "../src/governance/GoodDAO.sol";

/**
 * @title DeployGovernance
 * @notice Deploy VoteEscrowedGD + GoodDAO on GoodDollar L2
 *
 * Usage:
 *   forge script script/DeployGovernance.s.sol --rpc-url http://localhost:8545 \
 *     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
 *     --broadcast -vvv
 */
contract DeployGovernance is Script {
    function run() external {
        // Addresses updated after devnet reset (GOO-363 redeploy)
        address gdToken = 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570;
        address ubiFeeSplitter = 0x3abBB0D6ad848d64c8956edC9Bf6f18aC22E1485; // canonical splitter (GOO-402)
        address deployer = msg.sender;

        vm.startBroadcast();

        // 1. Deploy VoteEscrowedGD
        VoteEscrowedGD veGD = new VoteEscrowedGD(
            gdToken,
            ubiFeeSplitter, // UBI treasury = fee splitter
            deployer        // admin
        );
        console.log("VoteEscrowedGD deployed at:", address(veGD));

        // 2. Deploy GoodDAO
        GoodDAO dao = new GoodDAO(
            address(veGD),
            deployer        // guardian (can be renounced later)
        );
        console.log("GoodDAO deployed at:", address(dao));

        vm.stopBroadcast();

        // Log summary
        console.log("\n=== Governance Deployment Summary ===");
        console.log("G$ Token:          ", gdToken);
        console.log("UBI Treasury:      ", ubiFeeSplitter);
        console.log("VoteEscrowedGD:    ", address(veGD));
        console.log("GoodDAO:           ", address(dao));
        console.log("Guardian:          ", deployer);
        console.log("\nConfig:");
        console.log("  Max lock:          4 years");
        console.log("  Min lock:          7 days");
        console.log("  Early unlock fee:  30% (33% to UBI)");
        console.log("  Proposal threshold: 1% of veG$");
        console.log("  Quorum:            10% of veG$");
        console.log("  Voting period:     3 days");
        console.log("  Timelock delay:    1 day");
    }
}
