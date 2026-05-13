// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/lending/GoodLendPool.sol";
import "../src/lending/GoodLendToken.sol";
import "../src/lending/DebtToken.sol";
import "../src/lending/InterestRateModel.sol";
import "../src/lending/SimplePriceOracle.sol";
import "../src/GoodDollarToken.sol";

/// @dev Simple ERC20 mock for USDC (6 decimals) and WETH (18 decimals)
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= amount, "allowance");
            allowance[from][msg.sender] = a - amount;
        }
        require(balanceOf[from] >= amount, "insufficient");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

/// @dev Simple flash loan receiver for testing
contract MockFlashLoanReceiver is IFlashLoanReceiver {
    bool public shouldRepay = true;

    function setShouldRepay(bool _val) external {
        shouldRepay = _val;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address,
        bytes calldata
    ) external override returns (bool) {
        if (!shouldRepay) return false;
        // Approve pool (caller) to pull amount + premium
        // The gToken holds the funds, but pool calls transferFrom(receiver, gToken, ...)
        // We need to approve the pool
        MockERC20(asset).approve(msg.sender, amount + premium);
        return true;
    }
}

contract GoodLendTest is Test {
    uint256 constant RAY = 1e27;

    GoodLendPool pool;
    InterestRateModel rateModel;
    SimplePriceOracle oracle;

    MockERC20 usdc;
    MockERC20 weth;

    GoodLendToken gUSDC;
    GoodLendToken gWETH;
    DebtToken dUSDC;
    DebtToken dWETH;

    address admin = address(this);
    address treasury = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        // Deploy tokens
        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);

        // Deploy oracle
        oracle = new SimplePriceOracle(admin);
        oracle.setAssetPrice(address(usdc), 1e8);        // $1
        oracle.setAssetPrice(address(weth), 2000e8);      // $2000

        // Deploy rate model
        rateModel = new InterestRateModel(admin);
        // USDC: 80% optimal, 0% base, 4% slope1, 60% slope2
        rateModel.setRateParams(
            address(usdc),
            0.80e27,  // 80% optimal
            0,        // 0% base
            0.04e27,  // 4% slope1
            0.60e27   // 60% slope2
        );
        // WETH: 80% optimal, 1% base, 3.8% slope1, 80% slope2
        rateModel.setRateParams(
            address(weth),
            0.80e27,
            0.01e27,
            0.038e27,
            0.80e27
        );

        // Deploy pool
        pool = new GoodLendPool(address(oracle), address(rateModel), treasury, admin);

        // Deploy gTokens and debt tokens
        gUSDC = new GoodLendToken(address(pool), address(usdc), "GoodLend USDC", "gUSDC");
        gWETH = new GoodLendToken(address(pool), address(weth), "GoodLend WETH", "gWETH");
        dUSDC = new DebtToken(address(pool), address(usdc), "GoodLend Debt USDC", "dUSDC");
        dWETH = new DebtToken(address(pool), address(weth), "GoodLend Debt WETH", "dWETH");

        // Initialize reserves
        // USDC: 80% LTV, 85% liquidation threshold, 5% bonus, 20% reserve factor
        pool.initReserve(
            address(usdc),
            address(gUSDC),
            address(dUSDC),
            2000,   // 20% reserve factor
            8000,   // 80% LTV
            8500,   // 85% liquidation threshold
            10500,  // 5% liquidation bonus
            1_000_000,  // 1M supply cap
            800_000,    // 800K borrow cap
            6       // decimals
        );

        // WETH: 75% LTV, 82% liquidation threshold, 5% bonus, 20% reserve factor
        pool.initReserve(
            address(weth),
            address(gWETH),
            address(dWETH),
            2000,   // 20% reserve factor
            7500,   // 75% LTV
            8200,   // 82% liquidation threshold
            10500,  // 5% liquidation bonus
            500,    // 500 ETH supply cap
            300,    // 300 ETH borrow cap
            18      // decimals
        );

        // Fund Alice and Bob
        usdc.mint(alice, 100_000e6);   // 100K USDC
        weth.mint(alice, 50e18);       // 50 ETH
        usdc.mint(bob, 100_000e6);
        weth.mint(bob, 50e18);

        // Approve pool for Alice
        vm.startPrank(alice);
        usdc.approve(address(pool), type(uint256).max);
        weth.approve(address(pool), type(uint256).max);
        vm.stopPrank();

        // Approve pool for Bob
        vm.startPrank(bob);
        usdc.approve(address(pool), type(uint256).max);
        weth.approve(address(pool), type(uint256).max);
        vm.stopPrank();

        // gToken contracts need to approve pool to transfer underlying out
        // (In production, gTokens would hold funds and pool would call transferFrom)
        // We need the gToken to approve the pool
        vm.prank(address(gUSDC));
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(address(gWETH));
        weth.approve(address(pool), type(uint256).max);
    }

    // ============ Supply Tests ============

    function test_supply_basic() public {
        vm.prank(alice);
        pool.supply(address(usdc), 10_000e6);

        // Check gToken balance
        assertEq(gUSDC.balanceOf(alice), 10_000e6);
        assertEq(gUSDC.scaledBalanceOf(alice), 10_000e6); // index is 1.0 initially

        // Check underlying moved to gToken contract
        assertEq(usdc.balanceOf(address(gUSDC)), 10_000e6);
    }

    function test_supply_multiple_users() public {
        vm.prank(alice);
        pool.supply(address(usdc), 10_000e6);

        vm.prank(bob);
        pool.supply(address(usdc), 20_000e6);

        assertEq(gUSDC.balanceOf(alice), 10_000e6);
        assertEq(gUSDC.balanceOf(bob), 20_000e6);
        assertEq(usdc.balanceOf(address(gUSDC)), 30_000e6);
    }

    function test_supply_weth() public {
        vm.prank(alice);
        pool.supply(address(weth), 10e18);

        assertEq(gWETH.balanceOf(alice), 10e18);
    }

    // ============ Withdraw Tests ============

    function test_withdraw_basic() public {
        vm.startPrank(alice);
        pool.supply(address(usdc), 10_000e6);
        pool.withdraw(address(usdc), 5_000e6);
        vm.stopPrank();

        assertEq(gUSDC.balanceOf(alice), 5_000e6);
        assertEq(usdc.balanceOf(alice), 95_000e6); // 100K - 10K + 5K
    }

    function test_withdraw_max() public {
        vm.startPrank(alice);
        pool.supply(address(usdc), 10_000e6);
        pool.withdraw(address(usdc), type(uint256).max);
        vm.stopPrank();

        assertEq(gUSDC.balanceOf(alice), 0);
        assertEq(usdc.balanceOf(alice), 100_000e6);
    }

    // ============ Borrow Tests ============

    function test_borrow_basic() public {
        // Alice supplies WETH as collateral
        vm.prank(alice);
        pool.supply(address(weth), 10e18); // $20,000 worth

        // Bob supplies USDC for lending
        vm.prank(bob);
        pool.supply(address(usdc), 50_000e6);

        // Alice borrows USDC against her ETH collateral
        vm.prank(alice);
        pool.borrow(address(usdc), 10_000e6); // $10,000 — well within 75% LTV of $20K

        assertEq(usdc.balanceOf(alice), 110_000e6); // 100K + 10K borrowed
        assertEq(dUSDC.balanceOf(alice), 10_000e6);

        // Check health factor
        (uint256 hf, uint256 collateral, uint256 debt) = pool.getUserAccountData(alice);
        assertGt(hf, RAY); // Should be healthy
        assertEq(collateral, 20_000e8); // 10 ETH * $2000
        assertEq(debt, 10_000e8);       // $10K
    }

    function test_borrow_revert_undercollateralized() public {
        // Alice supplies WETH
        vm.prank(alice);
        pool.supply(address(weth), 1e18); // $2,000 worth, LTV 75% = max borrow $1,500

        // Bob supplies USDC
        vm.prank(bob);
        pool.supply(address(usdc), 50_000e6);

        // Alice tries to borrow more than LTV allows
        vm.prank(alice);
        vm.expectRevert("GoodLendPool: undercollateralized");
        pool.borrow(address(usdc), 2_000e6); // $2K > $1.5K max
    }

    // ============ Repay Tests ============

    function test_repay_basic() public {
        // Setup: Alice borrows
        vm.prank(alice);
        pool.supply(address(weth), 10e18);
        vm.prank(bob);
        pool.supply(address(usdc), 50_000e6);
        vm.prank(alice);
        pool.borrow(address(usdc), 10_000e6);

        // Repay half
        vm.prank(alice);
        pool.repay(address(usdc), 5_000e6);

        assertEq(dUSDC.balanceOf(alice), 5_000e6);
    }

    function test_repay_full() public {
        vm.prank(alice);
        pool.supply(address(weth), 10e18);
        vm.prank(bob);
        pool.supply(address(usdc), 50_000e6);
        vm.prank(alice);
        pool.borrow(address(usdc), 10_000e6);

        // Repay everything
        vm.prank(alice);
        pool.repay(address(usdc), type(uint256).max);

        assertEq(dUSDC.balanceOf(alice), 0);
    }

    // ============ Interest Accrual Tests ============

    function test_interest_accrues_over_time() public {
        // Alice supplies, Bob borrows
        vm.prank(alice);
        pool.supply(address(usdc), 50_000e6);
        vm.prank(bob);
        pool.supply(address(weth), 50e18); // Collateral
        vm.prank(bob);
        pool.borrow(address(usdc), 20_000e6); // 40% utilization

        // Fast forward 1 year
        vm.warp(block.timestamp + 365 days);

        // Check that Alice's gToken balance grew (interest earned)
        uint256 aliceBalance = gUSDC.balanceOf(alice);
        assertGt(aliceBalance, 50_000e6, "Alice should have earned interest");

        // Check Bob's debt grew
        uint256 bobDebt = dUSDC.balanceOf(bob);
        assertGt(bobDebt, 20_000e6, "Bob's debt should have grown");
    }

    function test_treasury_accrues_revenue() public {
        vm.prank(alice);
        pool.supply(address(usdc), 50_000e6);
        vm.prank(bob);
        pool.supply(address(weth), 50e18);
        vm.prank(bob);
        pool.borrow(address(usdc), 20_000e6);

        // Fast forward 1 year
        vm.warp(block.timestamp + 365 days);

        // Trigger state update (any interaction)
        vm.prank(bob);
        pool.repay(address(usdc), 1e6); // Tiny repayment to trigger update

        // Check accrued treasury
        (,,,,,,uint256 accrued) = pool.getReserveData(address(usdc));
        assertGt(accrued, 0, "Treasury should have accrued revenue");

        // Mint to treasury
        address[] memory assets = new address[](1);
        assets[0] = address(usdc);
        pool.mintToTreasury(assets);

        // Treasury should now hold gUSDC tokens
        assertGt(gUSDC.balanceOf(treasury), 0, "Treasury should hold gUSDC");
    }

    // ============ Liquidation Tests ============

    function test_liquidation_basic() public {
        // Alice supplies ETH, borrows USDC close to limit
        vm.prank(alice);
        pool.supply(address(weth), 1e18); // $2,000
        vm.prank(bob);
        pool.supply(address(usdc), 50_000e6);

        // Alice borrows near max LTV ($2000 * 75% = $1500)
        vm.prank(alice);
        pool.borrow(address(usdc), 1_400e6); // $1,400

        // Verify healthy
        (uint256 hf,,) = pool.getUserAccountData(alice);
        assertGt(hf, RAY);

        // ETH price drops from $2000 to $1500 — Alice becomes undercollateralized
        // New collateral: $1500 * 82% threshold = $1230 < $1400 debt
        oracle.setAssetPrice(address(weth), 1500e8);

        // Verify unhealthy
        (hf,,) = pool.getUserAccountData(alice);
        assertLt(hf, RAY, "Should be liquidatable");

        // Bob liquidates Alice's position
        vm.prank(bob);
        pool.liquidate(address(weth), address(usdc), alice, 700e6); // Cover half debt

        // Alice's debt should have decreased
        uint256 aliceDebt = dUSDC.balanceOf(alice);
        assertLt(aliceDebt, 1_400e6, "Debt should decrease after liquidation");

        // Bob should have received ETH collateral
        uint256 bobWethBefore = 50e18; // initial
        assertGt(weth.balanceOf(bob), bobWethBefore, "Bob should have received collateral");
    }

    // ============ Flash Loan Tests ============

    function test_flashloan_basic() public {
        // Supply liquidity
        vm.prank(alice);
        pool.supply(address(usdc), 50_000e6);

        // Deploy flash loan receiver
        MockFlashLoanReceiver receiver = new MockFlashLoanReceiver();

        // Give receiver enough USDC to pay premium
        usdc.mint(address(receiver), 1_000e6); // Extra for premium

        // Execute flash loan
        pool.flashLoan(address(usdc), 10_000e6, address(receiver), "");

        // Check premium was paid (0.09% of 10K = 9 USDC)
        // gToken should have more than it started with
        assertGt(usdc.balanceOf(address(gUSDC)), 50_000e6, "Pool should have received premium");
    }

    function test_flashloan_callback_failure_reverts() public {
        vm.prank(alice);
        pool.supply(address(usdc), 50_000e6);

        MockFlashLoanReceiver receiver = new MockFlashLoanReceiver();
        receiver.setShouldRepay(false);
        usdc.mint(address(receiver), 1_000e6);

        vm.expectRevert("GoodLendPool: flash loan callback failed");
        pool.flashLoan(address(usdc), 10_000e6, address(receiver), "");
    }

    // ============ Health Factor Tests ============

    function test_health_factor_no_debt() public {
        vm.prank(alice);
        pool.supply(address(usdc), 10_000e6);

        (uint256 hf,,) = pool.getUserAccountData(alice);
        assertEq(hf, type(uint256).max, "No debt = infinite health");
    }

    function test_health_factor_multiple_collaterals() public {
        // Alice supplies both ETH and USDC
        vm.prank(alice);
        pool.supply(address(weth), 5e18);  // $10,000
        vm.prank(alice);
        pool.supply(address(usdc), 5_000e6); // $5,000

        // Bob supplies USDC for borrowing
        vm.prank(bob);
        pool.supply(address(usdc), 50_000e6);

        // Alice borrows USDC
        vm.prank(alice);
        pool.borrow(address(usdc), 8_000e6);

        (uint256 hf, uint256 collateral, uint256 debt) = pool.getUserAccountData(alice);
        assertEq(collateral, 15_000e8); // $10K + $5K
        assertEq(debt, 8_000e8);
        assertGt(hf, RAY, "Should be healthy");
    }

    // ============ Reserve Data Tests ============

    function test_reserve_data() public {
        vm.prank(alice);
        pool.supply(address(usdc), 50_000e6);

        (uint256 deposits, uint256 borrows,,,,,) = pool.getReserveData(address(usdc));
        assertEq(deposits, 50_000e6);
        assertEq(borrows, 0);
    }

    // ============ Admin Tests ============

    function test_cannot_borrow_inactive_reserve() public {
        pool.setReserveActive(address(usdc), false);
        vm.prank(alice);
        vm.expectRevert("GoodLendPool: reserve inactive");
        pool.supply(address(usdc), 1e6);
    }
}
