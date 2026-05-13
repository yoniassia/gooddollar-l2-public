// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/hooks/UBIFeeHook.sol";
import "../src/GoodDollarToken.sol";

/**
 * @title UBI Fee Hook Tests
 * @notice Comprehensive test suite for the Uniswap V4 UBI fee hook
 */
contract UBIFeeHookTest is Test {
    UBIFeeHook public hook;
    GoodDollarToken public token;

    address public poolManager = address(0x1111);
    address public admin = address(0x3333);
    address public user = address(0x4444);
    address public identityOracle = address(0x5555);
    address public token1Addr = address(0x6666);

    uint256 constant DEFAULT_UBI_FEE_BPS = 3333; // 33.33%
    uint256 constant INITIAL_SUPPLY = 1_000_000e18;

    function setUp() public {
        // Deploy G$ token
        token = new GoodDollarToken(admin, identityOracle, INITIAL_SUPPLY);

        // UBI pool IS the GoodDollarToken contract — fundUBIPool increments
        // its internal ubiPool counter which is then distributed to claimants.
        hook = new UBIFeeHook(poolManager, address(token), DEFAULT_UBI_FEE_BPS, admin);

        // Fund the hook with G$ so it can pay UBI fees
        vm.prank(admin);
        token.transfer(address(hook), 100_000e18);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsParameters() public view {
        assertEq(hook.poolManager(), poolManager);
        assertEq(hook.ubiPool(), address(token));
        assertEq(hook.ubiFeeShareBPS(), DEFAULT_UBI_FEE_BPS);
        assertEq(hook.admin(), admin);
        assertEq(hook.paused(), false);
    }

    function test_constructor_revertsZeroPoolManager() public {
        vm.expectRevert(UBIFeeHook.ZeroAddress.selector);
        new UBIFeeHook(address(0), address(token), DEFAULT_UBI_FEE_BPS, admin);
    }

    function test_constructor_revertsZeroUBIPool() public {
        vm.expectRevert(UBIFeeHook.ZeroAddress.selector);
        new UBIFeeHook(poolManager, address(0), DEFAULT_UBI_FEE_BPS, admin);
    }

    function test_constructor_revertsZeroAdmin() public {
        vm.expectRevert(UBIFeeHook.ZeroAddress.selector);
        new UBIFeeHook(poolManager, address(token), DEFAULT_UBI_FEE_BPS, address(0));
    }

    function test_constructor_revertsFeeTooHigh() public {
        vm.expectRevert(UBIFeeHook.FeeTooHigh.selector);
        new UBIFeeHook(poolManager, address(token), 5001, admin);
    }

    function test_constructor_maxFeeAllowed() public {
        UBIFeeHook maxHook = new UBIFeeHook(poolManager, address(token), 5000, admin);
        assertEq(maxHook.ubiFeeShareBPS(), 5000);
    }

    // ============ Fee Calculation Tests ============

    function test_calculateUBIFee_standardAmount() public view {
        uint256 amount = 1000e18;
        uint256 expected = (amount * DEFAULT_UBI_FEE_BPS) / 10000;
        assertEq(hook.calculateUBIFee(amount), expected);
        // 33.33% of 1000 = 333.3
        assertEq(hook.calculateUBIFee(amount), 333_300000000000000000);
    }

    function test_calculateUBIFee_zeroAmount() public view {
        assertEq(hook.calculateUBIFee(0), 0);
    }

    function test_calculateUBIFee_smallAmount() public view {
        // 1 wei → fee = 0 (rounds down)
        assertEq(hook.calculateUBIFee(1), 0);
        // 3 wei → fee = 0 (3 * 3333 / 10000 = 0.9999 → 0)
        assertEq(hook.calculateUBIFee(3), 0);
        // 4 wei → fee = 1 (4 * 3333 / 10000 = 1.3332 → 1)
        assertEq(hook.calculateUBIFee(4), 1);
    }

    function test_calculateUBIFee_largeAmount() public view {
        uint256 amount = 1_000_000_000e18; // 1 billion tokens
        uint256 expected = (amount * DEFAULT_UBI_FEE_BPS) / 10000;
        assertEq(hook.calculateUBIFee(amount), expected);
    }

    function testFuzz_calculateUBIFee_neverExceedsInput(uint256 amount) public view {
        // Bound to avoid overflow
        amount = bound(amount, 0, type(uint256).max / DEFAULT_UBI_FEE_BPS);
        uint256 fee = hook.calculateUBIFee(amount);
        assertLe(fee, amount);
    }

    // ============ afterSwap Tests ============

    function test_afterSwap_routesFeeToUBIPool() public {
        PoolKey memory key = _makePoolKey(address(token), token1Addr);
        SwapParams memory params = SwapParams({
            zeroForOne: false, // swapping token1 → token0, output is token0 (G$)
            amountSpecified: 100e18,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta memory delta = BalanceDelta({
            amount0: int128(int256(1000e18)), // 1000 G$ output
            amount1: -int128(int256(100e18))
        });

        uint256 expectedUBIFee = hook.calculateUBIFee(1000e18);
        uint256 ubiPoolBefore = token.ubiPool();
        uint256 tokenContractBalBefore = token.balanceOf(address(token));

        vm.prank(poolManager);
        bytes4 selector = hook.afterSwap(user, key, params, delta, "");

        assertEq(selector, hook.afterSwap.selector);
        // ubiPool counter incremented — tokens will be distributed to claimants
        assertEq(token.ubiPool(), ubiPoolBefore + expectedUBIFee);
        // GoodDollarToken contract holds the tokens
        assertEq(token.balanceOf(address(token)), tokenContractBalBefore + expectedUBIFee);
        assertEq(hook.totalSwapsProcessed(), 1);
        assertEq(hook.totalUBIFees(address(token)), expectedUBIFee);
    }

    function test_afterSwap_zeroForOne_routesFee() public {
        PoolKey memory key = _makePoolKey(token1Addr, address(token));
        SwapParams memory params = SwapParams({
            zeroForOne: true, // output is token1 = G$
            amountSpecified: 100e18,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta memory delta = BalanceDelta({
            amount0: -int128(int256(100e18)),
            amount1: int128(int256(500e18)) // 500 G$ output
        });

        uint256 expectedUBIFee = hook.calculateUBIFee(500e18);
        uint256 ubiPoolBefore = token.ubiPool();

        vm.prank(poolManager);
        hook.afterSwap(user, key, params, delta, "");

        assertEq(hook.totalUBIFees(address(token)), expectedUBIFee);
        assertEq(token.ubiPool(), ubiPoolBefore + expectedUBIFee);
    }

    function test_afterSwap_zeroOutputAmount_noFee() public {
        PoolKey memory key = _makePoolKey(address(token), token1Addr);
        SwapParams memory params = SwapParams({
            zeroForOne: false,
            amountSpecified: 0,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta memory delta = BalanceDelta({
            amount0: 0,
            amount1: 0
        });

        vm.prank(poolManager);
        hook.afterSwap(user, key, params, delta, "");

        assertEq(hook.totalSwapsProcessed(), 0);
    }

    function test_afterSwap_negativeOutput_noFee() public {
        PoolKey memory key = _makePoolKey(address(token), token1Addr);
        SwapParams memory params = SwapParams({
            zeroForOne: false,
            amountSpecified: 100e18,
            sqrtPriceLimitX96: 0
        });
        // Both amounts negative means no output tokens
        BalanceDelta memory delta = BalanceDelta({
            amount0: -int128(int256(100e18)),
            amount1: -int128(int256(50e18))
        });

        vm.prank(poolManager);
        hook.afterSwap(user, key, params, delta, "");

        assertEq(hook.totalSwapsProcessed(), 0);
    }

    function test_afterSwap_onlyPoolManager() public {
        PoolKey memory key = _makePoolKey(address(token), token1Addr);
        SwapParams memory params = SwapParams({
            zeroForOne: false,
            amountSpecified: 100e18,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta memory delta = BalanceDelta({
            amount0: int128(int256(100e18)),
            amount1: 0
        });

        vm.prank(user); // Not pool manager
        vm.expectRevert(UBIFeeHook.NotPoolManager.selector);
        hook.afterSwap(user, key, params, delta, "");
    }

    function test_afterSwap_paused_skipsProcessing() public {
        vm.prank(admin);
        hook.setPaused(true);

        PoolKey memory key = _makePoolKey(address(token), token1Addr);
        SwapParams memory params = SwapParams({
            zeroForOne: false,
            amountSpecified: 100e18,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta memory delta = BalanceDelta({
            amount0: int128(int256(1000e18)),
            amount1: 0
        });

        uint256 ubiPoolBefore = token.ubiPool();

        vm.prank(poolManager);
        hook.afterSwap(user, key, params, delta, "");

        // No fee should have been collected
        assertEq(token.ubiPool(), ubiPoolBefore);
        assertEq(hook.totalSwapsProcessed(), 0);
    }

    function test_afterSwap_multipleSwaps_accumulateFees() public {
        PoolKey memory key = _makePoolKey(address(token), token1Addr);

        for (uint256 i = 0; i < 5; i++) {
            SwapParams memory params = SwapParams({
                zeroForOne: false,
                amountSpecified: 100e18,
                sqrtPriceLimitX96: 0
            });
            BalanceDelta memory delta = BalanceDelta({
                amount0: int128(int256(200e18)),
                amount1: 0
            });

            vm.prank(poolManager);
            hook.afterSwap(user, key, params, delta, "");
        }

        uint256 expectedPerSwap = hook.calculateUBIFee(200e18);
        assertEq(hook.totalSwapsProcessed(), 5);
        assertEq(hook.totalUBIFees(address(token)), expectedPerSwap * 5);
        assertEq(token.ubiPool(), expectedPerSwap * 5);
    }

    // ============ Admin Tests ============

    function test_setUBIFeeShare() public {
        vm.prank(admin);
        hook.setUBIFeeShare(5000); // 50%

        assertEq(hook.ubiFeeShareBPS(), 5000);

        // Verify new fee calculation
        assertEq(hook.calculateUBIFee(1000e18), 500e18);
    }

    function test_setUBIFeeShare_revertsNotAdmin() public {
        vm.prank(user);
        vm.expectRevert(UBIFeeHook.NotAdmin.selector);
        hook.setUBIFeeShare(5000);
    }

    function test_setUBIFeeShare_revertsFeeTooHigh() public {
        vm.prank(admin);
        vm.expectRevert(UBIFeeHook.FeeTooHigh.selector);
        hook.setUBIFeeShare(5001);
    }

    function test_setUBIFeeShare_zeroAllowed() public {
        vm.prank(admin);
        hook.setUBIFeeShare(0);
        assertEq(hook.ubiFeeShareBPS(), 0);
        assertEq(hook.calculateUBIFee(1000e18), 0);
    }

    function test_setUBIPool() public {
        address newPool = address(0x9999);
        vm.prank(admin);
        hook.setUBIPool(newPool);
        assertEq(hook.ubiPool(), newPool);
    }

    function test_setUBIPool_revertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(UBIFeeHook.ZeroAddress.selector);
        hook.setUBIPool(address(0));
    }

    function test_setUBIPool_revertsNotAdmin() public {
        vm.prank(user);
        vm.expectRevert(UBIFeeHook.NotAdmin.selector);
        hook.setUBIPool(address(0x9999));
    }

    function test_setAdmin() public {
        address newAdmin = address(0x8888);
        vm.prank(admin);
        hook.setAdmin(newAdmin);
        assertEq(hook.admin(), newAdmin);

        // Old admin should no longer work
        vm.prank(admin);
        vm.expectRevert(UBIFeeHook.NotAdmin.selector);
        hook.setAdmin(address(0x7777));

        // New admin works
        vm.prank(newAdmin);
        hook.setAdmin(address(0x7777));
        assertEq(hook.admin(), address(0x7777));
    }

    function test_setAdmin_revertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(UBIFeeHook.ZeroAddress.selector);
        hook.setAdmin(address(0));
    }

    function test_setPaused() public {
        vm.prank(admin);
        hook.setPaused(true);
        assertEq(hook.paused(), true);

        vm.prank(admin);
        hook.setPaused(false);
        assertEq(hook.paused(), false);
    }

    function test_setPaused_revertsNotAdmin() public {
        vm.prank(user);
        vm.expectRevert(UBIFeeHook.NotAdmin.selector);
        hook.setPaused(true);
    }

    // ============ Hook Permissions ============

    function test_getHookPermissions_onlyAfterSwap() public view {
        Hooks memory perms = hook.getHookPermissions();
        assertEq(perms.beforeInitialize, false);
        assertEq(perms.afterInitialize, false);
        assertEq(perms.beforeAddLiquidity, false);
        assertEq(perms.afterAddLiquidity, false);
        assertEq(perms.beforeRemoveLiquidity, false);
        assertEq(perms.afterRemoveLiquidity, false);
        assertEq(perms.beforeSwap, false);
        assertEq(perms.afterSwap, true);
        assertEq(perms.beforeDonate, false);
        assertEq(perms.afterDonate, false);
    }

    // ============ Rescue Tokens ============

    function test_rescueTokens() public {
        uint256 hookBalance = token.balanceOf(address(hook));
        address recipient = address(0x7777);

        vm.prank(admin);
        hook.rescueTokens(address(token), recipient, 1000e18);

        assertEq(token.balanceOf(recipient), 1000e18);
        assertEq(token.balanceOf(address(hook)), hookBalance - 1000e18);
    }

    function test_rescueTokens_revertsNotAdmin() public {
        vm.prank(user);
        vm.expectRevert(UBIFeeHook.NotAdmin.selector);
        hook.rescueTokens(address(token), user, 1000e18);
    }

    function test_rescueTokens_revertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(UBIFeeHook.ZeroAddress.selector);
        hook.rescueTokens(address(token), address(0), 1000e18);
    }

    // ============ Events ============

    function test_afterSwap_emitsEvent() public {
        PoolKey memory key = _makePoolKey(address(token), token1Addr);
        SwapParams memory params = SwapParams({
            zeroForOne: false,
            amountSpecified: 100e18,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta memory delta = BalanceDelta({
            amount0: int128(int256(1000e18)),
            amount1: 0
        });

        uint256 expectedFee = hook.calculateUBIFee(1000e18);

        vm.expectEmit(true, true, false, true);
        emit UBIFeeHook.UBIFeeCollected(address(token), 1000e18, expectedFee, address(token));

        vm.prank(poolManager);
        hook.afterSwap(user, key, params, delta, "");
    }

    function test_setUBIFeeShare_emitsEvent() public {
        vm.expectEmit(false, false, false, true);
        emit UBIFeeHook.UBIFeeShareUpdated(DEFAULT_UBI_FEE_BPS, 5000);

        vm.prank(admin);
        hook.setUBIFeeShare(5000);
    }

    // ============ Gas Benchmarks ============

    function test_gasBenchmark_afterSwap() public {
        PoolKey memory key = _makePoolKey(address(token), token1Addr);
        SwapParams memory params = SwapParams({
            zeroForOne: false,
            amountSpecified: 100e18,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta memory delta = BalanceDelta({
            amount0: int128(int256(1000e18)),
            amount1: 0
        });

        vm.prank(poolManager);
        uint256 gasBefore = gasleft();
        hook.afterSwap(user, key, params, delta, "");
        uint256 gasUsed = gasBefore - gasleft();

        assertLt(gasUsed, 150_000, "Hook gas overhead exceeds 150k");
        emit log_named_uint("afterSwap gas used", gasUsed);
    }

    function test_gasBenchmark_afterSwap_paused() public {
        vm.prank(admin);
        hook.setPaused(true);

        PoolKey memory key = _makePoolKey(address(token), token1Addr);
        SwapParams memory params = SwapParams({
            zeroForOne: false,
            amountSpecified: 100e18,
            sqrtPriceLimitX96: 0
        });
        BalanceDelta memory delta = BalanceDelta({
            amount0: int128(int256(1000e18)),
            amount1: 0
        });

        vm.prank(poolManager);
        uint256 gasBefore = gasleft();
        hook.afterSwap(user, key, params, delta, "");
        uint256 gasUsed = gasBefore - gasleft();

        assertLt(gasUsed, 10_000, "Paused hook should use minimal gas");
        emit log_named_uint("afterSwap (paused) gas used", gasUsed);
    }

    function test_gasBenchmark_calculateUBIFee() public view {
        uint256 gasBefore = gasleft();
        hook.calculateUBIFee(1000e18);
        uint256 gasUsed = gasBefore - gasleft();

        assertLt(gasUsed, 10_000, "calculateUBIFee should be cheap");
    }

    // ============ Helpers ============

    function _makePoolKey(address c0, address c1) internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: c0,
            currency1: c1,
            fee: 3000,
            tickSpacing: 60,
            hooks: address(hook)
        });
    }
}
