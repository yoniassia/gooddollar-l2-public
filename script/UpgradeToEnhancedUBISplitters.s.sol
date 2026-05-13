// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/perps/PerpUBIFeeSplitter.sol";
import "../src/stable/StableUBIFeeSplitter.sol";

/**
 * @title UpgradeToEnhancedUBISplitters
 * @notice Upgrade existing GoodPerps and GoodStable deployments to use enhanced UBI fee splitters.
 *
 * This script:
 *   1. Deploys PerpUBIFeeSplitter with enhanced derivatives tracking
 *   2. Deploys StableUBIFeeSplitter with enhanced stablecoin tracking
 *   3. Provides instructions for updating contract references
 *
 * Features Added:
 *   - Comprehensive fee tracking by type, user, market, and time
 *   - Monthly UBI targets ($10K derivatives + $15K stablecoin)
 *   - Social impact analytics and progress measurement
 *   - Daily UBI impact tracking
 *   - Gas optimization (<2% overhead)
 *   - Backward compatibility with existing interfaces
 *
 * Environment Variables:
 *   PRIVATE_KEY      - Deployer private key
 *   GD_TOKEN         - GoodDollar token address
 *   TREASURY         - Protocol treasury address
 *   ADMIN            - Admin address for both splitters
 *   UBI_RECIPIENT    - UBI recipient for non-G$ tokens
 *   PERP_ENGINE      - Existing PerpEngine address (for reference)
 *   VAULT_MANAGER    - Existing VaultManager address (for reference)
 *   PSM              - Existing PegStabilityModule address (for reference)
 *
 * Usage:
 *   forge script script/UpgradeToEnhancedUBISplitters.s.sol --rpc-url <RPC> --broadcast
 */
contract UpgradeToEnhancedUBISplitters is Script {

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

        // Optional: existing contract addresses for reference
        address perpEngine = vm.envOr("PERP_ENGINE", address(0));
        address vaultManager = vm.envOr("VAULT_MANAGER", address(0));
        address psm = vm.envOr("PSM", address(0));

        console.log("=== Upgrading to Enhanced UBI Fee Splitters ===");
        console.log("Deployer:           ", deployer);
        console.log("GD Token:           ", gdToken);
        console.log("Treasury:           ", treasury);
        console.log("Admin:              ", admin);
        console.log("UBI Recipient:      ", ubiRecipient);

        if (perpEngine != address(0)) {
            console.log("PerpEngine:         ", perpEngine);
        }
        if (vaultManager != address(0)) {
            console.log("VaultManager:       ", vaultManager);
        }
        if (psm != address(0)) {
            console.log("PSM:                ", psm);
        }

        vm.startBroadcast(pk);

        // 1. Deploy enhanced PerpUBIFeeSplitter
        PerpUBIFeeSplitter perpSplitter = new PerpUBIFeeSplitter(
            gdToken,
            treasury,
            admin
        );
        console.log("\nPerpUBIFeeSplitter deployed:   ", address(perpSplitter));

        // 2. Deploy enhanced StableUBIFeeSplitter
        StableUBIFeeSplitter stableSplitter = new StableUBIFeeSplitter(
            gdToken,
            treasury,
            admin
        );
        console.log("StableUBIFeeSplitter deployed: ", address(stableSplitter));

        // 3. Configure StableUBIFeeSplitter for non-G$ tokens
        if (ubiRecipient != treasury) {
            stableSplitter.setUBIRecipient(ubiRecipient);
        }

        console.log("\n=== Enhanced Features Summary ===");

        // PerpUBIFeeSplitter features
        console.log("\nPerpUBIFeeSplitter Features:");
        console.log("- Enhanced trading fee tracking by user and market");
        console.log("- Liquidation bonus routing through UBI system");
        console.log("- Funding rate fee tracking by market");
        console.log("- Monthly target: $10K UBI from derivatives");
        console.log("- Daily derivatives impact measurement");
        console.log("- Social impact analytics");
        console.log("- Backward compatible with IFeeSplitterPerp");

        // StableUBIFeeSplitter features
        console.log("\nStableUBIFeeSplitter Features:");
        console.log("- Enhanced stability fee tracking by collateral type");
        console.log("- Enhanced minting fee tracking by user/direction");
        console.log("- Liquidation penalty routing");
        console.log("- Governance fee routing");
        console.log("- Monthly target: $15K UBI from stablecoin ops");
        console.log("- Daily stablecoin impact measurement");
        console.log("- Collateral breakdown analytics");
        console.log("- Backward compatible with IUBIFeeSplitter");

        console.log("\n=== Manual Integration Steps ===");
        console.log("After deployment, manually update these contracts:");

        if (perpEngine != address(0)) {
            console.log("\n1. Update PerpEngine feeSplitter:");
            console.log("   // This requires admin access");
            console.log("   // PerpEngine does not have setFeeSplitter() - deploy new PerpEngine");
            console.log("   // OR use proxy pattern if available");
        } else {
            console.log("\n1. Deploy new PerpEngine with enhanced splitter:");
            console.log("   new PerpEngine(vault, funding, oracle, ", address(perpSplitter), ", admin)");
        }

        if (vaultManager != address(0)) {
            console.log("\n2. Update VaultManager feeSplitter:");
            console.log("   // VaultManager may not have setFeeSplitter() - check interface");
            console.log("   // May require redeployment with new splitter address");
        } else {
            console.log("\n2. Deploy new VaultManager with enhanced splitter:");
            console.log("   new VaultManager(gUSD, registry, oracle, ", address(stableSplitter), ", dAppRecipient, admin)");
        }

        if (psm != address(0)) {
            console.log("\n3. Update PegStabilityModule feeSplitter:");
            console.log("   // PSM may not have setFeeSplitter() - check interface");
            console.log("   // May require redeployment with new splitter address");
        } else {
            console.log("\n3. Deploy new PegStabilityModule with enhanced splitter:");
            console.log("   new PegStabilityModule(gUSD, USDC, ", address(stableSplitter), ", admin)");
        }

        console.log("\n=== Verification Steps ===");
        console.log("After integration, verify:");
        console.log("1. Trading fees route correctly: perpSplitter.getDerivativesUBIStats()");
        console.log("2. Stability fees route correctly: stableSplitter.getStablecoinUBIStats()");
        console.log("3. Minting fees route correctly: check PSM fee events");
        console.log("4. Gas overhead <2%: run test suites");
        console.log("5. Monthly targets progress: getMonthlyUBIEstimate() on both");

        console.log("\n=== Analytics Dashboard ===");
        console.log("Track UBI impact with these view functions:");
        console.log("// Derivatives UBI stats");
        console.log("perpSplitter.getDerivativesUBIStats()");
        console.log("perpSplitter.getMonthlyUBIEstimate()");
        console.log("perpSplitter.getTodayDerivativesImpact()");
        console.log("");
        console.log("// Stablecoin UBI stats");
        console.log("stableSplitter.getStablecoinUBIStats()");
        console.log("stableSplitter.getMonthlyUBIEstimate()");
        console.log("stableSplitter.getTodayStablecoinImpact()");
        console.log("stableSplitter.getIlkBreakdown()");
        console.log("");
        console.log("// Combined social impact");
        console.log("// Sum both monthly estimates to track $25K+ total UBI target");

        vm.stopBroadcast();
    }
}