// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/**
 * @title DeployGoodSwap
 * @notice Deploys the GoodSwap DEX infrastructure on GoodDollar L2:
 *         1. Uniswap V4 PoolManager (singleton)
 *         2. UBIFeeHook (afterSwap hook for UBI funding)
 *         3. GoodSwapRouter (custom swap router)
 *         4. PositionManager (LP position NFTs)
 *
 * @dev Prerequisites:
 *      - Install v4-core: forge install Uniswap/v4-core
 *      - Install v4-periphery: forge install Uniswap/v4-periphery
 *      - Set PRIVATE_KEY env var
 *
 * Usage:
 *   forge script script/DeployGoodSwap.s.sol --rpc-url $RPC_URL --broadcast --verify
 */

// ============ Minimal interfaces for compilation without full v4-core dependency ============
// Replace these with real imports once v4-core is installed:
//   import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
//   import {PoolManager} from "v4-core/src/PoolManager.sol";
//   import {Hooks} from "v4-core/src/libraries/Hooks.sol";
//   import {PoolKey} from "v4-core/src/types/PoolKey.sol";
//   import {Currency} from "v4-core/src/types/Currency.sol";

import "../src/UBIFeeSplitter.sol";
import "../src/GoodDollarToken.sol";

/**
 * @notice Deploys a mock PoolManager for devnet/testnet.
 * @dev In production, deploy the real Uniswap V4 PoolManager from v4-core.
 *      This placeholder allows the script to run without the full v4-core dependency.
 */
contract MockPoolManager {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }
}

/**
 * @notice Placeholder GoodSwapRouter.
 * @dev In production, this inherits SafeCallback from v4-periphery and implements
 *      unlockCallback for swaps. See RESEARCH.md Section 4 for the full design.
 */
contract GoodSwapRouter {
    address public poolManager;
    address public owner;

    constructor(address _poolManager, address _owner) {
        poolManager = _poolManager;
        owner = _owner;
    }
}

/**
 * @notice Hook address miner utility.
 * @dev Uniswap V4 encodes hook permissions in the contract address.
 *      For afterSwap + afterSwapReturnDelta, we need specific bits set.
 *      This function finds a CREATE2 salt that produces the correct address.
 */
library HookMiner {
    /// @notice Find a salt that produces an address with the required flags
    /// @param deployer The address that will deploy the hook via CREATE2
    /// @param initCodeHash The keccak256 of the hook's creation code
    /// @param flags Required flags (bits that must be set in the address)
    /// @return salt The salt to use with CREATE2
    /// @return hookAddress The resulting hook address
    function find(
        address deployer,
        bytes32 initCodeHash,
        uint160 flags
    ) internal pure returns (bytes32 salt, address hookAddress) {
        for (uint256 i = 0; i < 10000; i++) {
            salt = bytes32(i);
            hookAddress = address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)
                        )
                    )
                )
            );
            if (uint160(hookAddress) & flags == flags) {
                return (salt, hookAddress);
            }
        }
        revert("HookMiner: could not find salt");
    }
}

contract DeployGoodSwap is Script {
    // ============ Configuration ============

    /// @notice UBI fee share in basis points (3333 = 33.33% of the hook fee)
    uint256 constant UBI_FEE_BPS = 3333;

    /// @notice Initial G$ supply to deploy with
    uint256 constant INITIAL_G_SUPPLY = 1_000_000_000e18; // 1B G$

    /// @notice G$ to fund the hook with for fee operations
    uint256 constant HOOK_FUNDING = 10_000_000e18; // 10M G$

    // ============ Deployed addresses (logged) ============

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80) // Anvil default
        );
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== GoodSwap Deployment ===");
        console.log("Deployer:", deployer);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ─── Step 1: Deploy or use existing GoodDollar Token ───
        GoodDollarToken goodDollar = new GoodDollarToken(deployer, deployer, INITIAL_G_SUPPLY);
        console.log("GoodDollarToken:", address(goodDollar));

        // ─── Step 2: Deploy UBIFeeSplitter ───
        UBIFeeSplitter splitter = new UBIFeeSplitter(address(goodDollar), deployer, deployer);
        console.log("UBIFeeSplitter:", address(splitter));

        // ─── Step 3: Deploy PoolManager ───
        // TODO: Replace MockPoolManager with real Uniswap V4 PoolManager:
        //   PoolManager poolManager = new PoolManager();
        MockPoolManager poolManager = new MockPoolManager(deployer);
        console.log("PoolManager:", address(poolManager));

        // ─── Step 4: Deploy UBIFeeHook ───
        // TODO: In production, use CREATE2 with HookMiner to get correct address:
        //   (bytes32 salt, address expectedAddr) = HookMiner.find(
        //       deployer,
        //       keccak256(type(UBIFeeHook).creationCode),
        //       uint160(0x0080) // afterSwap flag
        //   );
        //   UBIFeeHook hook = new UBIFeeHook{salt: salt}(poolManager, splitter, UBI_FEE_BPS, deployer);

        // For now, deploy without address mining (works on devnet)
        import("../src/hooks/UBIFeeHook.sol");
        UBIFeeHook hook = new UBIFeeHook(
            address(poolManager),
            address(splitter),
            UBI_FEE_BPS,
            deployer
        );
        console.log("UBIFeeHook:", address(hook));

        // Fund hook with G$ for fee operations
        goodDollar.transfer(address(hook), HOOK_FUNDING);
        console.log("Hook funded with", HOOK_FUNDING / 1e18, "G$");

        // ─── Step 5: Deploy GoodSwapRouter ───
        // TODO: Replace with real router that inherits SafeCallback
        GoodSwapRouter router = new GoodSwapRouter(address(poolManager), deployer);
        console.log("GoodSwapRouter:", address(router));

        vm.stopBroadcast();

        // ─── Summary ───
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("GoodDollarToken:", address(goodDollar));
        console.log("UBIFeeSplitter: ", address(splitter));
        console.log("PoolManager:    ", address(poolManager));
        console.log("UBIFeeHook:     ", address(hook));
        console.log("GoodSwapRouter: ", address(router));
        console.log("");
        console.log("Next steps:");
        console.log("  1. Run CreatePools.s.sol to create initial liquidity pools");
        console.log("  2. Run AddSeedLiquidity.s.sol to bootstrap liquidity");
        console.log("  3. Register GoodSwap with Li.Fi for cross-chain routing");
    }
}
