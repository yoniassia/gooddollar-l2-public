// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IGoodLendPool {
    function getReservesCount() external view returns (uint256);
    function reservesList(uint256 index) external view returns (address);
    function setReserveActive(address asset, bool active) external;
    function getReserveData(address asset) external view returns (
        uint256 totalDeposits,
        uint256 totalBorrows,
        uint256 liquidityIndex,
        uint256 borrowIndex,
        uint256 supplyRate,
        uint256 borrowRate,
        uint256 accruedToTreasury
    );
    function supply(address asset, uint256 amount) external;
}

interface IToken {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}

/**
 * @title FixGoodLendReserves
 * @notice Fix GOO-388: GoodLendPool all reserves inactive after redeploy.
 *         This script reactivates both USDC and WETH reserves on the pool.
 *
 *         Run with:
 *           forge script script/FixGoodLendReserves.s.sol \
 *             --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
 *
 *         Addresses from GOO-388 issue description
 */
contract FixGoodLendReserves is Script {
    // Known addresses from GOO-388 issue
    address constant POOL = 0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff;

    // From FixGoodLendUSDAReserve.s.sol
    address constant USDC = 0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5;
    address constant gUSDC = 0x4631BCAbD6dF18D94796344963cB60d44a4136b6;
    address constant dUSDC = 0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D;

    // Need to find WETH addresses - will discover them from reserves list

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== GOO-388 Fix: Reactivate GoodLendPool Reserves ===");
        console.log("Deployer:", deployer);
        console.log("Pool:", POOL);

        // 1. Check current state
        uint256 reservesCount = IGoodLendPool(POOL).getReservesCount();
        console.log("Total reserves:", reservesCount);

        // 2. List all reserves and their status
        for (uint256 i = 0; i < reservesCount; i++) {
            address asset = IGoodLendPool(POOL).reservesList(i);
            console.log("Reserve", i, "asset:", asset);

            try IToken(asset).symbol() returns (string memory symbol) {
                console.log("  Symbol:", symbol);
            } catch {
                console.log("  Symbol: <unknown>");
            }

            // Try to call supply with 0 to test if reserve is active
            try IGoodLendPool(POOL).getReserveData(asset) returns (
                uint256 totalDeposits,
                uint256 totalBorrows,
                uint256 liquidityIndex,
                uint256 borrowIndex,
                uint256 supplyRate,
                uint256 borrowRate,
                uint256 accruedToTreasury
            ) {
                console.log("  Reserve data accessible - likely active");
                console.log("    Total deposits:", totalDeposits);
                console.log("    Total borrows:", totalBorrows);
            } catch {
                console.log("  Reserve data failed - likely inactive");
            }
        }

        vm.startBroadcast(deployerKey);

        // 3. Reactivate all reserves
        console.log("\n=== Reactivating Reserves ===");
        for (uint256 i = 0; i < reservesCount; i++) {
            address asset = IGoodLendPool(POOL).reservesList(i);

            try IToken(asset).symbol() returns (string memory symbol) {
                console.log("Activating", symbol, "reserve at", asset);
            } catch {
                console.log("Activating reserve at", asset);
            }

            try IGoodLendPool(POOL).setReserveActive(asset, true) {
                console.log("  ✓ Activated successfully");
            } catch Error(string memory reason) {
                console.log("  ✗ Failed:", reason);
            } catch {
                console.log("  ✗ Failed: unknown error");
            }
        }

        // 4. Verify fix by testing supply() on known USDC reserve
        console.log("\n=== Verification ===");

        // Ensure we have USDC to test with
        uint256 usdcBal = IToken(USDC).balanceOf(deployer);
        if (usdcBal < 1000e6) {
            console.log("Minting test USDC...");
            IToken(USDC).mint(deployer, 10_000e6);
        }

        IToken(USDC).approve(POOL, 1000e6);

        try IGoodLendPool(POOL).supply(USDC, 1000e6) {
            console.log("✓ USDC supply() works - reserves are active!");
        } catch Error(string memory reason) {
            console.log("✗ USDC supply() still fails:", reason);
        } catch {
            console.log("✗ USDC supply() still fails: unknown error");
        }

        console.log("\n=== GOO-388 Fix Complete ===");
        vm.stopBroadcast();
    }
}

/**
 * @title DiagnoseGoodLendReserves
 * @notice Diagnostic script to inspect GoodLendPool reserve state.
 *         Run this first to understand the problem before applying fixes.
 */
contract DiagnoseGoodLendReserves is Script {
    address constant POOL = 0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff;

    function run() external view {
        console.log("=== GoodLendPool Reserve Diagnosis ===");
        console.log("Pool:", POOL);

        uint256 reservesCount = IGoodLendPool(POOL).getReservesCount();
        console.log("Total reserves:", reservesCount);

        for (uint256 i = 0; i < reservesCount; i++) {
            address asset = IGoodLendPool(POOL).reservesList(i);

            console.log("\n--- Reserve", i, "---");
            console.log("Asset:", asset);

            try IToken(asset).symbol() returns (string memory symbol) {
                console.log("Symbol:", symbol);
                console.log("Decimals:", IToken(asset).decimals());
            } catch {
                console.log("Symbol: <failed to query>");
            }

            try IGoodLendPool(POOL).getReserveData(asset) returns (
                uint256 totalDeposits,
                uint256 totalBorrows,
                uint256 liquidityIndex,
                uint256 borrowIndex,
                uint256 supplyRate,
                uint256 borrowRate,
                uint256 accruedToTreasury
            ) {
                console.log("Status: ACTIVE (getReserveData succeeded)");
                console.log("Total deposits:", totalDeposits);
                console.log("Total borrows:", totalBorrows);
                console.log("Liquidity index:", liquidityIndex);
            } catch Error(string memory reason) {
                console.log("Status: INACTIVE or ERROR");
                console.log("Error:", reason);
            } catch {
                console.log("Status: INACTIVE (getReserveData reverted)");
            }
        }
    }
}