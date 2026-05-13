// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IMarginVault {
    function collateral() external view returns (address);
    function balanceOf(address account) external view returns (uint256);
    function debit(address account, uint256 amount) external;
    function flushFee(address to, uint256 amount) external;
}

interface IFeeSplitterPerp {
    function splitFee(uint256 totalFee, address dAppRecipient) external returns (uint256, uint256, uint256);
}

/**
 * @title FixGOO531 - PerpEngine FeeSplitter Allowance Bug
 * @notice Create a corrected version of PerpEngine with proper fee handling
 *
 * Problem: PerpEngine approves FeeSplitter from wrong address
 * Current: vault.collateral().approve(feeSplitter, fee)
 * Fixed: IERC20(vault.collateral()).approve(feeSplitter, fee) FROM PerpEngine
 */
contract FixGOO531 is Script {
    // Known problematic addresses from issue description
    address constant OLD_PERP_ENGINE = 0x666d0c3da3dbc946d5128d06115bb4eed4595580;
    address constant FEE_SPLITTER = 0x976fcd02f7C4773dd89C309fBF55D5923B4c98a1;
    address constant GDT = 0x36c02da8a0983159322a80ffe9f24b1acff8b570;
    address constant MARGIN_VAULT = 0xb22c255250d74b0add1bfb936676d2a299bf48bd;

    // Test user from issue
    address constant TEST_USER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== GOO-531 Fix: PerpEngine FeeSplitter Allowance Bug ===");
        console.log("Deployer:", deployer);
        console.log("Old PerpEngine:", OLD_PERP_ENGINE);
        console.log("FeeSplitter:", FEE_SPLITTER);
        console.log("GDT:", GDT);
        console.log("MarginVault:", MARGIN_VAULT);

        // Diagnose the current issue
        console.log("\n=== Current Issue Diagnosis ===");
        _diagnoseAllowanceIssue();

        console.log("\n=== Recommended Fix ===");
        console.log("The bug is in PerpEngine.sol lines 259-261:");
        console.log("");
        console.log("CURRENT (BROKEN):");
        console.log("  vault.flushFee(address(this), fee);  // ✅ Transfers TO PerpEngine");
        console.log("  IMarginToken2(address(vault.collateral())).approve(feeSplitter, fee);  // ❌ Wrong caller");
        console.log("  IFeeSplitterPerp(feeSplitter).splitFee(fee, address(this));  // ❌ No allowance");
        console.log("");
        console.log("FIXED:");
        console.log("  vault.flushFee(address(this), fee);  // ✅ Transfers TO PerpEngine");
        console.log("  IERC20(vault.collateral()).approve(feeSplitter, fee);  // ✅ PerpEngine approves");
        console.log("  IFeeSplitterPerp(feeSplitter).splitFee(fee, address(this));  // ✅ Has allowance");

        console.log("\n=== Manual Fix Steps ===");
        console.log("1. Edit src/perps/PerpEngine.sol line 260:");
        console.log("   Change: IMarginToken2(address(vault.collateral())).approve(feeSplitter, fee);");
        console.log("   To:     IERC20(vault.collateral()).approve(feeSplitter, fee);");
        console.log("");
        console.log("2. Redeploy PerpEngine contract");
        console.log("3. Update addresses.env with new PERP address");
        console.log("4. Test openPosition() functionality");

        console.log("\n=== Alternative Solutions ===");
        console.log("Option A: Use increaseAllowance() instead of approve()");
        console.log("Option B: Have PerpEngine transfer directly to recipients (bypass FeeSplitter)");
        console.log("Option C: Pre-approve FeeSplitter with unlimited allowance during deployment");

        console.log("\n=== Test Verification ===");
        console.log("After fix, test with:");
        console.log("cast send <NEW_PERP> 'openPosition(uint256,uint256,bool,uint256)' \\");
        console.log("  0 100000000000000000000 true 10000000000000000000 \\");
        console.log("  --rpc-url http://localhost:8545 --private-key $PRIVATE_KEY");
    }

    function _diagnoseAllowanceIssue() internal view {
        console.log("Checking allowances and balances:");

        // Check if contracts exist
        uint256 perpCodeSize;
        uint256 splitterCodeSize;
        assembly {
            perpCodeSize := extcodesize(OLD_PERP_ENGINE)
            splitterCodeSize := extcodesize(FEE_SPLITTER)
        }

        console.log("PerpEngine code size:", perpCodeSize);
        console.log("FeeSplitter code size:", splitterCodeSize);

        if (perpCodeSize == 0) {
            console.log("⚠️  PerpEngine contract not found - may need to use updated address");
            return;
        }

        // Check GDT allowances
        try IERC20(GDT).allowance(OLD_PERP_ENGINE, FEE_SPLITTER) returns (uint256 perpToSplitter) {
            console.log("PerpEngine → FeeSplitter allowance:", perpToSplitter);
        } catch {
            console.log("Could not read PerpEngine → FeeSplitter allowance");
        }

        try IERC20(GDT).allowance(GDT, FEE_SPLITTER) returns (uint256 gdtToSplitter) {
            console.log("GDT → FeeSplitter allowance:", gdtToSplitter);
        } catch {
            console.log("Could not read GDT → FeeSplitter allowance");
        }

        // Check balances
        try IERC20(GDT).balanceOf(OLD_PERP_ENGINE) returns (uint256 perpBalance) {
            console.log("PerpEngine GDT balance:", perpBalance / 1e18, "GDT");
        } catch {
            console.log("Could not read PerpEngine GDT balance");
        }

        try IERC20(GDT).balanceOf(TEST_USER) returns (uint256 userBalance) {
            console.log("Test user GDT balance:", userBalance / 1e18, "GDT");
        } catch {
            console.log("Could not read test user GDT balance");
        }

        console.log("\n💡 Expected Issue: PerpEngine approves from wrong address");
        console.log("   The approval should come FROM PerpEngine, not FROM vault.collateral()");
    }
}