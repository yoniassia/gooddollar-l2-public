// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/hooks/UBIFeeHook.sol";
import "../src/GoodDollarToken.sol";
import "../src/UBIFeeSplitter.sol";
import "../src/swap/GoodSwapRouter.sol";

/**
 * @title DeployGoodSwap
 * @notice Deploys the GoodSwap DEX infrastructure on GoodDollar L2 devnet.
 *
 * Deploys:
 *   1. MockPoolManager  — devnet stand-in for the real Uniswap V4 PoolManager.
 *                         Replace with the real deployment once v4-core is installed.
 *   2. UBIFeeHook       — afterSwap hook that routes 33.33% of fees to the UBI pool.
 *   3. GoodSwapRouter   — minimal router stub (swap execution wired in next PR).
 *
 * Production upgrade path:
 *   1. forge install Uniswap/v4-core Uniswap/v4-periphery
 *   2. Replace MockPoolManager with: PoolManager poolManager = new PoolManager();
 *   3. Replace GoodSwapRouter stub with a real SafeCallback-derived router.
 *   4. Mine a CREATE2 salt so the hook address encodes the afterSwap permission bit.
 *
 * Usage (devnet):
 *   PRIVATE_KEY=<key> UBI_FEE_SPLITTER=<addr> GOOD_DOLLAR_TOKEN=<addr> \
 *     forge script script/DeployGoodSwap.s.sol --rpc-url $DEVNET_RPC \
 *     --broadcast --legacy
 *
 * If GOOD_DOLLAR_TOKEN / UBI_FEE_SPLITTER are not set the script deploys fresh
 * instances (useful for standalone devnet testing).
 */

// ─── Devnet stand-ins ─────────────────────────────────────────────────────────

/**
 * @notice Minimal Uniswap V4 PoolManager stand-in for devnet.
 * @dev The real PoolManager (from v4-core) is a singleton that holds all pool
 *      assets.  This stub accepts the same constructor surface so the hook
 *      constructor passes the zero-address check.  Replace with the real
 *      deployment for any mainnet/testnet environment.
 */
contract MockPoolManager {
    address public immutable owner;

    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice No-op unlock — satisfies the IPoolManager interface surface used
    ///         by SafeCallback-derived routers.
    function unlock(bytes calldata) external pure returns (bytes memory) {
        return "";
    }
}

// GoodSwapRouter is imported from src/swap/GoodSwapRouter.sol

// ─── HookMiner ────────────────────────────────────────────────────────────────

/**
 * @notice Utility to find a CREATE2 salt whose resulting address encodes the
 *         required Uniswap V4 hook permission flags.
 *
 * @dev Uniswap V4 encodes hook permissions in the bottom 14 bits of the
 *      contract address.  For UBIFeeHook (afterSwap only) we need bit 7 set
 *      (flag value 0x0080).
 */
library HookMiner {
    uint256 constant MAX_ITERATIONS = 200_000;

    /// @param deployer  Address that will call CREATE2.
    /// @param initCodeHash  keccak256 of the hook's creation bytecode.
    /// @param flags  Required permission bits (must match the bottom bits of the address).
    function find(
        address deployer,
        bytes32 initCodeHash,
        uint160 flags
    ) internal pure returns (bytes32 salt, address hookAddress) {
        for (uint256 i = 0; i < MAX_ITERATIONS; i++) {
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
        revert("HookMiner: salt not found in MAX_ITERATIONS");
    }
}

// ─── Deployment script ────────────────────────────────────────────────────────

contract DeployGoodSwap is Script {
    /// @notice Uniswap V4 afterSwap permission flag (bit 7).
    uint160 constant AFTER_SWAP_FLAG = 0x0080;

    /// @notice UBI share of swap fees: 33.33%
    uint256 constant UBI_FEE_BPS = 3333;

    /// @notice G$ transferred to the hook for fee operations on devnet.
    uint256 constant HOOK_SEED_G = 1_000_000e18; // 1M G$

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        // Use existing tokens if addresses are provided; otherwise deploy fresh.
        address gdTokenAddr    = vm.envOr("GOOD_DOLLAR_TOKEN", address(0));
        address splitterAddr   = vm.envOr("UBI_FEE_SPLITTER",  address(0));

        vm.startBroadcast(deployerKey);

        // 1. GoodDollarToken (deploy if not provided)
        GoodDollarToken gdToken;
        if (gdTokenAddr == address(0)) {
            gdToken = new GoodDollarToken(deployer, deployer, 1_000_000_000e18);
            gdTokenAddr = address(gdToken);
            console.log("GoodDollarToken (fresh):", gdTokenAddr);
        } else {
            gdToken = GoodDollarToken(gdTokenAddr);
            console.log("GoodDollarToken (existing):", gdTokenAddr);
        }

        // 2. UBIFeeSplitter (deploy if not provided)
        UBIFeeSplitter splitter;
        if (splitterAddr == address(0)) {
            splitter = new UBIFeeSplitter(gdTokenAddr, deployer, deployer);
            splitterAddr = address(splitter);
            console.log("UBIFeeSplitter (fresh):", splitterAddr);
        } else {
            splitter = UBIFeeSplitter(payable(splitterAddr));
            console.log("UBIFeeSplitter (existing):", splitterAddr);
        }

        // 3. MockPoolManager (devnet) / real PoolManager (production)
        //    TODO: replace with: PoolManager poolManager = new PoolManager();
        MockPoolManager poolManager = new MockPoolManager(deployer);
        console.log("MockPoolManager:", address(poolManager));

        // 4. UBIFeeHook — plain deploy on devnet.  On production, use CREATE2
        //    salt mining so the address encodes the afterSwap permission bit.
        //    (CREATE2 mining via `this._mineHook()` is blocked by newer Foundry
        //    versions that disallow `address(this)` in scripts.)
        UBIFeeHook hook = new UBIFeeHook(address(poolManager), splitterAddr, UBI_FEE_BPS, deployer);
        console.log("UBIFeeHook:", address(hook));

        // Seed hook with G$ for fee forwarding on devnet
        if (gdToken.balanceOf(deployer) >= HOOK_SEED_G) {
            gdToken.transfer(address(hook), HOOK_SEED_G);
            console.log("Hook seeded with 1M G$");
        }

        // 5. GoodSwapRouter — real UniV2-style router wrapping GoodPool contracts.
        //    Pools must be registered after creation pools are deployed.
        GoodSwapRouter router = new GoodSwapRouter(deployer);
        console.log("GoodSwapRouter:", address(router));

        vm.stopBroadcast();

        console.log("");
        console.log("=== GoodSwap Deployment Complete ===");
        console.log("GoodDollarToken:  ", gdTokenAddr);
        console.log("UBIFeeSplitter:   ", splitterAddr);
        console.log("PoolManager:      ", address(poolManager));
        console.log("UBIFeeHook:       ", address(hook));
        console.log("GoodSwapRouter:   ", address(router));
        console.log("");
        console.log("Next: run CreateInitialPools.s.sol to bootstrap G$/ETH, G$/USDC, ETH/USDC pools.");
        console.log("Then paste addresses into frontend/src/lib/chain.ts.");
    }

    /// @dev External function so we can try/catch the HookMiner call.
    function _mineHook(
        address deployer,
        bytes32 initCodeHash,
        bytes memory initCode
    ) external returns (UBIFeeHook hook) {
        (bytes32 salt,) = HookMiner.find(deployer, initCodeHash, AFTER_SWAP_FLAG);
        assembly {
            hook := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        require(address(hook) != address(0), "CREATE2 deploy failed");
    }
}
