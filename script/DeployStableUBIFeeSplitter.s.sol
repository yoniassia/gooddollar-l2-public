// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stable/StableUBIFeeSplitter.sol";

/**
 * @title DeployStableUBIFeeSplitter
 * @notice Deploy enhanced UBI fee splitter for GoodStable protocol with comprehensive tracking.
 *
 * Features:
 *   - Enhanced stability fee tracking by collateral type (ilk)
 *   - Enhanced minting fee tracking by user and swap direction
 *   - Liquidation penalty and governance fee routing
 *   - Monthly UBI target tracking ($15K target)
 *   - Daily stablecoin impact measurement
 *   - Social impact analytics for stablecoin market
 *   - Backward compatibility with existing IUBIFeeSplitter interface
 *
 * Environment Variables:
 *   PRIVATE_KEY    - Deployer private key
 *   GD_TOKEN       - GoodDollar token address (defaults to devnet)
 *   TREASURY       - Protocol treasury address (defaults to deployer)
 *   ADMIN          - Admin address (defaults to deployer)
 *   UBI_RECIPIENT  - UBI recipient for non-G$ tokens (defaults to treasury)
 *
 * Usage:
 *   forge script script/DeployStableUBIFeeSplitter.s.sol --rpc-url <RPC> --broadcast
 */
contract DeployStableUBIFeeSplitter is Script {

    // Current devnet addresses (chain 42069)
    address constant GD_TOKEN_DEFAULT = 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570;

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(pk);

        address gdToken = vm.envOr("GD_TOKEN", GD_TOKEN_DEFAULT);
        address treasury = vm.envOr("TREASURY", deployer);
        address admin = vm.envOr("ADMIN", deployer);
        address ubiRecipient = vm.envOr("UBI_RECIPIENT", treasury);

        console.log("=== Deploying StableUBIFeeSplitter ===");
        console.log("Deployer:       ", deployer);
        console.log("GD Token:       ", gdToken);
        console.log("Treasury:       ", treasury);
        console.log("Admin:          ", admin);
        console.log("UBI Recipient:  ", ubiRecipient);

        vm.startBroadcast(pk);

        // Deploy enhanced StableUBIFeeSplitter
        StableUBIFeeSplitter splitter = new StableUBIFeeSplitter(
            gdToken,
            treasury,
            admin
        );

        // Set UBI recipient for non-G$ tokens if different from treasury
        if (ubiRecipient != treasury) {
            splitter.setUBIRecipient(ubiRecipient);
        }

        console.log("\n=== Deployment Complete ===");
        console.log("StableUBIFeeSplitter:", address(splitter));

        // Verify deployment
        console.log("\n=== Verification ===");
        console.log("goodDollar():        ", address(splitter.goodDollar()));
        console.log("protocolTreasury():  ", splitter.protocolTreasury());
        console.log("admin():             ", splitter.admin());
        console.log("ubiRecipient():      ", splitter.ubiRecipient());
        console.log("ubiBPS():            ", splitter.ubiBPS());
        console.log("protocolBPS():       ", splitter.protocolBPS());
        console.log("monthlyTargetUBI():  ", splitter.monthlyTargetUBI());

        // Log integration instructions
        console.log("\n=== Integration Instructions ===");
        console.log("1. Update VaultManager feeSplitter address to:", address(splitter));
        console.log("2. Update PegStabilityModule feeSplitter address to:", address(splitter));
        console.log("3. Call VaultManager.transferAdmin() if needed");
        console.log("4. Call PegStabilityModule.transferAdmin() if needed");
        console.log("5. Test stability fees route correctly through enhanced splitter");
        console.log("6. Test minting fees route correctly through enhanced splitter");
        console.log("7. Monitor analytics via getStablecoinUBIStats() and getMonthlyUBIEstimate()");
        console.log("8. Track collateral breakdown via getIlkBreakdown()");
        console.log("9. Target: $15K+ monthly UBI from stablecoin operations");

        // Log usage examples
        console.log("\n=== Analytics Usage Examples ===");
        console.log("// Get comprehensive UBI statistics:");
        console.log("splitter.getStablecoinUBIStats()");
        console.log("");
        console.log("// Get monthly UBI estimate vs target:");
        console.log("splitter.getMonthlyUBIEstimate()");
        console.log("");
        console.log("// Get collateral type breakdown:");
        console.log("splitter.getIlkBreakdown()");
        console.log("");
        console.log("// Get social impact rate:");
        console.log("splitter.getStablecoinSocialImpactRate()");
        console.log("");
        console.log("// Get today's UBI impact:");
        console.log("splitter.getTodayStablecoinImpact()");

        vm.stopBroadcast();
    }
}