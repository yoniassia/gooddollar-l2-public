// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../script/CreateInitialPools.s.sol";
import "../../src/swap/GoodSwapRouter.sol";

/**
 * @title GoodSwapRouterTest
 * @notice Tests for GoodSwapRouter: pool registry, exact-in, exact-out,
 *         slippage guards, deadline enforcement, and owner-only admin actions.
 */
contract GoodSwapRouterTest is Test {
    MockERC20 internal gd;
    MockERC20 internal weth;
    MockERC20 internal usdc;

    GoodPool internal gdWeth;
    GoodPool internal gdUsdc;

    GoodSwapRouter internal router;

    address internal alice = makeAddr("alice");
    address internal bob   = makeAddr("bob");

    uint256 constant DEADLINE = type(uint256).max;

    function setUp() public {
        gd   = new MockERC20("GoodDollar",    "G$",   18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        usdc = new MockERC20("USD Coin",      "USDC", 6);

        // Deploy pools (constructor sorts tokens by address)
        gdWeth = new GoodPool(address(gd), address(weth), address(this));
        gdUsdc = new GoodPool(address(gd), address(usdc), address(this));

        // Seed liquidity — amounts must match canonical (tokenA, tokenB) order
        // GoodPool sorts by address: lower address = tokenA
        gd.mint(address(this),   4_000_000e18);  // extra for both pools
        weth.mint(address(this),     1_000e18);
        usdc.mint(address(this), 1_000_000e6);

        gd.approve(address(gdWeth), type(uint256).max);
        weth.approve(address(gdWeth), type(uint256).max);
        _addSorted(gdWeth, address(gd), address(weth), 3_000_000e18, 1_000e18);

        gd.approve(address(gdUsdc), type(uint256).max);
        usdc.approve(address(gdUsdc), type(uint256).max);
        _addSorted(gdUsdc, address(gd), address(usdc), 1_000_000e18, 1_000_000e6);

        // Deploy router and register pools
        router = new GoodSwapRouter(address(this));
        router.registerPool(address(gdWeth));
        router.registerPool(address(gdUsdc));

        // Fund alice
        gd.mint(alice,   100_000e18);
        weth.mint(alice,      10e18);
        usdc.mint(alice, 100_000e6);
    }

    /// @dev Pass amounts as (tok1Amount, tok2Amount) and sort to match pool's canonical order.
    function _addSorted(GoodPool pool, address tok1, address tok2, uint256 amt1, uint256 amt2) internal {
        if (tok1 < tok2) {
            pool.addLiquidity(amt1, amt2);
        } else {
            pool.addLiquidity(amt2, amt1);
        }
    }

    // ─── Pool registry ────────────────────────────────────────────────────────

    function test_registerPool() public view {
        address pool = router.getPool(address(gd), address(weth));
        assertEq(pool, address(gdWeth));

        // Order-independent lookup
        address poolReverse = router.getPool(address(weth), address(gd));
        assertEq(poolReverse, address(gdWeth));
    }

    function test_removePool() public {
        router.removePool(address(gd), address(weth));
        assertEq(router.getPool(address(gd), address(weth)), address(0));
    }

    function test_registerPool_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(GoodSwapRouter.NotOwner.selector);
        router.registerPool(address(gdWeth));
    }

    function test_getAmountOut_quote() public view {
        // Buying WETH with 3000 G$: should get ~1 WETH minus fee
        uint256 amountOut = router.getAmountOut(3_000e18, address(gd), address(weth));
        // With 3M G$ : 1000 WETH reserves and 0.3% fee, expect slightly under 1 WETH
        assertGt(amountOut, 0.99e18);
        assertLt(amountOut, 1e18);
    }

    function test_getAmountIn_quote() public view {
        uint256 desiredWeth = 0.5e18;
        uint256 amountIn = router.getAmountIn(desiredWeth, address(gd), address(weth));
        // Verify round-trip: amountIn should produce >= desiredWeth
        uint256 checkOut = router.getAmountOut(amountIn, address(gd), address(weth));
        assertGe(checkOut, desiredWeth);
    }

    // ─── swapExactTokensForTokens ─────────────────────────────────────────────

    function test_swapExactTokensForTokens_gd_to_weth() public {
        uint256 amountIn = 3_000e18; // 3000 G$
        uint256 expectedOut = router.getAmountOut(amountIn, address(gd), address(weth));

        vm.startPrank(alice);
        gd.approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(gd);
        path[1] = address(weth);

        uint256 wethBefore = weth.balanceOf(alice);
        router.swapExactTokensForTokens(amountIn, expectedOut, path, alice, DEADLINE);
        uint256 wethAfter = weth.balanceOf(alice);
        vm.stopPrank();

        assertEq(wethAfter - wethBefore, expectedOut);
    }

    function test_swapExactTokensForTokens_weth_to_gd() public {
        uint256 amountIn = 1e18; // 1 WETH
        uint256 expectedOut = router.getAmountOut(amountIn, address(weth), address(gd));

        vm.startPrank(alice);
        weth.approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(gd);

        uint256 gdBefore = gd.balanceOf(alice);
        router.swapExactTokensForTokens(amountIn, expectedOut, path, alice, DEADLINE);
        uint256 gdAfter = gd.balanceOf(alice);
        vm.stopPrank();

        assertEq(gdAfter - gdBefore, expectedOut);
    }

    function test_swapExactTokensForTokens_to_different_address() public {
        uint256 amountIn = 1_000e18;
        uint256 expectedOut = router.getAmountOut(amountIn, address(gd), address(usdc));

        vm.startPrank(alice);
        gd.approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(gd);
        path[1] = address(usdc);

        uint256 usdcBefore = usdc.balanceOf(bob);
        router.swapExactTokensForTokens(amountIn, expectedOut, path, bob, DEADLINE);
        uint256 usdcAfter = usdc.balanceOf(bob);
        vm.stopPrank();

        assertEq(usdcAfter - usdcBefore, expectedOut);
    }

    function test_swapExactTokensForTokens_slippage_revert() public {
        uint256 amountIn = 3_000e18;
        uint256 tooHighMinOut = 1e18; // expects full 1 WETH, but fee reduces it

        vm.startPrank(alice);
        gd.approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(gd);
        path[1] = address(weth);

        vm.expectRevert(); // GoodPool: slippage exceeded
        router.swapExactTokensForTokens(amountIn, tooHighMinOut, path, alice, DEADLINE);
        vm.stopPrank();
    }

    function test_swapExactTokensForTokens_deadline_revert() public {
        uint256 amountIn = 1_000e18;

        vm.startPrank(alice);
        gd.approve(address(router), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(gd);
        path[1] = address(weth);

        vm.expectRevert(GoodSwapRouter.Expired.selector);
        router.swapExactTokensForTokens(amountIn, 0, path, alice, block.timestamp - 1);
        vm.stopPrank();
    }

    function test_swapExactTokensForTokens_no_pool_revert() public {
        vm.startPrank(alice);
        weth.approve(address(router), 1e18);

        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc); // weth/usdc pool not registered

        vm.expectRevert(); // PoolNotFound
        router.swapExactTokensForTokens(1e18, 0, path, alice, DEADLINE);
        vm.stopPrank();
    }

    // ─── swapTokensForExactTokens ─────────────────────────────────────────────

    function test_swapTokensForExactTokens_basic() public {
        uint256 exactWethOut = 0.5e18;
        uint256 maxGdIn = router.getAmountIn(exactWethOut, address(gd), address(weth)) * 101 / 100; // +1% buffer

        vm.startPrank(alice);
        gd.approve(address(router), maxGdIn);

        address[] memory path = new address[](2);
        path[0] = address(gd);
        path[1] = address(weth);

        uint256 gdBefore = gd.balanceOf(alice);
        uint256 wethBefore = weth.balanceOf(alice);

        uint256 amountIn = router.swapTokensForExactTokens(
            exactWethOut, maxGdIn, path, alice, DEADLINE
        );
        vm.stopPrank();

        // Received exactly the target amount
        assertEq(weth.balanceOf(alice) - wethBefore, exactWethOut);
        // Spent <= maxGdIn
        assertLe(gdBefore - gd.balanceOf(alice), maxGdIn);
        assertEq(gdBefore - gd.balanceOf(alice), amountIn);
    }

    function test_swapTokensForExactTokens_excessive_input_revert() public {
        uint256 exactWethOut = 0.5e18;
        uint256 tooLowMaxIn = 1e18; // 1 G$ is way too little to buy 0.5 WETH

        vm.startPrank(alice);
        gd.approve(address(router), tooLowMaxIn);

        address[] memory path = new address[](2);
        path[0] = address(gd);
        path[1] = address(weth);

        vm.expectRevert(GoodSwapRouter.ExcessiveInputAmount.selector);
        router.swapTokensForExactTokens(exactWethOut, tooLowMaxIn, path, alice, DEADLINE);
        vm.stopPrank();
    }

    // ─── Pool not found ───────────────────────────────────────────────────────

    function test_poolNotFound_revert() public {
        address unknownToken = makeAddr("unknownToken");
        assertEq(router.getPool(address(gd), unknownToken), address(0));
    }
}
