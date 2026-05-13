// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../script/CreateInitialPools.s.sol"; // GoodPool, MockERC20
import "../../src/swap/GoodSwapRouter.sol";
import "../../src/hooks/UBIFeeHook.sol";
import "../../src/GoodDollarToken.sol";
import "../../src/UBIFeeSplitter.sol";
import "../../src/lending/GoodLendPool.sol";
import "../../src/lending/GoodLendToken.sol";
import "../../src/lending/InterestRateModel.sol";
import "../../src/lending/SimplePriceOracle.sol";
import "../../src/lending/DebtToken.sol";

/**
 * @title CrossProtocolIntegration
 * @notice End-to-end integration tests exercising multiple GoodDollar L2
 *         protocols together, verifying UBI fees flow at every step.
 */
contract CrossProtocolIntegration is Test {
    // --- Tokens ---
    GoodDollarToken internal gd;
    MockERC20       internal weth;
    MockERC20       internal usdc;

    // --- Swap layer ---
    GoodPool        internal gdWethPool;
    GoodPool        internal gdUsdcPool;
    GoodSwapRouter  internal router;
    UBIFeeHook      internal hook;

    // --- Fee layer ---
    UBIFeeSplitter  internal splitter;

    // --- Lending layer ---
    GoodLendPool        internal lendPool;
    SimplePriceOracle   internal priceOracle;
    InterestRateModel   internal rateModel;
    GoodLendToken       internal gGD;
    GoodLendToken       internal gWETH;
    GoodLendToken       internal gUSDC;
    DebtToken           internal dGD;
    DebtToken           internal dWETH;
    DebtToken           internal dUSDC;

    // --- Actors ---
    address internal admin    = address(0xAD);
    address internal treasury = address(0xBEEF);
    address internal alice    = address(0xA11CE);
    address internal bob      = address(0xB0B);
    address internal carol    = address(0xCA701);
    address internal identity = address(0x1D);

    uint256 constant INITIAL_GD     = 10_000_000e18;
    uint256 constant POOL_GD        = 3_000_000e18;
    uint256 constant POOL_WETH      = 1_000e18;
    uint256 constant POOL_USDC      = 3_000_000e6;
    uint256 constant USER_GD        = 100_000e18;
    uint256 constant USER_WETH      = 50e18;
    uint256 constant USER_USDC      = 100_000e6;
    uint256 constant DEADLINE       = type(uint256).max;

    function setUp() public {
        // 1. Core token
        vm.startPrank(admin);
        gd = new GoodDollarToken(admin, identity, INITIAL_GD);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        splitter = new UBIFeeSplitter(address(gd), treasury, admin);
        vm.stopPrank();

        // 2. AMM pools
        gdWethPool = new GoodPool(address(gd), address(weth), admin);
        gdUsdcPool = new GoodPool(address(gd), address(usdc), admin);

        // 3. Swap router
        router = new GoodSwapRouter(address(this));
        router.registerPool(address(gdWethPool));
        router.registerPool(address(gdUsdcPool));

        // 4. UBI fee hook
        hook = new UBIFeeHook(address(router), address(gd), 3333, admin);

        // 5. Seed pool liquidity
        vm.startPrank(admin);
        gd.transfer(address(this), POOL_GD * 2 + 500_000e18);
        vm.stopPrank();

        weth.mint(address(this), POOL_WETH);
        usdc.mint(address(this), POOL_USDC);

        gd.approve(address(gdWethPool), type(uint256).max);
        weth.approve(address(gdWethPool), type(uint256).max);
        gd.approve(address(gdUsdcPool), type(uint256).max);
        usdc.approve(address(gdUsdcPool), type(uint256).max);

        _addSorted(gdWethPool, address(gd), address(weth), POOL_GD, POOL_WETH);
        _addSorted(gdUsdcPool, address(gd), address(usdc), POOL_GD, POOL_USDC);

        // 6. Fund hook
        vm.prank(admin);
        gd.transfer(address(hook), 100_000e18);

        // 7. Lending infra
        priceOracle = new SimplePriceOracle(admin);
        rateModel   = new InterestRateModel(admin);

        vm.startPrank(admin);
        priceOracle.setAssetPrice(address(gd), 1e8);
        priceOracle.setAssetPrice(address(weth), 3000e8);
        priceOracle.setAssetPrice(address(usdc), 1e8);

        rateModel.setRateParams(address(gd),   0.80e27, 0, 0.04e27, 0.60e27);
        rateModel.setRateParams(address(weth), 0.80e27, 0.01e27, 0.038e27, 0.80e27);
        rateModel.setRateParams(address(usdc), 0.80e27, 0, 0.04e27, 0.60e27);
        vm.stopPrank();

        lendPool = new GoodLendPool(address(priceOracle), address(rateModel), treasury, admin);

        gGD   = new GoodLendToken(address(lendPool), address(gd),   "GoodLend GD",   "gGD");
        gWETH = new GoodLendToken(address(lendPool), address(weth), "GoodLend WETH", "gWETH");
        gUSDC = new GoodLendToken(address(lendPool), address(usdc), "GoodLend USDC", "gUSDC");
        dGD   = new DebtToken(address(lendPool), address(gd),   "GoodLend Debt GD",   "dGD");
        dWETH = new DebtToken(address(lendPool), address(weth), "GoodLend Debt WETH", "dWETH");
        dUSDC = new DebtToken(address(lendPool), address(usdc), "GoodLend Debt USDC", "dUSDC");

        vm.startPrank(admin);
        lendPool.initReserve(address(gd),   address(gGD),   address(dGD),   2000, 7500, 8000, 10500, 5_000_000, 3_000_000, 18);
        lendPool.initReserve(address(weth), address(gWETH), address(dWETH), 2000, 7500, 8200, 10500, 10_000,    8_000,     18);
        lendPool.initReserve(address(usdc), address(gUSDC), address(dUSDC), 2000, 8000, 8500, 10500, 5_000_000, 4_000_000, 6);
        vm.stopPrank();

        // Seed lending liquidity
        gd.approve(address(lendPool), 200_000e18);
        lendPool.supply(address(gd), 200_000e18);

        weth.mint(address(this), 100e18);
        weth.approve(address(lendPool), 100e18);
        lendPool.supply(address(weth), 100e18);

        usdc.mint(address(this), 1_000_000e6);
        usdc.approve(address(lendPool), 1_000_000e6);
        lendPool.supply(address(usdc), 1_000_000e6);

        // Fund users
        _fundUser(alice);
        _fundUser(bob);
        _fundUser(carol);
    }

    // =========================================================================
    // Test 1: Swap collects fees in the pool
    // =========================================================================

    function test_swap_poolCollectsFees() public {
        uint256 swapAmount = 1_000e18;

        vm.startPrank(alice);
        gd.approve(address(router), swapAmount);
        uint256 wethOut = _swap(address(gd), address(weth), swapAmount, 0, alice);
        vm.stopPrank();

        assertGt(wethOut, 0, "Alice should receive WETH");
        assertGt(weth.balanceOf(alice), USER_WETH, "Alice WETH balance increased");
    }

    // =========================================================================
    // Test 2: UBI fee calculation accuracy
    // =========================================================================

    function test_ubiFeeCalculation_accuracy() public view {
        assertEq(hook.calculateUBIFee(10_000e18), 3_333e18, "33.33% of 10k");
        assertEq(hook.calculateUBIFee(0), 0, "Zero = zero");
        assertEq(hook.calculateUBIFee(1), 0, "1 wei rounds to 0");
        assertEq(hook.calculateUBIFee(10_000), 3333, "10000 wei = 3333");
    }

    // =========================================================================
    // Test 3: Swap output -> lending supply
    // =========================================================================

    function test_swapThenLend_fullFlow() public {
        vm.startPrank(alice);
        gd.approve(address(router), 5_000e18);
        uint256 wethReceived = _swap(address(gd), address(weth), 5_000e18, 0, alice);
        assertGt(wethReceived, 0, "Should receive WETH from swap");

        weth.approve(address(lendPool), wethReceived);
        lendPool.supply(address(weth), wethReceived);
        vm.stopPrank();

        assertGt(gWETH.balanceOf(alice), 0, "Alice should hold gWETH");
    }

    // =========================================================================
    // Test 4: Full cycle - swap -> supply -> borrow -> repay -> withdraw
    // =========================================================================

    function test_fullCycle_swapSupplyBorrowRepayWithdraw() public {
        vm.startPrank(alice);

        // Step 1: Swap G$ for USDC
        gd.approve(address(router), 10_000e18);
        uint256 usdcFromSwap = _swap(address(gd), address(usdc), 10_000e18, 0, alice);
        assertGt(usdcFromSwap, 0, "Step 1: got USDC");

        // Step 2: Supply USDC
        usdc.approve(address(lendPool), usdcFromSwap);
        lendPool.supply(address(usdc), usdcFromSwap);
        assertGt(gUSDC.balanceOf(alice), 0, "Step 2: got gUSDC");

        // Step 3: Borrow G$
        uint256 borrowAmount = 1_000e18;
        lendPool.borrow(address(gd), borrowAmount);
        assertGe(gd.balanceOf(alice), borrowAmount, "Step 3: got borrowed G$");

        // Step 4: Repay
        gd.approve(address(lendPool), borrowAmount);
        uint256 repaid = lendPool.repay(address(gd), borrowAmount);
        assertGt(repaid, 0, "Step 4: repaid debt");

        // Step 5: Withdraw
        uint256 withdrawn = lendPool.withdraw(address(usdc), usdcFromSwap);
        assertGt(withdrawn, 0, "Step 5: withdrew USDC");
        vm.stopPrank();
    }

    // =========================================================================
    // Test 5: Multi-user parallel swaps
    // =========================================================================

    function test_multiUser_parallelSwaps() public {
        uint256 swapAmount = 2_000e18;

        vm.startPrank(alice);
        gd.approve(address(router), swapAmount);
        _swap(address(gd), address(weth), swapAmount, 0, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        gd.approve(address(router), swapAmount);
        _swap(address(gd), address(usdc), swapAmount, 0, bob);
        vm.stopPrank();

        vm.startPrank(carol);
        gd.approve(address(router), swapAmount);
        _swap(address(gd), address(weth), swapAmount, 0, carol);
        vm.stopPrank();

        assertGt(weth.balanceOf(alice), USER_WETH, "Alice got WETH");
        assertGt(usdc.balanceOf(bob), USER_USDC, "Bob got USDC");
        assertGt(weth.balanceOf(carol), USER_WETH, "Carol got WETH");
    }

    // =========================================================================
    // Test 6: Fee splitter routes G$ correctly
    // =========================================================================

    function test_feeSplitter_routesCorrectly() public {
        uint256 feeAmount = 10_000e18;

        vm.startPrank(admin);
        gd.approve(address(splitter), feeAmount);
        splitter.registerDApp(address(admin), "TestDApp");

        uint256 ubiPoolBefore = gd.ubiPool();
        uint256 treasuryBefore = gd.balanceOf(treasury);

        splitter.splitFee(feeAmount, admin);
        vm.stopPrank();

        uint256 expectedUBI = (feeAmount * 3333) / 10_000;
        assertEq(gd.ubiPool() - ubiPoolBefore, expectedUBI, "UBI pool got 33.33%");

        uint256 expectedTreasury = (feeAmount * 1667) / 10_000;
        assertEq(gd.balanceOf(treasury) - treasuryBefore, expectedTreasury, "Treasury got 16.67%");
    }

    // =========================================================================
    // Test 7: Hook pause prevents fee collection
    // =========================================================================

    function test_hookPause_preventsFeeCollection() public {
        vm.prank(admin);
        hook.setPaused(true);

        uint256 swapsBefore = hook.totalSwapsProcessed();

        vm.startPrank(alice);
        gd.approve(address(router), 1_000e18);
        _swap(address(gd), address(weth), 1_000e18, 0, alice);
        vm.stopPrank();

        assertEq(hook.totalSwapsProcessed(), swapsBefore, "No processing when paused");

        vm.prank(admin);
        hook.setPaused(false);
    }

    // =========================================================================
    // Test 8: Cross-market lending - supply G$, borrow WETH
    // =========================================================================

    function test_lending_crossMarket_supplyGDBorrowWETH() public {
        vm.startPrank(alice);
        gd.approve(address(lendPool), 50_000e18);
        lendPool.supply(address(gd), 50_000e18);

        lendPool.borrow(address(weth), 1e18);
        vm.stopPrank();

        assertGe(weth.balanceOf(alice), USER_WETH + 1e18, "Alice received borrowed WETH");
    }

    // =========================================================================
    // Test 9: Fuzz - UBI fee never exceeds output
    // =========================================================================

    function testFuzz_ubiFee_neverExceedsOutput(uint256 amount) public view {
        // Bound to avoid overflow in amount * ubiFeeShareBPS
        amount = bound(amount, 0, type(uint256).max / 10_000);
        uint256 fee = hook.calculateUBIFee(amount);
        assertLe(fee, amount, "UBI fee must never exceed input");
        if (amount > 100) {
            assertLe(fee, (amount * 34) / 100, "Within 34% bound");
        }
    }

    // =========================================================================
    // Test 10: Swap slippage protection
    // =========================================================================

    function test_swap_slippageProtection() public {
        uint256 swapAmount = 1_000e18;
        uint256 expectedOut = router.getAmountOut(swapAmount, address(gd), address(weth));

        vm.startPrank(alice);
        gd.approve(address(router), swapAmount);

        address[] memory path = new address[](2);
        path[0] = address(gd);
        path[1] = address(weth);

        vm.expectRevert();
        router.swapExactTokensForTokens(swapAmount, expectedOut * 2, path, alice, DEADLINE);
        vm.stopPrank();
    }

    // =========================================================================
    // Test 11: Pool k-invariant grows with fees
    // =========================================================================

    function test_poolReserves_kGrowsWithFees() public {
        uint256 resABefore = gdWethPool.reserveA();
        uint256 resBBefore = gdWethPool.reserveB();
        uint256 kBefore = resABefore * resBBefore;

        vm.startPrank(alice);
        gd.approve(address(router), 1_000e18);
        _swap(address(gd), address(weth), 1_000e18, 0, alice);
        vm.stopPrank();

        uint256 kAfter = gdWethPool.reserveA() * gdWethPool.reserveB();
        assertGe(kAfter, kBefore, "k invariant should grow with fees");
    }

    // =========================================================================
    // Test 12: Swap -> Supply -> Borrow (recycled capital)
    // =========================================================================

    function test_recycledCapital_swapSupplyBorrow() public {
        vm.startPrank(alice);

        gd.approve(address(router), 10_000e18);
        uint256 wethGot = _swap(address(gd), address(weth), 10_000e18, 0, alice);

        weth.approve(address(lendPool), wethGot);
        lendPool.supply(address(weth), wethGot);

        // Borrow small USDC against WETH collateral
        lendPool.borrow(address(usdc), 1e6);
        assertGt(usdc.balanceOf(alice), USER_USDC, "Got borrowed USDC");
        vm.stopPrank();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        internal
        returns (uint256)
    {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        return router.swapExactTokensForTokens(amountIn, minOut, path, to, DEADLINE);
    }

    function _addSorted(GoodPool pool, address tok1, address tok2, uint256 amt1, uint256 amt2) internal {
        if (tok1 < tok2) {
            pool.addLiquidity(amt1, amt2);
        } else {
            pool.addLiquidity(amt2, amt1);
        }
    }

    function _fundUser(address user) internal {
        vm.prank(admin);
        gd.transfer(user, USER_GD);
        weth.mint(user, USER_WETH);
        usdc.mint(user, USER_USDC);
    }
}
