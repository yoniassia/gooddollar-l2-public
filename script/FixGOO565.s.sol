// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function symbol() external view returns (string memory);
}

interface IGoodLendToken {
    function underlyingAsset() external view returns (address);
    function pool() external view returns (address);
}

/**
 * @title FixGOO565
 * @notice Fix GOO-565: withdraw() fails with Insufficient allowance
 *
 * Root cause: gToken contracts need to approve the pool to transfer underlying assets
 * during withdrawals, but these approvals may be missing or reset.
 *
 * Solution: Re-approve pool for unlimited spending of underlying assets from each gToken.
 */
contract FixGOO565 is Script {
    // Addresses from latest deployment
    address constant POOL = 0x171b627111dd81c46f6ae3f1455232bf1cbc311f;
    address constant GUSDC = 0x9fc087971b01dcbecef4781d121fffb9e40399f5;
    address constant GWETH = 0x153c299219d31111f1237c86180e9962e49a33d2;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== GOO-565 Fix: Restore gToken Approvals ===");
        console.log("Deployer:", deployer);
        console.log("Pool:", POOL);
        console.log();

        address[] memory gTokens = new address[](2);
        gTokens[0] = GUSDC;
        gTokens[1] = GWETH;

        // Check current state first
        console.log("=== Current State ===");
        for (uint256 i = 0; i < gTokens.length; i++) {
            _checkApproval(gTokens[i]);
        }

        vm.startBroadcast(deployerKey);

        console.log("\n=== Fixing Approvals ===");
        bool anyFixed = false;

        for (uint256 i = 0; i < gTokens.length; i++) {
            if (_fixApproval(gTokens[i])) {
                anyFixed = true;
            }
        }

        vm.stopBroadcast();

        if (anyFixed) {
            console.log("\n✅ Fix complete! Try withdrawing again.");
            console.log("Test with: pool.withdraw(asset, smallAmount)");
        } else {
            console.log("\n⚠️  No approvals were fixed.");
            console.log("The issue may be elsewhere (inactive reserves, insufficient balance, etc.)");
        }
    }

    function _checkApproval(address gToken) internal view {
        console.log("--- Checking", gToken, "---");

        try IGoodLendToken(gToken).underlyingAsset() returns (address underlying) {
            try IERC20(underlying).symbol() returns (string memory symbol) {
                console.log("  Underlying:", symbol, "at", underlying);
            } catch {
                console.log("  Underlying:", underlying);
            }

            try IERC20(underlying).allowance(gToken, POOL) returns (uint256 allowance) {
                console.log("  Current allowance:", allowance);
                if (allowance == type(uint256).max) {
                    console.log("  ✓ Unlimited approval");
                } else if (allowance > 1e30) {
                    console.log("  ✓ High approval (probably fine)");
                } else {
                    console.log("  ✗ Low approval - needs fixing!");
                }
            } catch {
                console.log("  ✗ Failed to check allowance");
            }
        } catch {
            console.log("  ✗ Failed to get underlying asset");
        }
    }

    function _fixApproval(address gToken) internal returns (bool) {
        console.log("Fixing approvals for", gToken);

        try IGoodLendToken(gToken).underlyingAsset() returns (address underlying) {
            // Check current allowance
            uint256 currentAllowance = IERC20(underlying).allowance(gToken, POOL);

            if (currentAllowance >= type(uint256).max / 2) {
                console.log("  ✓ Approval already sufficient");
                return false;
            }

            // NOTE: This won't work directly because we can't call approve() on behalf of gToken
            // The gToken contract itself needs to call approve(), which should happen in its constructor
            // or via an admin function if one exists.

            console.log("  ⚠️  ISSUE: Cannot approve on behalf of gToken contract");
            console.log("    The gToken contract itself must call approve()");
            console.log("    Check if gToken has an admin function for this");
            console.log("    Or redeploy gToken contracts to trigger constructor approval");

            return false;

        } catch {
            console.log("  ✗ Failed to get underlying asset");
            return false;
        }
    }
}

/**
 * @title FixGOO565Admin
 * @notice Alternative fix if gToken contracts have admin functions to set approvals
 */
contract FixGOO565Admin is Script {
    // This would be used if the gToken contracts have admin functions
    // to set approvals without redeployment

    function run() external {
        console.log("=== GOO-565 Admin Fix ===");
        console.log("Check if gToken contracts have admin functions like:");
        console.log("- approvePool()");
        console.log("- setPoolApproval(bool)");
        console.log("- adminApprove(address spender, uint256 amount)");
        console.log();
        console.log("If not, the fix requires redeploying gToken contracts");
        console.log("or using CREATE2 with the same addresses to preserve integrations.");
    }
}