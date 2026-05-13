// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IUBIFeeHook {
    function setUBIPool(address newPool) external;
    function ubiPool() external view returns (address);
    function admin() external view returns (address);
}

/**
 * @title FixUBIFeeHookPool
 * @notice One-shot fix: update UBIFeeHook.ubiPool from the outdated UBIFeeSplitter
 *         (0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512) to GoodDollarToken
 *         (0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1).
 *
 * Background (GOO-264):
 *   RedeployUBIFeeHook.s.sol was run on 2026-04-04 and deployed a new UBIFeeHook at
 *   0x85495222Fd7069B987Ca38C2142732EbBFb7175D with the correct poolManager but the
 *   wrong ubiPool — it was set to the outdated UBIFeeSplitter which does NOT implement
 *   fundUBIPool(). As a result afterSwap() would always revert, making every swap fail.
 *
 *   Fix: call setUBIPool(GoodDollarToken) so afterSwap() calls fundUBIPool() on the
 *   GoodDollarToken contract which does implement it.
 *
 * Usage (devnet):
 *   forge script script/FixUBIFeeHookPool.s.sol \
 *     --rpc-url $DEVNET_RPC --broadcast --legacy
 */
contract FixUBIFeeHookPool is Script {
    address constant UBI_FEE_HOOK        = 0x85495222Fd7069B987Ca38C2142732EbBFb7175D;
    address constant GOOD_DOLLAR_TOKEN   = 0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1;
    address constant OUTDATED_SPLITTER   = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;

    function run() external {
        uint256 key = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(key);

        IUBIFeeHook hook = IUBIFeeHook(UBI_FEE_HOOK);

        address before = hook.ubiPool();
        console.log("ubiPool before:", before);
        require(before == OUTDATED_SPLITTER, "unexpected ubiPool - check addresses");

        hook.setUBIPool(GOOD_DOLLAR_TOKEN);

        address after_ = hook.ubiPool();
        console.log("ubiPool after: ", after_);
        require(after_ == GOOD_DOLLAR_TOKEN, "update failed");

        console.log("GOO-264 fixed: UBIFeeHook.ubiPool now points to GoodDollarToken");

        vm.stopBroadcast();
    }
}
