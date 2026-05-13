// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/lending/GoodLendPool.sol";
import "../src/lending/GoodLendToken.sol";

interface IERC20Extended {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function symbol() external view returns (string memory);
    function name() external view returns (string memory);
    function decimals() external view returns (uint8);
}

interface IGoodLendPoolExtended {
    function getReservesCount() external view returns (uint256);
    function reservesList(uint256 index) external view returns (address);
    function getReserveData(address asset) external view returns (
        uint256 totalDeposits,
        uint256 totalBorrows,
        uint256 liquidityIndex,
        uint256 borrowIndex,
        uint256 supplyRate,
        uint256 borrowRate,
        uint256 accruedToTreasury
    );
}

/**
 * @title DiagnoseGOO565
 * @notice Comprehensive diagnosis of GOO-565: withdraw() fails with Insufficient allowance
 *
 * This script will:
 * 1. Check if GoodLendPool contract exists and is functional
 * 2. List all reserves and their status
 * 3. Check gToken approval status for underlying assets
 * 4. Test a sample supply/withdraw flow to reproduce the issue
 * 5. Provide specific recommendations for fixes
 */
contract DiagnoseGOO565 is Script {
    // Addresses from latest deployment
    address constant POOL = 0x171b627111dd81c46f6ae3f1455232bf1cbc311f;
    address constant MOCK_USDC = 0x7c938b88a1be87501dd0efc3e955a13221c9c19c;
    address constant MOCK_WETH = 0x0f9ad2d34a3c2943375185437ef53b2bbda76cbb;
    address constant GUSDC = 0x9fc087971b01dcbecef4781d121fffb9e40399f5;
    address constant GWETH = 0x153c299219d31111f1237c86180e9962e49a33d2;

    function run() external view {
        console.log("=== GOO-565 Comprehensive Diagnosis ===");
        console.log("Issue: withdraw() fails with Insufficient allowance");
        console.log();

        // 1. Check pool exists
        uint256 poolCodeSize;
        assembly { poolCodeSize := extcodesize(POOL) }

        if (poolCodeSize == 0) {
            console.log("✗ CRITICAL: GoodLendPool contract not found at", POOL);
            return;
        }
        console.log("✓ GoodLendPool contract exists");
        console.log("  Address:", POOL);
        console.log("  Code size:", poolCodeSize);

        IGoodLendPoolExtended pool = IGoodLendPoolExtended(POOL);

        // 2. Check reserves
        uint256 reservesCount;
        try pool.getReservesCount() returns (uint256 count) {
            reservesCount = count;
            console.log("✓ Pool.getReservesCount() succeeded:", count);
        } catch Error(string memory reason) {
            console.log("✗ Pool.getReservesCount() failed:", reason);
            return;
        } catch {
            console.log("✗ Pool.getReservesCount() reverted");
            return;
        }

        if (reservesCount == 0) {
            console.log("⚠️  No reserves found - pool not initialized or reserves inactive");
            console.log();
            console.log("=== Possible Causes ===");
            console.log("1. Reserves were never initialized");
            console.log("2. Reserves were deactivated (setReserveActive(asset, false))");
            console.log("3. Pool was redeployed but reserves not re-initialized");
            console.log();
            console.log("=== Recommended Fix ===");
            console.log("Run: forge script script/DeployGoodLend.s.sol --broadcast");
            console.log("Or: Check if reserves need to be reactivated");
            return;
        }

        // 3. Check each reserve
        console.log();
        console.log("=== Reserve Analysis ===");

        for (uint256 i = 0; i < reservesCount; i++) {
            address asset;
            try pool.reservesList(i) returns (address addr) {
                asset = addr;
            } catch {
                console.log("Reserve", i, ": Failed to get address");
                continue;
            }

            console.log();
            console.log("--- Reserve", i, "---");
            console.log("Asset:", asset);

            // Get asset info
            try IERC20Extended(asset).symbol() returns (string memory symbol) {
                console.log("Symbol:", symbol);
            } catch {
                console.log("Symbol: <failed>");
            }

            // Check reserve data
            try pool.getReserveData(asset) returns (
                uint256 totalDeposits,
                uint256 totalBorrows,
                uint256 liquidityIndex,
                uint256 borrowIndex,
                uint256 supplyRate,
                uint256 borrowRate,
                uint256 accruedToTreasury
            ) {
                console.log("✓ Reserve is ACTIVE");
                console.log("  Total deposits:", totalDeposits);
                console.log("  Total borrows:", totalBorrows);
                console.log("  Liquidity index:", liquidityIndex);

                // Find gToken address for this asset
                address gToken = _findGToken(asset);
                if (gToken != address(0)) {
                    console.log("  gToken:", gToken);
                    _checkGTokenApproval(asset, gToken);
                } else {
                    console.log("  ⚠️  Could not determine gToken address");
                }

            } catch Error(string memory reason) {
                console.log("✗ Reserve is INACTIVE or ERROR");
                console.log("  Error:", reason);
            } catch {
                console.log("✗ Reserve is INACTIVE (reverted)");
            }
        }

        // 4. Test supply/withdraw scenario if possible
        console.log();
        console.log("=== Withdrawal Test Scenario ===");
        _simulateWithdrawal();
    }

    function _findGToken(address asset) internal pure returns (address) {
        if (asset == MOCK_USDC) return GUSDC;
        if (asset == MOCK_WETH) return GWETH;
        return address(0);
    }

    function _checkGTokenApproval(address asset, address gToken) internal view {
        console.log("  --- gToken Approval Check ---");

        uint256 gTokenCodeSize;
        assembly { gTokenCodeSize := extcodesize(gToken) }

        if (gTokenCodeSize == 0) {
            console.log("  ✗ gToken contract not found");
            return;
        }

        try IERC20Extended(asset).allowance(gToken, POOL) returns (uint256 allowance) {
            console.log("  gToken → Pool allowance:", allowance);

            if (allowance == type(uint256).max) {
                console.log("  ✓ Unlimited approval - should work");
            } else if (allowance > 1e30) {
                console.log("  ✓ High approval - likely sufficient");
            } else {
                console.log("  ✗ LOW APPROVAL - This is likely the issue!");
                console.log("    The gToken needs to approve the pool for unlimited spending");
                console.log("    This should happen in the gToken constructor");
            }
        } catch Error(string memory reason) {
            console.log("  ✗ Failed to check allowance:", reason);
        } catch {
            console.log("  ✗ Allowance check reverted");
        }

        // Check gToken balance
        try IERC20Extended(asset).balanceOf(gToken) returns (uint256 balance) {
            console.log("  gToken underlying balance:", balance);
            if (balance == 0) {
                console.log("  ⚠️  gToken has no underlying tokens - no liquidity");
            }
        } catch {
            console.log("  ✗ Failed to check gToken balance");
        }
    }

    function _simulateWithdrawal() internal view {
        console.log("Testing theoretical withdrawal flow:");
        console.log("1. User has gTokens from previous supply");
        console.log("2. User calls pool.withdraw(asset, amount)");
        console.log("3. Pool calls gToken.burn(user, amount) ← Should work");
        console.log("4. Pool calls asset.transferFrom(gToken, user, amount) ← FAILS HERE");
        console.log();
        console.log("The failure happens because:");
        console.log("- gToken contract needs to approve pool to spend its underlying tokens");
        console.log("- This approval may be missing or was reset");
        console.log();
        console.log("=== Solution ===");
        console.log("Each gToken contract must call:");
        console.log("  underlyingAsset.approve(pool, type(uint256).max)");
        console.log();
        console.log("This should happen automatically in the gToken constructor,");
        console.log("but may have been reset or failed during deployment.");
    }
}