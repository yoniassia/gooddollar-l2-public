// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/swap/LiFiBridgeAggregator.sol";

// Minimal ERC20 for testing
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract LiFiBridgeAggregatorTest is Test {
    LiFiBridgeAggregator agg;
    MockERC20 usdc;
    MockERC20 gdollar;

    address admin = address(0xAD);
    address keeper = address(0xBE);
    address user = address(0xCA);
    address ubiFee = address(0xFE);

    function setUp() public {
        vm.prank(admin);
        agg = new LiFiBridgeAggregator(admin, ubiFee);

        usdc = new MockERC20("USDC", "USDC");
        gdollar = new MockERC20("GoodDollar", "G$");

        vm.startPrank(admin);
        agg.setKeeper(keeper, true);
        agg.setWhitelistedToken(address(usdc), true);
        agg.setWhitelistedToken(address(gdollar), true);
        vm.stopPrank();

        // Fund user
        usdc.mint(user, 10_000e18);
        gdollar.mint(user, 100_000e18);
    }

    function test_initiateSwap() public {
        vm.startPrank(user);
        usdc.approve(address(agg), 1000e18);
        uint256 swapId = agg.initiateSwap(
            address(usdc), 1000e18,
            1, // Ethereum mainnet
            address(0x1234), // dest token
            user, // dest receiver
            990e18, // min dest amount
            block.timestamp + 3600 // 1h deadline
        );
        vm.stopPrank();

        assertEq(swapId, 0);

        // Check UBI fee was taken (0.1% = 1e18)
        uint256 fee = (1000e18 * 10) / 10_000;
        assertEq(usdc.balanceOf(ubiFee), fee);

        // Check net amount escrowed
        uint256 netAmount = 1000e18 - fee;
        assertEq(usdc.balanceOf(address(agg)), netAmount);
    }

    function test_completeSwap() public {
        // Setup swap
        vm.startPrank(user);
        usdc.approve(address(agg), 1000e18);
        uint256 swapId = agg.initiateSwap(
            address(usdc), 1000e18, 1,
            address(0x1234), user, 990e18,
            block.timestamp + 3600
        );
        vm.stopPrank();

        // Complete
        vm.prank(keeper);
        agg.completeSwap(swapId, bytes32(uint256(0xABCD)), 995e18);

        LiFiBridgeAggregator.SwapRequest memory s = agg.getSwap(swapId);
        assertEq(uint256(s.status), uint256(LiFiBridgeAggregator.SwapStatus.Completed));
    }

    function test_refundSwap() public {
        vm.startPrank(user);
        usdc.approve(address(agg), 1000e18);
        uint256 swapId = agg.initiateSwap(
            address(usdc), 1000e18, 1,
            address(0x1234), user, 990e18,
            block.timestamp + 3600
        );
        vm.stopPrank();

        uint256 userBalBefore = usdc.balanceOf(user);

        vm.prank(keeper);
        agg.refundSwap(swapId, "Bridge timeout");

        // User gets escrowed amount back
        uint256 fee = (1000e18 * 10) / 10_000;
        assertEq(usdc.balanceOf(user), userBalBefore + (1000e18 - fee));
    }

    function test_expireSwap() public {
        vm.startPrank(user);
        usdc.approve(address(agg), 1000e18);
        uint256 swapId = agg.initiateSwap(
            address(usdc), 1000e18, 1,
            address(0x1234), user, 990e18,
            block.timestamp + 100
        );
        vm.stopPrank();

        // Warp past deadline
        vm.warp(block.timestamp + 101);

        uint256 userBalBefore = usdc.balanceOf(user);
        agg.expireSwap(swapId);

        uint256 fee = (1000e18 * 10) / 10_000;
        assertEq(usdc.balanceOf(user), userBalBefore + (1000e18 - fee));

        LiFiBridgeAggregator.SwapRequest memory s = agg.getSwap(swapId);
        assertEq(uint256(s.status), uint256(LiFiBridgeAggregator.SwapStatus.Expired));
    }

    function test_expireSwap_beforeDeadline_reverts() public {
        vm.startPrank(user);
        usdc.approve(address(agg), 1000e18);
        uint256 swapId = agg.initiateSwap(
            address(usdc), 1000e18, 1,
            address(0x1234), user, 990e18,
            block.timestamp + 3600
        );
        vm.stopPrank();

        vm.expectRevert();
        agg.expireSwap(swapId);
    }

    function test_initiateSwapETH() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        uint256 swapId = agg.initiateSwapETH{value: 1 ether}(
            137, // Polygon
            address(0x5678),
            user,
            0.99 ether,
            block.timestamp + 3600
        );

        assertEq(swapId, 0);
        uint256 fee = (1 ether * 10) / 10_000;
        assertEq(ubiFee.balance, fee);
        assertEq(address(agg).balance, 1 ether - fee);
    }

    function test_unsupportedChain_reverts() public {
        vm.startPrank(user);
        usdc.approve(address(agg), 1000e18);
        vm.expectRevert();
        agg.initiateSwap(
            address(usdc), 1000e18, 999999, // unsupported chain
            address(0x1234), user, 990e18,
            block.timestamp + 3600
        );
        vm.stopPrank();
    }

    function test_unwhitelistedToken_reverts() public {
        MockERC20 rando = new MockERC20("Random", "RND");
        rando.mint(user, 1000e18);

        vm.startPrank(user);
        rando.approve(address(agg), 1000e18);
        vm.expectRevert();
        agg.initiateSwap(
            address(rando), 1000e18, 1,
            address(0x1234), user, 990e18,
            block.timestamp + 3600
        );
        vm.stopPrank();
    }

    function test_getUserSwaps() public {
        vm.startPrank(user);
        usdc.approve(address(agg), 3000e18);
        agg.initiateSwap(address(usdc), 1000e18, 1, address(0x1234), user, 990e18, block.timestamp + 3600);
        agg.initiateSwap(address(usdc), 1000e18, 10, address(0x5678), user, 990e18, block.timestamp + 3600);
        vm.stopPrank();

        uint256[] memory swapIds = agg.getUserSwaps(user);
        assertEq(swapIds.length, 2);
        assertEq(swapIds[0], 0);
        assertEq(swapIds[1], 1);
    }

    function test_doubleComplete_reverts() public {
        vm.startPrank(user);
        usdc.approve(address(agg), 1000e18);
        uint256 swapId = agg.initiateSwap(
            address(usdc), 1000e18, 1,
            address(0x1234), user, 990e18,
            block.timestamp + 3600
        );
        vm.stopPrank();

        vm.prank(keeper);
        agg.completeSwap(swapId, bytes32(uint256(0xABCD)), 995e18);

        vm.prank(keeper);
        vm.expectRevert();
        agg.completeSwap(swapId, bytes32(uint256(0xDEAD)), 995e18);
    }

    function test_notKeeper_reverts() public {
        vm.startPrank(user);
        usdc.approve(address(agg), 1000e18);
        uint256 swapId = agg.initiateSwap(
            address(usdc), 1000e18, 1,
            address(0x1234), user, 990e18,
            block.timestamp + 3600
        );
        vm.stopPrank();

        vm.prank(address(0xDEAD));
        vm.expectRevert();
        agg.completeSwap(swapId, bytes32(uint256(0xABCD)), 995e18);
    }
}
