// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/swap/LimitOrderBook.sol";
import "../../src/swap/GoodSwapRouter.sol";
import "../../script/CreateInitialPools.s.sol"; // GoodPool, MockERC20

contract LimitOrderBookTest is Test {
    // ─── Contracts ───────────────────────────────────────────────────────
    LimitOrderBook public book;
    GoodSwapRouter public router;
    GoodPool       public pool;

    MockERC20 public tokenA; // "WETH"
    MockERC20 public tokenB; // "USDC"

    address public admin   = address(0xAD);
    address public alice   = address(0xA1);
    address public bob     = address(0xB0);
    address public keeper  = address(0xFE);

    function setUp() public {
        vm.warp(1_000_000); // Set a non-zero timestamp
        vm.startPrank(admin);

        // Deploy tokens
        MockERC20 t0 = new MockERC20("Token A", "TKA", 18);
        MockERC20 t1 = new MockERC20("Token B", "TKB", 18);

        // GoodPool sorts by address — ensure our tokenA matches pool's tokenA
        if (address(t0) < address(t1)) {
            tokenA = t0;
            tokenB = t1;
        } else {
            tokenA = t1;
            tokenB = t0;
        }

        // AMM pool: 10,000 A + 20,000,000 B (price: 1 A = 2000 B)
        pool = new GoodPool(address(tokenA), address(tokenB), admin);

        tokenA.mint(admin, 10_000 ether);
        tokenB.mint(admin, 20_000_000 ether);
        tokenA.approve(address(pool), 10_000 ether);
        tokenB.approve(address(pool), 20_000_000 ether);
        pool.addLiquidity(10_000 ether, 20_000_000 ether);

        // Router
        router = new GoodSwapRouter(admin);
        router.registerPool(address(pool));

        // Limit order book
        book = new LimitOrderBook(address(router), admin);

        vm.stopPrank();

        // Fund users
        tokenA.mint(alice, 100 ether);
        tokenB.mint(alice, 200_000 ether);
        tokenA.mint(bob, 50 ether);
        tokenB.mint(bob, 100_000 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Place Order Tests
    // ═══════════════════════════════════════════════════════════════════

    function test_placeOrder_basic() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 10 ether);
        uint256 orderId = book.placeOrder(
            address(tokenA),
            address(tokenB),
            10 ether,
            2100e18,    // Want at least 2100 USDC per WETH
            0           // No expiry
        );
        vm.stopPrank();

        assertEq(orderId, 0);
        (address orderOwner,,, uint256 amountIn, uint256 amountFilled,
         uint256 targetPrice, uint256 expiry, LimitOrderBook.OrderStatus status) = book.getOrder(0);

        assertEq(orderOwner, alice);
        assertEq(amountIn, 10 ether);
        assertEq(amountFilled, 0);
        assertEq(targetPrice, 2100e18);
        assertEq(expiry, 0);
        assertEq(uint8(status), uint8(LimitOrderBook.OrderStatus.Active));

        // Tokens should be escrowed
        assertEq(tokenA.balanceOf(address(book)), 10 ether);
    }

    function test_placeOrder_withExpiry() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 5 ether);
        uint256 orderId = book.placeOrder(
            address(tokenA), address(tokenB), 5 ether, 1900e18,
            block.timestamp + 1 hours
        );
        vm.stopPrank();

        (,,,,, , uint256 expiry,) = book.getOrder(orderId);
        assertEq(expiry, block.timestamp + 1 hours);
    }

    function test_placeOrder_revert_zeroAmount() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 10 ether);
        vm.expectRevert(LimitOrderBook.ZeroAmount.selector);
        book.placeOrder(address(tokenA), address(tokenB), 0, 2000e18, 0);
        vm.stopPrank();
    }

    function test_placeOrder_revert_expiredTimestamp() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 10 ether);
        vm.expectRevert(LimitOrderBook.OrderExpiredErr.selector);
        book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2000e18, block.timestamp - 1);
        vm.stopPrank();
    }

    function test_placeOrder_revert_zeroAddress() public {
        vm.startPrank(alice);
        vm.expectRevert(LimitOrderBook.ZeroAddress.selector);
        book.placeOrder(address(0), address(tokenB), 10 ether, 2000e18, 0);
        vm.stopPrank();
    }

    function test_placeOrder_incrementsId() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 20 ether);
        uint256 id0 = book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2000e18, 0);
        uint256 id1 = book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2100e18, 0);
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(book.nextOrderId(), 2);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Cancel Order Tests
    // ═══════════════════════════════════════════════════════════════════

    function test_cancelOrder_refundsTokens() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 10 ether);
        uint256 orderId = book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2100e18, 0);

        uint256 balBefore = tokenA.balanceOf(alice);
        book.cancelOrder(orderId);
        uint256 balAfter = tokenA.balanceOf(alice);
        vm.stopPrank();

        assertEq(balAfter - balBefore, 10 ether);
        (,,,,,,, LimitOrderBook.OrderStatus status) = book.getOrder(orderId);
        assertEq(uint8(status), uint8(LimitOrderBook.OrderStatus.Cancelled));
    }

    function test_cancelOrder_revert_notOwner() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 10 ether);
        uint256 orderId = book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2100e18, 0);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(LimitOrderBook.NotOrderOwner.selector);
        book.cancelOrder(orderId);
    }

    function test_cancelOrder_revert_alreadyCancelled() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 10 ether);
        uint256 orderId = book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2100e18, 0);
        book.cancelOrder(orderId);

        vm.expectRevert(LimitOrderBook.OrderNotActive.selector);
        book.cancelOrder(orderId);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    // Fill Order Tests
    // ═══════════════════════════════════════════════════════════════════

    function test_fillOrder_basic() public {
        // Alice places sell order: sell 1 WETH, want at least 1900 USDC/WETH
        // Current pool price: ~2000 USDC/WETH, so this should fill
        vm.startPrank(alice);
        tokenA.approve(address(book), 1 ether);
        uint256 orderId = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 1900e18, 0);
        vm.stopPrank();

        uint256 aliceUsdcBefore = tokenB.balanceOf(alice);

        // Keeper fills
        vm.prank(keeper);
        book.fillOrder(orderId, 1 ether);

        uint256 aliceUsdcAfter = tokenB.balanceOf(alice);
        uint256 keeperReward = tokenB.balanceOf(keeper);

        // Alice should have received USDC (minus keeper fee)
        assertTrue(aliceUsdcAfter > aliceUsdcBefore);
        assertTrue(keeperReward > 0);

        // Order should be filled
        (,,,,,,, LimitOrderBook.OrderStatus status) = book.getOrder(orderId);
        assertEq(uint8(status), uint8(LimitOrderBook.OrderStatus.Filled));
    }

    function test_fillOrder_partialFill() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 10 ether);
        uint256 orderId = book.placeOrder(address(tokenA), address(tokenB), 10 ether, 1800e18, 0);
        vm.stopPrank();

        // Fill only 3 WETH of 10
        vm.prank(keeper);
        book.fillOrder(orderId, 3 ether);

        (,,,, uint256 amountFilled,,, LimitOrderBook.OrderStatus status) = book.getOrder(orderId);
        assertEq(amountFilled, 3 ether);
        assertEq(uint8(status), uint8(LimitOrderBook.OrderStatus.Active)); // Still active

        // Fill rest
        vm.prank(keeper);
        book.fillOrder(orderId, 7 ether);

        (,,,, uint256 amountFilled2,,, LimitOrderBook.OrderStatus status2) = book.getOrder(orderId);
        assertEq(amountFilled2, 10 ether);
        assertEq(uint8(status2), uint8(LimitOrderBook.OrderStatus.Filled));
    }

    function test_fillOrder_revert_expired() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 1 ether);
        uint256 orderId = book.placeOrder(
            address(tokenA), address(tokenB), 1 ether, 1900e18,
            block.timestamp + 1 hours
        );
        vm.stopPrank();

        // Warp past expiry
        vm.warp(block.timestamp + 2 hours);

        // Fill attempt on expired order — should NOT revert, but mark expired & refund
        vm.prank(keeper);
        book.fillOrder(orderId, 1 ether);

        // Verify order was marked expired and tokens refunded
        (,,,,,,, LimitOrderBook.OrderStatus status) = book.getOrder(orderId);
        assertEq(uint8(status), uint8(LimitOrderBook.OrderStatus.Expired));
        assertEq(tokenA.balanceOf(alice), 100 ether); // Full refund
    }

    function test_fillOrder_revert_cancelled() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 1 ether);
        uint256 orderId = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 1900e18, 0);
        book.cancelOrder(orderId);
        vm.stopPrank();

        vm.prank(keeper);
        vm.expectRevert(LimitOrderBook.OrderNotActive.selector);
        book.fillOrder(orderId, 1 ether);
    }

    function test_fillOrder_keeperFee() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 1 ether);
        uint256 orderId = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 1800e18, 0);
        vm.stopPrank();

        vm.prank(keeper);
        book.fillOrder(orderId, 1 ether);

        uint256 keeperBal = tokenB.balanceOf(keeper);
        // Keeper should get 0.05% of output
        assertTrue(keeperBal > 0);
        // With ~1990 USDC output, keeper should get ~1 USDC
        assertTrue(keeperBal < 2 ether); // Sanity check
    }

    // ═══════════════════════════════════════════════════════════════════
    // Batch Fill Tests
    // ═══════════════════════════════════════════════════════════════════

    function test_batchFill() public {
        // Place 2 orders
        vm.startPrank(alice);
        tokenA.approve(address(book), 2 ether);
        uint256 id0 = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 1800e18, 0);
        uint256 id1 = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 1800e18, 0);
        vm.stopPrank();

        uint256[] memory ids = new uint256[](2);
        ids[0] = id0;
        ids[1] = id1;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1 ether;

        vm.prank(keeper);
        book.batchFill(ids, amounts);

        (,,,,,,, LimitOrderBook.OrderStatus s0) = book.getOrder(id0);
        (,,,,,,, LimitOrderBook.OrderStatus s1) = book.getOrder(id1);
        assertEq(uint8(s0), uint8(LimitOrderBook.OrderStatus.Filled));
        assertEq(uint8(s1), uint8(LimitOrderBook.OrderStatus.Filled));
    }

    function test_batchFill_skipsFailed() public {
        // Place 2 orders: one fillable, one with impossible price
        vm.startPrank(alice);
        tokenA.approve(address(book), 2 ether);
        uint256 idGood = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 1800e18, 0);
        uint256 idBad = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 999_999e18, 0); // Impossible price
        vm.stopPrank();

        uint256[] memory ids = new uint256[](2);
        ids[0] = idGood;
        ids[1] = idBad;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1 ether;

        vm.prank(keeper);
        book.batchFill(ids, amounts);

        // Good order filled, bad order still active
        (,,,,,,, LimitOrderBook.OrderStatus sGood) = book.getOrder(idGood);
        (,,,,,,, LimitOrderBook.OrderStatus sBad) = book.getOrder(idBad);
        assertEq(uint8(sGood), uint8(LimitOrderBook.OrderStatus.Filled));
        assertEq(uint8(sBad), uint8(LimitOrderBook.OrderStatus.Active));
    }

    // ═══════════════════════════════════════════════════════════════════
    // View Function Tests
    // ═══════════════════════════════════════════════════════════════════

    function test_getUserOrders() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 30 ether);
        book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2000e18, 0);
        book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2100e18, 0);
        book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2200e18, 0);
        vm.stopPrank();

        uint256[] memory ids = book.getUserOrders(alice);
        assertEq(ids.length, 3);
    }

    function test_getActiveOrders() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 30 ether);
        book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2000e18, 0);
        uint256 id1 = book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2100e18, 0);
        book.placeOrder(address(tokenA), address(tokenB), 10 ether, 2200e18, 0);
        book.cancelOrder(id1);
        vm.stopPrank();

        uint256[] memory activeIds = book.getActiveOrders(alice);
        assertEq(activeIds.length, 2);
    }

    function test_isFillable() public {
        // Order at 1800 USDC/WETH should be fillable (pool is ~2000)
        vm.startPrank(alice);
        tokenA.approve(address(book), 1 ether);
        uint256 fillableId = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 1800e18, 0);
        vm.stopPrank();

        assertTrue(book.isFillable(fillableId));

        // Order at 999999 USDC/WETH should NOT be fillable
        vm.startPrank(bob);
        tokenA.approve(address(book), 1 ether);
        uint256 unfillableId = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 999_999e18, 0);
        vm.stopPrank();

        assertFalse(book.isFillable(unfillableId));
    }

    function test_isFillable_expired() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 1 ether);
        uint256 orderId = book.placeOrder(
            address(tokenA), address(tokenB), 1 ether, 1800e18,
            block.timestamp + 1 hours
        );
        vm.stopPrank();

        assertTrue(book.isFillable(orderId));

        vm.warp(block.timestamp + 2 hours);
        assertFalse(book.isFillable(orderId));
    }

    // ═══════════════════════════════════════════════════════════════════
    // Admin Tests
    // ═══════════════════════════════════════════════════════════════════

    function test_setKeeperFeeBps() public {
        vm.prank(admin);
        book.setKeeperFeeBps(10); // 0.1%
        assertEq(book.keeperFeeBps(), 10);
    }

    function test_setKeeperFeeBps_revert_tooHigh() public {
        vm.prank(admin);
        vm.expectRevert(LimitOrderBook.InvalidFee.selector);
        book.setKeeperFeeBps(101); // >1%
    }

    function test_setKeeperFeeBps_revert_notOwner() public {
        vm.prank(alice);
        vm.expectRevert(LimitOrderBook.NotOwner.selector);
        book.setKeeperFeeBps(10);
    }

    function test_setRouter() public {
        vm.prank(admin);
        book.setRouter(address(0x123));
        assertEq(book.router(), address(0x123));
    }

    function test_transferOwnership() public {
        vm.prank(admin);
        book.transferOwnership(alice);
        assertEq(book.owner(), alice);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Buy-side Order Tests
    // ═══════════════════════════════════════════════════════════════════

    function test_fillOrder_buySide() public {
        // Bob places buy order: sell 2000 USDC, want at least 0.0005 WETH per USDC
        // (i.e., want WETH at ~2000 USDC price)
        vm.startPrank(bob);
        tokenB.approve(address(book), 2000 ether);
        uint256 orderId = book.placeOrder(
            address(tokenB),  // selling USDC
            address(tokenA),  // buying WETH
            2000 ether,       // 2000 USDC
            0.0004e18,        // Want at least 0.0004 WETH per USDC (~2500 USDC/WETH max price)
            0
        );
        vm.stopPrank();

        uint256 bobWethBefore = tokenA.balanceOf(bob);

        vm.prank(keeper);
        book.fillOrder(orderId, 2000 ether);

        uint256 bobWethAfter = tokenA.balanceOf(bob);
        assertTrue(bobWethAfter > bobWethBefore); // Bob got WETH

        (,,,,,,, LimitOrderBook.OrderStatus status) = book.getOrder(orderId);
        assertEq(uint8(status), uint8(LimitOrderBook.OrderStatus.Filled));
    }

    // ═══════════════════════════════════════════════════════════════════
    // Edge Cases
    // ═══════════════════════════════════════════════════════════════════

    function test_fillOrder_fillMoreThanRemaining() public {
        vm.startPrank(alice);
        tokenA.approve(address(book), 1 ether);
        uint256 orderId = book.placeOrder(address(tokenA), address(tokenB), 1 ether, 1800e18, 0);
        vm.stopPrank();

        // Try to fill 10 ETH but only 1 ETH remains — should clamp
        vm.prank(keeper);
        book.fillOrder(orderId, 10 ether);

        (,,,, uint256 amountFilled,,, LimitOrderBook.OrderStatus status) = book.getOrder(orderId);
        assertEq(amountFilled, 1 ether);
        assertEq(uint8(status), uint8(LimitOrderBook.OrderStatus.Filled));
    }

    function test_constructor_revert_zeroAddress() public {
        vm.expectRevert(LimitOrderBook.ZeroAddress.selector);
        new LimitOrderBook(address(0), admin);

        vm.expectRevert(LimitOrderBook.ZeroAddress.selector);
        new LimitOrderBook(address(router), address(0));
    }
}
