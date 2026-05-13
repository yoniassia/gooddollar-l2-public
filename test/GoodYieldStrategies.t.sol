// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/yield/strategies/LendingStrategy.sol";
import "../src/yield/strategies/StablecoinStrategy.sol";

// ─── Shared Mock ERC-20 ───────────────────────────────────────────────────────

contract MockToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name; symbol = _symbol;
    }
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount; totalSupply += amount;
    }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount; return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount; return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount; balanceOf[to] += amount; return true;
    }
}

// ─── LendingStrategy Mocks ────────────────────────────────────────────────────

contract MockGToken {
    mapping(address => uint256) public balanceOf;
    function setBalance(address who, uint256 amount) external { balanceOf[who] = amount; }
    function scaledBalanceOf(address who) external view returns (uint256) { return balanceOf[who]; }
}

contract MockLendPool {
    address public asset;
    MockToken public underlying;
    MockGToken public gToken;

    constructor(address _asset, address _gToken) {
        asset = _asset;
        underlying = MockToken(_asset);
        gToken = MockGToken(_gToken);
    }

    function supply(address, uint256 amount, address onBehalfOf) external {
        underlying.transferFrom(msg.sender, address(this), amount);
        gToken.setBalance(onBehalfOf, gToken.balanceOf(onBehalfOf) + amount);
    }

    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        uint256 current = gToken.balanceOf(msg.sender);
        if (amount > current) amount = current;
        gToken.setBalance(msg.sender, current - amount);
        underlying.transfer(to, amount);
        return amount;
    }

    /// @dev Simulate interest accrual by bumping gToken balance
    function simulateInterest(address holder, uint256 extra) external {
        gToken.setBalance(holder, gToken.balanceOf(holder) + extra);
        underlying.mint(address(this), extra); // back the extra
    }

    function getReserveData(address) external pure returns (
        uint256,uint256,uint256,uint256,uint256,uint256,address,address,address,uint256,bool,bool,uint256
    ) { return (0,0,0,0,0,0,address(0),address(0),address(0),0,true,false,0); }
}

// ─── StablecoinStrategy Mocks ─────────────────────────────────────────────────

contract MockStabilityPool {
    mapping(address => uint256) public deposits;
    mapping(address => uint256) public gains;
    MockToken public asset;
    MockToken public gainToken;

    constructor(address _asset, address _gainToken) {
        asset = MockToken(_asset);
        gainToken = MockToken(_gainToken);
    }

    function deposit(uint256 amount) external {
        asset.transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
    }

    function withdraw(uint256 amount) external {
        if (amount > deposits[msg.sender]) amount = deposits[msg.sender];
        deposits[msg.sender] -= amount;
        asset.transfer(msg.sender, amount);
    }

    function getDepositorBalance(address who) external view returns (uint256) {
        return deposits[who];
    }

    function getDepositorGain(address who) external view returns (uint256) {
        return gains[who];
    }

    function claimGains() external returns (uint256 gain) {
        gain = gains[msg.sender];
        gains[msg.sender] = 0;
        if (gain > 0 && gainToken.balanceOf(address(this)) >= gain) {
            gainToken.transfer(msg.sender, gain);
        }
    }

    /// @dev Simulate yield by adding to depositor balance
    function simulateYield(address who, uint256 extra) external {
        deposits[who] += extra;
        asset.mint(address(this), extra);
    }

    /// @dev Simulate liquidation gains
    function simulateLiquidationGain(address who, uint256 ethGain) external {
        gains[who] += ethGain;
        gainToken.mint(address(this), ethGain);
    }

    /// @dev Simulate a loss (e.g. bad debt)
    function simulateLoss(address who, uint256 lossAmount) external {
        if (lossAmount > deposits[who]) deposits[who] = 0;
        else deposits[who] -= lossAmount;
    }
}

// ─── LendingStrategy Tests ────────────────────────────────────────────────────

contract LendingStrategyTest is Test {
    MockToken     asset;
    MockGToken    gToken;
    MockLendPool  lendPool;
    LendingStrategy strategy;

    address vault = address(0xBEEF);

    function setUp() public {
        asset    = new MockToken("USDC", "USDC");
        gToken   = new MockGToken();
        lendPool = new MockLendPool(address(asset), address(gToken));
        strategy = new LendingStrategy(address(asset), address(lendPool), address(gToken), vault);

        // Fund vault with 10_000 tokens
        asset.mint(vault, 10_000 ether);
    }

    // ── deposit ────────────────────────────────────────────────────────────────

    function test_lending_deposit_happyPath() public {
        vm.startPrank(vault);
        asset.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        assertEq(strategy.totalDeposited(), 1_000 ether);
        assertEq(gToken.balanceOf(address(strategy)), 1_000 ether);
        assertEq(strategy.totalAssets(), 1_000 ether);
    }

    function test_lending_deposit_reverts_notVault() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(LendingStrategy.NotVault.selector);
        strategy.deposit(100 ether);
    }

    function test_lending_deposit_reverts_paused() public {
        // trigger emergencyWithdraw to set paused
        vm.prank(vault);
        strategy.emergencyWithdraw();

        vm.startPrank(vault);
        asset.approve(address(strategy), 100 ether);
        vm.expectRevert(LendingStrategy.IsPaused.selector);
        strategy.deposit(100 ether);
        vm.stopPrank();
    }

    // ── withdraw ───────────────────────────────────────────────────────────────

    function test_lending_withdraw_happyPath() public {
        // deposit first
        vm.startPrank(vault);
        asset.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);

        uint256 vaultBalBefore = asset.balanceOf(vault);
        strategy.withdraw(500 ether);
        vm.stopPrank();

        assertEq(asset.balanceOf(vault), vaultBalBefore + 500 ether);
        assertEq(strategy.totalDeposited(), 500 ether);
    }

    function test_lending_withdraw_cappedAtBalance() public {
        vm.startPrank(vault);
        asset.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);

        uint256 vaultBalBefore = asset.balanceOf(vault);
        uint256 withdrawn = strategy.withdraw(9_999 ether); // ask more than deposited
        vm.stopPrank();

        assertEq(withdrawn, 1_000 ether, "should cap at actual balance");
        assertEq(asset.balanceOf(vault), vaultBalBefore + 1_000 ether);
    }

    function test_lending_withdraw_reverts_notVault() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(LendingStrategy.NotVault.selector);
        strategy.withdraw(100 ether);
    }

    // ── harvest ────────────────────────────────────────────────────────────────

    function test_lending_harvest_withProfit() public {
        vm.startPrank(vault);
        asset.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        // Simulate 50 ether interest accrued
        lendPool.simulateInterest(address(strategy), 50 ether);

        vm.prank(vault);
        (uint256 profit, uint256 loss) = strategy.harvest();

        assertEq(profit, 50 ether);
        assertEq(loss, 0);
        assertEq(strategy.totalDeposited(), 1_050 ether, "baseline should reset");
    }

    function test_lending_harvest_noChange() public {
        vm.startPrank(vault);
        asset.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        vm.prank(vault);
        (uint256 profit, uint256 loss) = strategy.harvest();

        assertEq(profit, 0);
        assertEq(loss, 0);
    }

    function test_lending_harvest_reverts_notVault() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(LendingStrategy.NotVault.selector);
        strategy.harvest();
    }

    // ── emergencyWithdraw ──────────────────────────────────────────────────────

    function test_lending_emergencyWithdraw() public {
        vm.startPrank(vault);
        asset.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        uint256 vaultBalBefore = asset.balanceOf(vault);

        vm.prank(vault);
        uint256 withdrawn = strategy.emergencyWithdraw();

        assertEq(withdrawn, 1_000 ether);
        assertEq(asset.balanceOf(vault), vaultBalBefore + 1_000 ether);
        assertTrue(strategy.paused(), "should be paused after emergency");
        assertEq(strategy.totalDeposited(), 0);
    }

    function test_lending_emergencyWithdraw_emptyBalance() public {
        vm.prank(vault);
        uint256 withdrawn = strategy.emergencyWithdraw();

        assertEq(withdrawn, 0);
        assertTrue(strategy.paused());
    }

    function test_lending_emergencyWithdraw_reverts_notVault() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(LendingStrategy.NotVault.selector);
        strategy.emergencyWithdraw();
    }
}

// ─── StablecoinStrategy Tests ──────────────────────────────────────────────────

contract StablecoinStrategyTest is Test {
    MockToken         gUSD;
    MockToken         weth;
    MockStabilityPool stabilityPool;
    StablecoinStrategy strategy;

    address vault = address(0xBEEF);

    function setUp() public {
        gUSD         = new MockToken("gUSD", "gUSD");
        weth         = new MockToken("WETH", "WETH");
        stabilityPool = new MockStabilityPool(address(gUSD), address(weth));
        strategy      = new StablecoinStrategy(address(gUSD), address(stabilityPool), address(weth), vault);

        gUSD.mint(vault, 10_000 ether);
    }

    // ── deposit ────────────────────────────────────────────────────────────────

    function test_stable_deposit_happyPath() public {
        vm.startPrank(vault);
        gUSD.approve(address(strategy), 2_000 ether);
        strategy.deposit(2_000 ether);
        vm.stopPrank();

        assertEq(strategy.totalDeposited(), 2_000 ether);
        assertEq(strategy.totalAssets(), 2_000 ether);
    }

    function test_stable_deposit_reverts_notVault() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(StablecoinStrategy.NotVault.selector);
        strategy.deposit(100 ether);
    }

    function test_stable_deposit_reverts_paused() public {
        vm.prank(vault);
        strategy.emergencyWithdraw();

        vm.startPrank(vault);
        gUSD.approve(address(strategy), 100 ether);
        vm.expectRevert(StablecoinStrategy.IsPaused.selector);
        strategy.deposit(100 ether);
        vm.stopPrank();
    }

    // ── withdraw ───────────────────────────────────────────────────────────────

    function test_stable_withdraw_happyPath() public {
        vm.startPrank(vault);
        gUSD.approve(address(strategy), 2_000 ether);
        strategy.deposit(2_000 ether);

        uint256 vaultBalBefore = gUSD.balanceOf(vault);
        uint256 withdrawn = strategy.withdraw(1_000 ether);
        vm.stopPrank();

        assertEq(withdrawn, 1_000 ether);
        assertEq(gUSD.balanceOf(vault), vaultBalBefore + 1_000 ether);
        assertEq(strategy.totalDeposited(), 1_000 ether);
    }

    function test_stable_withdraw_cappedAtBalance() public {
        vm.startPrank(vault);
        gUSD.approve(address(strategy), 2_000 ether);
        strategy.deposit(2_000 ether);

        uint256 vaultBalBefore = gUSD.balanceOf(vault);
        uint256 withdrawn = strategy.withdraw(9_999 ether);
        vm.stopPrank();

        assertEq(withdrawn, 2_000 ether, "should cap at depositor balance");
        assertEq(gUSD.balanceOf(vault), vaultBalBefore + 2_000 ether);
    }

    function test_stable_withdraw_reverts_notVault() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(StablecoinStrategy.NotVault.selector);
        strategy.withdraw(100 ether);
    }

    // ── harvest ────────────────────────────────────────────────────────────────

    function test_stable_harvest_withGUSDProfit() public {
        vm.startPrank(vault);
        gUSD.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        // Simulate 80 ether gUSD yield
        stabilityPool.simulateYield(address(strategy), 80 ether);

        vm.prank(vault);
        (uint256 profit, uint256 loss) = strategy.harvest();

        assertEq(profit, 80 ether);
        assertEq(loss, 0);
        assertEq(strategy.totalDeposited(), 1_080 ether);
    }

    function test_stable_harvest_withETHGain() public {
        vm.startPrank(vault);
        gUSD.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        // Simulate 0.5 WETH liquidation gain
        stabilityPool.simulateLiquidationGain(address(strategy), 0.5 ether);

        uint256 vaultWETHBefore = weth.balanceOf(vault);

        vm.prank(vault);
        strategy.harvest();

        // ETH gains stay in strategy (not forwarded to vault); admin recovers via sweepGains().
        assertEq(weth.balanceOf(address(strategy)), 0.5 ether, "ETH gains should stay in strategy");
        assertEq(weth.balanceOf(vault), vaultWETHBefore, "Vault should not receive ETH gains during harvest");
    }

    function test_stable_harvest_withLoss() public {
        vm.startPrank(vault);
        gUSD.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        // Simulate a 100 ether loss
        stabilityPool.simulateLoss(address(strategy), 100 ether);

        vm.prank(vault);
        (uint256 profit, uint256 loss) = strategy.harvest();

        assertEq(profit, 0);
        assertEq(loss, 100 ether);
        assertEq(strategy.totalDeposited(), 900 ether);
    }

    function test_stable_harvest_noChange() public {
        vm.startPrank(vault);
        gUSD.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        vm.prank(vault);
        (uint256 profit, uint256 loss) = strategy.harvest();

        assertEq(profit, 0);
        assertEq(loss, 0);
    }

    function test_stable_harvest_reverts_notVault() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(StablecoinStrategy.NotVault.selector);
        strategy.harvest();
    }

    // ── emergencyWithdraw ──────────────────────────────────────────────────────

    function test_stable_emergencyWithdraw() public {
        vm.startPrank(vault);
        gUSD.approve(address(strategy), 1_000 ether);
        strategy.deposit(1_000 ether);
        vm.stopPrank();

        uint256 vaultBalBefore = gUSD.balanceOf(vault);

        vm.prank(vault);
        uint256 withdrawn = strategy.emergencyWithdraw();

        assertEq(withdrawn, 1_000 ether);
        assertEq(gUSD.balanceOf(vault), vaultBalBefore + 1_000 ether);
        assertTrue(strategy.paused());
        assertEq(strategy.totalDeposited(), 0);
    }

    function test_stable_emergencyWithdraw_emptyBalance() public {
        vm.prank(vault);
        uint256 withdrawn = strategy.emergencyWithdraw();

        assertEq(withdrawn, 0);
        assertTrue(strategy.paused());
    }

    function test_stable_emergencyWithdraw_reverts_notVault() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(StablecoinStrategy.NotVault.selector);
        strategy.emergencyWithdraw();
    }
}
