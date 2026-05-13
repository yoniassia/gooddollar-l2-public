// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/hooks/UBIFeeHook.sol";

/**
 * @title HookMiner
 * @notice Utility to find a CREATE2 salt whose resulting address encodes the
 *         required Uniswap V4 hook permission flags in its lower bits.
 */
library HookMiner {
    uint256 constant MAX_ITERATIONS = 200_000;

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

/**
 * @title RedeployUBIFeeHook
 * @notice Redeploys UBIFeeHook using CREATE2 so the hook address has the
 *         afterSwap permission flag (bit 7 = 0x0080) encoded in its lower bits.
 *
 * Previous deployment (0x85495222Fd7069B987Ca38C2142732EbBFb7175D) was made
 * with a plain `new UBIFeeHook()` call (no CREATE2), so the address has
 * 0x175D in its lower 2 bytes — bit 7 is NOT set. Uniswap V4 PoolManager
 * gates afterSwap calls on the address flags, so the hook was never invoked
 * for any swap, resulting in zero UBI fees collected from swaps (GOO-280).
 *
 * This script mines a CREATE2 salt that produces an address with bit 7 set.
 * Uses Solidity's `new X{salt:}()` syntax which routes through Foundry's
 * deterministic CREATE2 factory (0x4e59b44847b379578588920cA78FbF26c0B4956C).
 * HookMiner uses the same factory address so predictions match exactly.
 *
 * Preserved constructor params from the last working deployment:
 *   poolManager  = GoodSwapRouter (0xaC9fCBA56E42d5960f813B9D0387F3D3bC003338)
 *   ubiPool      = GoodDollarToken (0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1)
 *   ubiFeeShare  = 3333 bps (33.33%)
 *
 * After running this script:
 *   1. Update op-stack/addresses.json: UBIFeeHook → new address
 *   2. Update frontend/src/lib/devnet.ts: UBIFeeHook → new address
 *   3. Verify afterSwap fires on a test swap
 *
 * Usage (devnet):
 *   forge script script/RedeployUBIFeeHook.s.sol \
 *     --rpc-url $DEVNET_RPC --broadcast --legacy
 */
contract RedeployUBIFeeHook is Script {
    // ── Uniswap V4 afterSwap flag ─────────────────────────────────────────────
    uint160 constant AFTER_SWAP_FLAG = 0x0080;  // bit 7

    // ── Existing devnet addresses ─────────────────────────────────────────────
    address constant GOOD_SWAP_ROUTER  = 0xaC9fCBA56E42d5960f813B9D0387F3D3bC003338;
    address constant GOOD_DOLLAR_TOKEN = 0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1;

    // ── Preserved constructor params ──────────────────────────────────────────
    uint256 constant UBI_FEE_BPS = 3333;  // 33.33%

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        // Build init code hash for address mining.
        // Must use the same constructor args that will be passed at deploy time.
        bytes memory initCode = abi.encodePacked(
            type(UBIFeeHook).creationCode,
            abi.encode(GOOD_SWAP_ROUTER, GOOD_DOLLAR_TOKEN, UBI_FEE_BPS, deployer)
        );
        bytes32 initCodeHash = keccak256(initCode);

        // Mine: use CREATE2_FACTORY (inherited from forge-std/Base.sol) as deployer
        // since new X{salt:}() broadcasts through it, not through the EOA.
        (bytes32 salt, address predicted) = HookMiner.find(CREATE2_FACTORY, initCodeHash, AFTER_SWAP_FLAG);

        console.log("Salt found:", vm.toString(salt));
        console.log("Predicted hook address:", predicted);
        console.log("afterSwap flag set:", (uint160(predicted) & AFTER_SWAP_FLAG) == AFTER_SWAP_FLAG);

        vm.startBroadcast(deployerKey);

        // Deploy via Solidity salt syntax — routes through CREATE2_FACTORY
        UBIFeeHook hook = new UBIFeeHook{salt: salt}(
            GOOD_SWAP_ROUTER,
            GOOD_DOLLAR_TOKEN,
            UBI_FEE_BPS,
            deployer
        );

        require(address(hook) != address(0), "CREATE2 deploy failed");
        require(address(hook) == predicted, "address mismatch - salt or factory wrong");

        vm.stopBroadcast();

        console.log("");
        console.log("=== UBIFeeHook Redeployment Complete (GOO-280) ===");
        console.log("Old UBIFeeHook (wrong flags): 0x85495222Fd7069B987Ca38C2142732EbBFb7175D");
        console.log("New UBIFeeHook (correct):    ", address(hook));
        console.log("poolManager:                 ", GOOD_SWAP_ROUTER);
        console.log("ubiPool:                     ", GOOD_DOLLAR_TOKEN);
        console.log("afterSwap flag (0x0080):      set =", (uint160(address(hook)) & AFTER_SWAP_FLAG) == AFTER_SWAP_FLAG);
        console.log("");
        console.log("TODO: Update op-stack/addresses.json UBIFeeHook ->", address(hook));
        console.log("TODO: Update frontend/src/lib/devnet.ts UBIFeeHook ->", address(hook));
    }
}
