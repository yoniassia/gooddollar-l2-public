// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/perps/PerpUBIFeeSplitter.sol";

/**
 * @title DeployPerpUBIFeeSplitter
 * @notice Deploy enhanced UBI fee splitter for GoodPerps with comprehensive tracking.
 *
 * Features:
 *   - Enhanced trading fee tracking with user metrics
 *   - Liquidation bonus routing through UBI system
 *   - Funding rate fee tracking by market
 *   - Monthly UBI target tracking ($10K target)
 *   - Social impact analytics for derivatives market
 *   - Backward compatibility with existing IFeeSplitterPerp interface
 *
 * Environment Variables:
 *   PRIVATE_KEY    - Deployer private key
 *   GD_TOKEN       - GoodDollar token address (defaults to devnet)
 *   TREASURY       - Protocol treasury address (defaults to deployer)
 *   ADMIN          - Admin address (defaults to deployer)
 *
 * Usage:
 *   forge script script/DeployPerpUBIFeeSplitter.s.sol --rpc-url <RPC> --broadcast
 */
contract DeployPerpUBIFeeSplitter is Script {

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

        console.log("=== Deploying PerpUBIFeeSplitter ===");
        console.log("Deployer:     ", deployer);
        console.log("GD Token:     ", gdToken);
        console.log("Treasury:     ", treasury);
        console.log("Admin:        ", admin);

        vm.startBroadcast(pk);

        // Deploy enhanced PerpUBIFeeSplitter
        PerpUBIFeeSplitter splitter = new PerpUBIFeeSplitter(
            gdToken,
            treasury,
            admin
        );

        console.log("\n=== Deployment Complete ===");
        console.log("PerpUBIFeeSplitter:", address(splitter));

        // Verify deployment
        console.log("\n=== Verification ===");
        console.log("goodDollar():       ", splitter.goodDollar());
        console.log("protocolTreasury(): ", splitter.protocolTreasury());
        console.log("admin():            ", splitter.admin());
        console.log("ubiBPS():           ", splitter.ubiBPS());
        console.log("protocolBPS():      ", splitter.protocolBPS());
        console.log("monthlyTargetUBI(): ", splitter.monthlyTargetUBI());

        // Log integration instructions
        console.log("\n=== Integration Instructions ===");
        console.log("1. Update PerpEngine feeSplitter address to:", address(splitter));
        console.log("2. Call PerpEngine.transferAdmin() if needed");
        console.log("3. Test trading fees route correctly through enhanced splitter");
        console.log("4. Monitor analytics via getDerivativesUBIStats() and getMonthlyUBIEstimate()");
        console.log("5. Target: $10K+ monthly UBI from derivatives trading");

        vm.stopBroadcast();
    }
}