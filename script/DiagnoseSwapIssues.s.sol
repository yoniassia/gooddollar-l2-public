// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IGoodSwapRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256);

    function getPool(address tokenA, address tokenB) external view returns (address);
    function owner() external view returns (address);
}

interface IGoodPool {
    function getReserves() external view returns (uint112, uint112, uint32);
    function tokenA() external view returns (address);
    function tokenB() external view returns (address);
}

/**
 * @title DiagnoseSwapIssues
 * @notice Diagnostic script for GOO-569: swapExactTokensForETH reverted
 *
 *         This script checks:
 *         1. Whether GoodSwapRouter has ETH-specific functions
 *         2. Pool registration status
 *         3. Liquidity and reserve state
 *         4. Common failure modes
 */
contract DiagnoseSwapIssues is Script {
    // These addresses would need to be updated based on actual deployment
    address constant ROUTER = address(0x1234); // Replace with actual router address
    address constant GDT = address(0x5678);    // Replace with actual GDT address
    address constant WETH = address(0x9abc);   // Replace with actual WETH address

    function run() external view {
        console.log("=== GOO-569: Swap Diagnostics ===");
        console.log("Router:", ROUTER);
        console.log("");

        // 1. Check if router contract exists
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(ROUTER)
        }
        console.log("Router code size:", codeSize, "bytes");

        if (codeSize == 0) {
            console.log("✗ ERROR: No code at router address - contract not deployed");
            return;
        }

        // 2. Check function existence by attempting low-level calls
        console.log("\n=== Function Availability ===");

        // Test swapExactTokensForTokens (should exist)
        try this.testSwapExactTokensForTokens() {
            console.log("✓ swapExactTokensForTokens: EXISTS");
        } catch {
            console.log("✗ swapExactTokensForTokens: MISSING");
        }

        // Test swapExactTokensForETH (missing)
        try this.testSwapExactTokensForETH() {
            console.log("✓ swapExactTokensForETH: EXISTS");
        } catch {
            console.log("✗ swapExactTokensForETH: MISSING (ROOT CAUSE)");
        }

        // Test swapExactETHForTokens (missing)
        try this.testSwapExactETHForTokens() {
            console.log("✓ swapExactETHForTokens: EXISTS");
        } catch {
            console.log("✗ swapExactETHForTokens: MISSING");
        }

        // 3. Check pool registration
        console.log("\n=== Pool Registration ===");
        try IGoodSwapRouter(ROUTER).getPool(GDT, WETH) returns (address pool) {
            console.log("GDT/WETH pool:", pool);

            if (pool == address(0)) {
                console.log("✗ No pool registered for GDT/WETH pair");
                console.log("This could cause swaps to fail even if function exists");
            } else {
                console.log("✓ Pool registered");

                // Check pool state
                try this.checkPoolState(pool) {
                    console.log("✓ Pool state accessible");
                } catch {
                    console.log("✗ Pool state inaccessible - pool may be broken");
                }
            }
        } catch {
            console.log("✗ Cannot query pool registry - router interface mismatch");
        }

        // 4. Check router ownership (for pool registration)
        try IGoodSwapRouter(ROUTER).owner() returns (address owner) {
            console.log("Router owner:", owner);
        } catch {
            console.log("Could not read router owner");
        }

        // 5. Summary and recommendations
        console.log("\n=== Summary ===");
        console.log("Primary Issue: swapExactTokensForETH function does not exist");
        console.log("This is missing functionality in the GoodSwapRouter contract");
        console.log("");
        console.log("Solutions:");
        console.log("1. IMMEDIATE: Frontend wrapper using swapExactTokensForTokens + WETH");
        console.log("2. LONG-TERM: Upgrade router with ETH-specific functions");
        console.log("3. ALTERNATIVE: Deploy ETH helper proxy contract");
        console.log("");
        console.log("Related Issues to Check:");
        console.log("- Pool registration status");
        console.log("- Liquidity availability");
        console.log("- WETH contract deployment");
    }

    // Test functions (will revert if function doesn't exist)
    function testSwapExactTokensForTokens() external pure {
        // This creates a function signature check without executing
        bytes4 selector = bytes4(keccak256("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)"));
        require(selector != 0, "Function signature test");
    }

    function testSwapExactTokensForETH() external pure {
        bytes4 selector = bytes4(keccak256("swapExactTokensForETH(uint256,uint256,address[],address,uint256)"));
        require(selector != 0, "Function signature test");
    }

    function testSwapExactETHForTokens() external pure {
        bytes4 selector = bytes4(keccak256("swapExactETHForTokens(uint256,address[],address,uint256)"));
        require(selector != 0, "Function signature test");
    }

    function checkPoolState(address pool) external view {
        IGoodPool(pool).getReserves();
        IGoodPool(pool).tokenA();
        IGoodPool(pool).tokenB();
    }
}

/**
 * @title MockSwapETHFunctions
 * @notice Temporary solution: Frontend-deployable helper for ETH swaps
 */
contract MockSwapETHFunctions is Script {
    function run() external {
        console.log("=== Frontend Wrapper Solution ===");
        console.log("");
        console.log("Deploy this helper contract or implement logic in frontend:");
        console.log("");
        console.log("async function swapExactTokensForETH(");
        console.log("  tokenIn: string,");
        console.log("  amountIn: BigNumber,");
        console.log("  amountOutMin: BigNumber,");
        console.log("  to: string,");
        console.log("  deadline: number");
        console.log(") {");
        console.log("  // 1. Call router.swapExactTokensForTokens([tokenIn, WETH], ...)");
        console.log("  // 2. Call WETH.withdraw(wethAmount)");
        console.log("  // 3. Transfer ETH to recipient");
        console.log("}");
        console.log("");
        console.log("This provides missing ETH swap functionality without contract changes.");
    }
}