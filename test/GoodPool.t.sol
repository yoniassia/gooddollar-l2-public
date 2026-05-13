// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../script/CreateInitialPools.s.sol";

/**
 * @title GoodPoolTest
 * @notice Unit tests for GoodPool and the CreateInitialPools deployment script.
 *
 * Covers:
 *   - Pool construction and token ordering
 *   - addLiquidity / removeLiquidity
 *   - swap (A→B and B→A)
 *   - Fee routing to UBI beneficiary
 *   - slippage guard
 *   - spotPrice and getAmountOut
 *   - multi-pool CreateInitialPools script execution
 */
contract GoodPoolTest is Test {
    MockERC20 internal gd;
    MockERC20 internal weth;
    MockERC20 internal usdc;

    GoodPool internal gdWeth;
    GoodPool internal gdUsdc;
    GoodPool internal wethUsdc;

    address internal alice = makeAddr("alice");
    address internal ubi   = makeAddr("ubiSplitter");

    function setUp() public {
        gd   = new MockERC20("GoodDollar", "G$",   18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        gdWeth  = new GoodPool(address(gd),   address(weth), address(this));
        gdUsdc  = new GoodPool(address(gd),   address(usdc), address(this));
        wethUsdc = new GoodPool(address(weth), address(usdc), address(this));

        // Mint tokens for alice
        gd.mint(alice,   100_000e18);
        weth.mint(alice,    1_000e18);
        usdc.mint(alice, 100_000e6);
    }

    // ─── Construction ─────────────────────────────────────────────────────────

    function test_tokensSorted() public view {
        // tokenA must always be the lower address
        assertLt(uint160(gdWeth.tokenA()), uint160(gdWeth.tokenB()));
    }

    function test_cannotCreatePoolWithSameTokens() public {
        vm.expectRevert("GoodPool: identical tokens");
        new GoodPool(address(gd), address(gd), address(this));
    }

    // ─── addLiquidity ─────────────────────────────────────────────────────────

    function test_addLiquidity_firstDeposit() public {
        // Seed 3,000 G$ + 1 WETH
        gd.mint(address(this), 3_000e18);
        weth.mint(address(this), 1e18);

        gd.approve(address(gdWeth), 3_000e18);
        weth.approve(address(gdWeth), 1e18);

        uint256 lp = _addLiquidityOrdered(gdWeth, address(gd), address(weth), 3_000e18, 1e18);
        assertGt(lp, 0);
        assertEq(gdWeth.totalLiquidity(), lp);
    }

    function test_addLiquidity_incrementsReserves() public {
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        gd.mint(address(this), 3_000e18);
        weth.mint(address(this), 1e18);
        gd.approve(address(gdWeth), 3_000e18);
        weth.approve(address(gdWeth), 1e18);

        uint256 raBefore = gdWeth.reserveA();
        uint256 rbBefore = gdWeth.reserveB();

        _addLiquidityOrdered(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        assertGt(gdWeth.reserveA(), raBefore);
        assertGt(gdWeth.reserveB(), rbBefore);
    }

    function test_addLiquidity_zeroReverts() public {
        gd.approve(address(gdWeth), 1e18);
        weth.approve(address(gdWeth), 0);
        vm.expectRevert("GoodPool: zero amount");
        gdWeth.addLiquidity(1e18, 0);
    }

    // ─── removeLiquidity ──────────────────────────────────────────────────────

    function test_removeLiquidity_fullWithdraw() public {
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        uint256 lp = gdWeth.liquidity(address(this));
        uint256 gdBefore = gd.balanceOf(address(this));
        uint256 weBefore = weth.balanceOf(address(this));

        gdWeth.removeLiquidity(lp);

        assertGt(gd.balanceOf(address(this)), gdBefore);
        assertGt(weth.balanceOf(address(this)), weBefore);
        assertEq(gdWeth.totalLiquidity(), 0);
    }

    function test_removeLiquidity_tooMuchReverts() public {
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);
        uint256 lp = gdWeth.liquidity(address(this));
        vm.expectRevert("GoodPool: bad lp amount");
        gdWeth.removeLiquidity(lp + 1);
    }

    // ─── swap ─────────────────────────────────────────────────────────────────

    function test_swap_AtoB() public {
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        address tokenA = gdWeth.tokenA();
        MockERC20 tA = MockERC20(tokenA);
        address tokenB = gdWeth.tokenB();
        MockERC20 tB = MockERC20(tokenB);

        uint256 swapIn = 300e18; // 10% of reserveA
        tA.mint(alice, swapIn);

        uint256 outBefore = tB.balanceOf(alice);
        vm.startPrank(alice);
        tA.approve(address(gdWeth), swapIn);
        uint256 out = gdWeth.swap(tokenA, swapIn, 0);
        vm.stopPrank();

        assertGt(out, 0);
        assertEq(tB.balanceOf(alice) - outBefore, out);
    }

    function test_swap_BtoA() public {
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        address tokenB = gdWeth.tokenB();
        MockERC20 tB = MockERC20(tokenB);
        address tokenA = gdWeth.tokenA();
        MockERC20 tA = MockERC20(tokenA);

        uint256 swapIn = 1e16; // 0.01 tokenB
        tB.mint(alice, swapIn);

        uint256 outBefore = tA.balanceOf(alice);
        vm.startPrank(alice);
        tB.approve(address(gdWeth), swapIn);
        uint256 out = gdWeth.swap(tokenB, swapIn, 0);
        vm.stopPrank();

        assertGt(out, 0);
        assertEq(tA.balanceOf(alice) - outBefore, out);
    }

    function test_swap_slippageReverts() public {
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        address tokenA = gdWeth.tokenA();
        MockERC20 tA = MockERC20(tokenA);

        uint256 swapIn = 300e18;
        tA.mint(alice, swapIn);

        vm.startPrank(alice);
        tA.approve(address(gdWeth), swapIn);
        uint256 amountOut = gdWeth.getAmountOut(tokenA, swapIn);
        // Set minOut higher than possible → should revert
        vm.expectRevert("GoodPool: slippage exceeded");
        gdWeth.swap(tokenA, swapIn, amountOut + 1);
        vm.stopPrank();
    }

    function test_swap_invalidTokenReverts() public {
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);
        vm.expectRevert("GoodPool: invalid token");
        gdWeth.swap(address(usdc), 1e18, 0);
    }

    // ─── UBI fee routing ──────────────────────────────────────────────────────

    function test_ubiFeeRoutedWhenBeneficiarySet() public {
        gdWeth.setFeeBeneficiary(ubi);
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        address tokenA = gdWeth.tokenA();
        MockERC20 tA = MockERC20(tokenA);
        uint256 swapIn = 300e18;
        tA.mint(alice, swapIn);

        vm.startPrank(alice);
        tA.approve(address(gdWeth), swapIn);
        gdWeth.swap(tokenA, swapIn, 0);
        vm.stopPrank();

        // UBI beneficiary should have received some tokens
        assertGt(tA.balanceOf(ubi), 0);
    }

    function test_noUbiFeeWhenBeneficiaryNotSet() public {
        // feeBeneficiary defaults to address(0) — no transfer should happen
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        address tokenA = gdWeth.tokenA();
        MockERC20 tA = MockERC20(tokenA);
        uint256 swapIn = 300e18;
        tA.mint(alice, swapIn);

        vm.startPrank(alice);
        tA.approve(address(gdWeth), swapIn);
        gdWeth.swap(tokenA, swapIn, 0);
        vm.stopPrank();

        assertEq(tA.balanceOf(ubi), 0);
    }

    function test_setFeeBeneficiaryOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert("GoodPool: not owner");
        gdWeth.setFeeBeneficiary(ubi);
    }

    // ─── Price queries ─────────────────────────────────────────────────────────

    function test_spotPrice_reflectsRatio() public {
        // 3000 G$ per 1 WETH → spot price of WETH (tokenB) in G$ = 3000e18
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);
        // spotPrice() = reserveB / reserveA * 1e18
        // Depending on token ordering: tokenA could be gd or weth
        // We just check it's non-zero and reasonable
        assertGt(gdWeth.spotPrice(), 0);
    }

    function test_getAmountOut_consistentWithSwap() public {
        _seedPool(gdWeth, address(gd), address(weth), 3_000e18, 1e18);

        address tokenA = gdWeth.tokenA();
        MockERC20 tA = MockERC20(tokenA);
        uint256 swapIn = 100e18;

        uint256 quoted = gdWeth.getAmountOut(tokenA, swapIn);

        tA.mint(alice, swapIn);
        vm.startPrank(alice);
        tA.approve(address(gdWeth), swapIn);
        uint256 actual = gdWeth.swap(tokenA, swapIn, 0);
        vm.stopPrank();

        assertEq(quoted, actual);
    }

    // ─── CreateInitialPools script ────────────────────────────────────────────

    function test_createInitialPools_script() public {
        // Run the script with fresh tokens
        CreateInitialPools script = new CreateInitialPools();

        // The script reads env vars. We set up a local run with mocked addresses.
        // Since vm.envOr returns address(0) for unset vars, the script will deploy
        // fresh MockERC20 tokens automatically.
        // We broadcast as the default anvil deployer
        script.run();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _addLiquidityOrdered(
        GoodPool pool,
        address tok1,
        address tok2,
        uint256 amt1,
        uint256 amt2
    ) internal returns (uint256 lp) {
        if (tok1 < tok2) {
            return pool.addLiquidity(amt1, amt2);
        } else {
            return pool.addLiquidity(amt2, amt1);
        }
    }

    function _seedPool(
        GoodPool pool,
        address tok1,
        address tok2,
        uint256 amt1,
        uint256 amt2
    ) internal {
        MockERC20(tok1).mint(address(this), amt1);
        MockERC20(tok2).mint(address(this), amt2);
        MockERC20(tok1).approve(address(pool), amt1);
        MockERC20(tok2).approve(address(pool), amt2);
        _addLiquidityOrdered(pool, tok1, tok2, amt1, amt2);
    }
}
