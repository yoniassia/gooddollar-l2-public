// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/bridge/FastWithdrawalLP.sol";

/// @dev Minimal ERC20 for testing
contract MockToken {
    string public name = "Mock";
    string public symbol = "MCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Allowance");
        require(balanceOf[from] >= amount, "Insufficient");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @dev Receives ETH (for UBI pool)
contract ETHReceiver {
    receive() external payable {}
}

contract FastWithdrawalLPTest is Test {
    FastWithdrawalLP public lp;
    MockToken public token;
    ETHReceiver public ubiPool;

    address admin = address(0xAD);
    address lpProvider = address(0xBEEF);
    address user = address(0xCAFE);

    uint256 constant FEE_BPS = 10; // 0.1%

    function setUp() public {
        ubiPool = new ETHReceiver();
        lp = new FastWithdrawalLP(admin, address(ubiPool), FEE_BPS);
        token = new MockToken();

        // Fund LP provider
        token.mint(lpProvider, 1_000_000e18);
        vm.prank(lpProvider);
        token.approve(address(lp), type(uint256).max);

        // Fund LP with ETH
        vm.deal(lpProvider, 100 ether);
    }

    // ── Constructor ──

    function test_constructor() public view {
        assertEq(lp.admin(), admin);
        assertEq(lp.ubiPool(), address(ubiPool));
        assertEq(lp.feeBps(), FEE_BPS);
    }

    function test_constructor_revertsZeroAdmin() public {
        vm.expectRevert(FastWithdrawalLP.ZeroAddress.selector);
        new FastWithdrawalLP(address(0), address(ubiPool), FEE_BPS);
    }

    function test_constructor_revertsExcessiveFee() public {
        vm.expectRevert(FastWithdrawalLP.InvalidFeeBps.selector);
        new FastWithdrawalLP(admin, address(ubiPool), 501);
    }

    // ── ERC20 Liquidity ──

    function test_depositLiquidity() public {
        vm.prank(lpProvider);
        lp.depositLiquidity(address(token), 1000e18);

        assertEq(lp.lpBalance(lpProvider, address(token)), 1000e18);
        assertEq(lp.totalLiquidity(address(token)), 1000e18);
        assertEq(token.balanceOf(address(lp)), 1000e18);
    }

    function test_depositLiquidity_revertsZero() public {
        vm.prank(lpProvider);
        vm.expectRevert(FastWithdrawalLP.ZeroAmount.selector);
        lp.depositLiquidity(address(token), 0);
    }

    function test_withdrawLiquidity() public {
        vm.prank(lpProvider);
        lp.depositLiquidity(address(token), 1000e18);

        uint256 before = token.balanceOf(lpProvider);
        vm.prank(lpProvider);
        lp.withdrawLiquidity(address(token), 500e18);

        assertEq(lp.lpBalance(lpProvider, address(token)), 500e18);
        assertEq(token.balanceOf(lpProvider), before + 500e18);
    }

    function test_withdrawLiquidity_revertsInsufficient() public {
        vm.prank(lpProvider);
        vm.expectRevert(FastWithdrawalLP.InsufficientLPBalance.selector);
        lp.withdrawLiquidity(address(token), 1e18);
    }

    // ── ETH Liquidity ──

    function test_depositETHLiquidity() public {
        vm.prank(lpProvider);
        lp.depositETHLiquidity{value: 10 ether}();

        assertEq(lp.lpETHBalance(lpProvider), 10 ether);
        assertEq(lp.totalETHLiquidity(), 10 ether);
    }

    function test_withdrawETHLiquidity() public {
        vm.prank(lpProvider);
        lp.depositETHLiquidity{value: 10 ether}();

        uint256 before = lpProvider.balance;
        vm.prank(lpProvider);
        lp.withdrawETHLiquidity(5 ether);

        assertEq(lp.lpETHBalance(lpProvider), 5 ether);
        assertEq(lpProvider.balance, before + 5 ether);
    }

    // ── Fast ERC20 Claim ──

    function test_claimFastWithdrawal() public {
        // LP deposits liquidity
        vm.prank(lpProvider);
        lp.depositLiquidity(address(token), 100_000e18);

        bytes32 hash = keccak256("withdrawal-1");
        uint256 amount = 10_000e18;

        uint256 fee = (amount * FEE_BPS) / 10000; // 10e18
        uint256 ubiFee = (fee * 3333) / 10000;     // ~3.333e18
        uint256 netAmount = amount - fee;           // 9990e18

        uint256 userBefore = token.balanceOf(user);
        uint256 ubiBefore = token.balanceOf(address(ubiPool));

        // LP provider is also the claimer (self-service)
        vm.prank(lpProvider);
        lp.claimFastWithdrawal(address(token), amount, user, hash);

        assertEq(token.balanceOf(user), userBefore + netAmount);
        assertEq(token.balanceOf(address(ubiPool)), ubiBefore + ubiFee);
        assertTrue(lp.claimed(hash));

        (address claimLp, address claimToken, uint256 claimAmount, bool settled) = lp.claims(hash);
        assertEq(claimLp, lpProvider);
        assertEq(claimToken, address(token));
        assertEq(claimAmount, amount);
        assertFalse(settled);
    }

    function test_claimFastWithdrawal_revertsDoubleClaim() public {
        vm.prank(lpProvider);
        lp.depositLiquidity(address(token), 100_000e18);

        bytes32 hash = keccak256("withdrawal-dup");
        vm.prank(lpProvider);
        lp.claimFastWithdrawal(address(token), 1000e18, user, hash);

        vm.prank(lpProvider);
        vm.expectRevert(FastWithdrawalLP.AlreadyClaimed.selector);
        lp.claimFastWithdrawal(address(token), 1000e18, user, hash);
    }

    function test_claimFastWithdrawal_revertsNoLiquidity() public {
        bytes32 hash = keccak256("withdrawal-no-liq");
        vm.prank(lpProvider);
        vm.expectRevert(FastWithdrawalLP.NoLiquidityAvailable.selector);
        lp.claimFastWithdrawal(address(token), 1000e18, user, hash);
    }

    // ── Fast ETH Claim ──

    function test_claimFastETHWithdrawal() public {
        vm.prank(lpProvider);
        lp.depositETHLiquidity{value: 50 ether}();

        bytes32 hash = keccak256("eth-withdrawal-1");
        uint256 amount = 10 ether;
        uint256 fee = (amount * FEE_BPS) / 10000;
        uint256 ubiFee = (fee * 3333) / 10000;
        uint256 netAmount = amount - fee;

        uint256 userBefore = user.balance;
        uint256 ubiBefore = address(ubiPool).balance;

        vm.prank(lpProvider);
        lp.claimFastETHWithdrawal(amount, user, hash);

        assertEq(user.balance, userBefore + netAmount);
        assertEq(address(ubiPool).balance, ubiBefore + ubiFee);
        assertTrue(lp.claimed(hash));
    }

    // ── Settlement ──

    function test_settleWithdrawal_ERC20() public {
        vm.prank(lpProvider);
        lp.depositLiquidity(address(token), 100_000e18);

        bytes32 hash = keccak256("settle-1");
        uint256 amount = 10_000e18;

        vm.prank(lpProvider);
        lp.claimFastWithdrawal(address(token), amount, user, hash);

        uint256 lpBalBefore = lp.lpBalance(lpProvider, address(token));

        // Simulate bridge finalization: LP receives tokens from bridge
        token.mint(lpProvider, amount);
        vm.prank(lpProvider);
        token.approve(address(lp), amount);

        vm.prank(lpProvider);
        lp.settleWithdrawal(hash, amount);

        (,,,bool settled) = lp.claims(hash);
        assertTrue(settled);
        assertEq(lp.lpBalance(lpProvider, address(token)), lpBalBefore + amount);
    }

    function test_settleWithdrawal_revertsDouble() public {
        vm.prank(lpProvider);
        lp.depositLiquidity(address(token), 100_000e18);

        bytes32 hash = keccak256("settle-dup");
        vm.prank(lpProvider);
        lp.claimFastWithdrawal(address(token), 1000e18, user, hash);

        token.mint(lpProvider, 1000e18);
        vm.prank(lpProvider);
        token.approve(address(lp), 1000e18);
        vm.prank(lpProvider);
        lp.settleWithdrawal(hash, 1000e18);

        vm.prank(lpProvider);
        vm.expectRevert(FastWithdrawalLP.AlreadySettled.selector);
        lp.settleWithdrawal(hash, 1000e18);
    }

    function test_settleETHWithdrawal() public {
        vm.prank(lpProvider);
        lp.depositETHLiquidity{value: 50 ether}();

        bytes32 hash = keccak256("eth-settle-1");
        vm.prank(lpProvider);
        lp.claimFastETHWithdrawal(10 ether, user, hash);

        uint256 lpEthBefore = lp.lpETHBalance(lpProvider);

        // LP settles with ETH from bridge finalization
        vm.prank(lpProvider);
        lp.settleETHWithdrawal{value: 10 ether}(hash);

        (,,,bool settled) = lp.claims(hash);
        assertTrue(settled);
        assertEq(lp.lpETHBalance(lpProvider), lpEthBefore + 10 ether);
    }

    // ── Admin ──

    function test_setFeeBps() public {
        vm.prank(admin);
        lp.setFeeBps(50);
        assertEq(lp.feeBps(), 50);
    }

    function test_setFeeBps_revertsExcessive() public {
        vm.prank(admin);
        vm.expectRevert(FastWithdrawalLP.InvalidFeeBps.selector);
        lp.setFeeBps(501);
    }

    function test_setFeeBps_revertsNotAdmin() public {
        vm.prank(user);
        vm.expectRevert(FastWithdrawalLP.NotAdmin.selector);
        lp.setFeeBps(20);
    }

    // ── Full Round Trip ──

    function test_fullRoundTrip_ERC20() public {
        // 1. LP deposits
        vm.prank(lpProvider);
        lp.depositLiquidity(address(token), 100_000e18);

        // 2. User fast-claims
        bytes32 hash = keccak256("roundtrip-1");
        uint256 amount = 5000e18;
        uint256 fee = (amount * FEE_BPS) / 10000;
        uint256 netAmount = amount - fee;

        uint256 userBefore = token.balanceOf(user);
        vm.prank(lpProvider);
        lp.claimFastWithdrawal(address(token), amount, user, hash);
        assertEq(token.balanceOf(user), userBefore + netAmount);

        // 3. After 7 days, bridge releases tokens to LP. LP settles.
        token.mint(lpProvider, amount);
        vm.prank(lpProvider);
        token.approve(address(lp), amount);
        vm.prank(lpProvider);
        lp.settleWithdrawal(hash, amount);

        // 4. LP can withdraw all liquidity (original + fee earned)
        uint256 lpBal = lp.lpBalance(lpProvider, address(token));
        assertTrue(lpBal > 0);
        vm.prank(lpProvider);
        lp.withdrawLiquidity(address(token), lpBal);
        assertEq(lp.lpBalance(lpProvider, address(token)), 0);
    }

    // ── Gas Benchmarks ──

    function test_gasBenchmark_claimFastWithdrawal() public {
        vm.prank(lpProvider);
        lp.depositLiquidity(address(token), 100_000e18);

        bytes32 hash = keccak256("gas-1");
        vm.prank(lpProvider);
        uint256 gasBefore = gasleft();
        lp.claimFastWithdrawal(address(token), 1000e18, user, hash);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("claimFastWithdrawal gas", gasUsed);
        assertLt(gasUsed, 200_000);
    }
}
