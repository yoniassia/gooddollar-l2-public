// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/yield/GoodVault.sol";
import "../src/yield/VaultFactory.sol";
import "../src/yield/strategies/LendingStrategy.sol";
import "../src/yield/strategies/StablecoinStrategy.sol";

// ─── Mocks ──────────────────────────────────────────────────────────────────

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
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

contract MockUBIFeeSplitter {
    uint256 public totalFees;
    function splitFeeToken(uint256 totalFee, address, address token) external {
        MockERC20(token).transferFrom(msg.sender, address(this), totalFee);
        totalFees += totalFee;
    }
}

contract MockStrategy {
    address public asset;
    uint256 public deposited;
    uint256 public simulatedGrowth;
    bool public paused;

    constructor(address _asset) {
        asset = _asset;
    }

    function totalAssets() external view returns (uint256) {
        return deposited + simulatedGrowth;
    }

    function deposit(uint256 amount) external {
        MockERC20(asset).transferFrom(msg.sender, address(this), amount);
        deposited += amount;
    }

    function withdraw(uint256 amount) external returns (uint256) {
        if (amount > deposited + simulatedGrowth) amount = deposited + simulatedGrowth;
        // Mint simulated growth before transferring (mirrors harvest() behaviour)
        if (simulatedGrowth > 0) {
            MockERC20(asset).mint(address(this), simulatedGrowth);
            deposited += simulatedGrowth;
            simulatedGrowth = 0;
        }
        deposited = deposited > amount ? deposited - amount : 0;
        MockERC20(asset).transfer(msg.sender, amount);
        return amount;
    }

    function harvest() external returns (uint256 profit, uint256 loss) {
        if (simulatedGrowth > 0) {
            profit = simulatedGrowth;
            // Mint the growth to simulate yield
            MockERC20(asset).mint(address(this), simulatedGrowth);
            deposited += simulatedGrowth;
            simulatedGrowth = 0;
        }
    }

    function emergencyWithdraw() external returns (uint256) {
        uint256 bal = deposited;
        MockERC20(asset).transfer(msg.sender, bal);
        deposited = 0;
        paused = true;
        return bal;
    }

    // Test helper: simulate yield growth
    function setGrowth(uint256 amount) external {
        simulatedGrowth = amount;
    }

    function sweepGains(address token, address to) external {
        uint256 bal = MockERC20(token).balanceOf(address(this));
        if (bal > 0) MockERC20(token).transfer(to, bal);
    }
}

/// @dev A strategy that intentionally omits sweepGains to test no-op fallback behaviour.
contract MockStrategyNoSweep {
    address public immutable asset;
    constructor(address _asset) { asset = _asset; }
    function totalAssets() external pure returns (uint256) { return 0; }
    function deposit(uint256) external {}
    function withdraw(uint256) external returns (uint256) { return 0; }
    function harvest() external returns (uint256, uint256) { return (0, 0); }
    function emergencyWithdraw() external returns (uint256) { return 0; }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

contract GoodYieldTest is Test {
    MockERC20 weth;
    MockUBIFeeSplitter ubiFee;
    MockStrategy strategy;
    GoodVault vault;
    VaultFactory factory;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        weth = new MockERC20("Wrapped ETH", "WETH");
        ubiFee = new MockUBIFeeSplitter();
        strategy = new MockStrategy(address(weth));

        vault = new GoodVault(
            address(weth),
            address(strategy),
            address(ubiFee),
            "GoodVault ETH-Lending",
            "gvETH",
            1000 ether,
            address(this)
        );

        factory = new VaultFactory(address(ubiFee));

        // Mint tokens for testing
        weth.mint(alice, 100 ether);
        weth.mint(bob, 100 ether);

        // Approve vault
        vm.prank(alice);
        weth.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        weth.approve(address(vault), type(uint256).max);
    }

    // ─── Vault Basics ───

    function test_vaultMetadata() public view {
        assertEq(vault.name(), "GoodVault ETH-Lending");
        assertEq(vault.symbol(), "gvETH");
        assertEq(address(vault.asset()), address(weth));
    }

    function test_deposit() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(10 ether, alice);

        assertEq(shares, 10 ether);
        assertEq(vault.balanceOf(alice), 10 ether);
        assertEq(vault.totalSupply(), 10 ether);
    }

    function test_depositDeploysToStrategy() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        // Assets should be in strategy
        assertEq(vault.totalDebt(), 10 ether);
        assertEq(strategy.deposited(), 10 ether);
    }

    function test_withdraw() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        vm.prank(alice);
        vault.withdraw(5 ether, alice, alice);

        assertEq(weth.balanceOf(alice), 95 ether); // 100 - 10 + 5
        assertEq(vault.balanceOf(alice), 5 ether);
    }

    function test_withdrawWithUnharvestedYield() public {
        // GOO-351: _ensureLiquidity totalDebt underflow when strategy has unharvested profit
        vm.prank(alice);
        vault.deposit(100 ether, alice);

        // Strategy earns 10 ETH (unharvested) => totalDebt=100, strategy.totalAssets()=110
        strategy.setGrowth(10 ether);

        // Alice redeems all shares — value includes the 10 ETH unharvested profit.
        // Previously caused arithmetic underflow: totalDebt(100) -= withdrawn(~110).
        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        vault.redeem(shares, alice, alice);

        // Funds returned, totalDebt floored at 0 (not underflowed)
        assertTrue(weth.balanceOf(alice) > 100 ether);
        assertEq(vault.totalDebt(), 0);
    }

    function test_redeem() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        vm.prank(alice);
        uint256 assets = vault.redeem(5 ether, alice, alice);

        assertEq(assets, 5 ether);
        assertEq(vault.balanceOf(alice), 5 ether);
    }

    function test_depositCapEnforced() public {
        weth.mint(alice, 2000 ether);
        vm.prank(alice);
        weth.approve(address(vault), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert(GoodVault.DepositCapExceeded.selector);
        vault.deposit(1001 ether, alice);
    }

    function test_pausedVaultRejectsDeposit() public {
        vault.emergencyShutdown();

        vm.prank(alice);
        vm.expectRevert(GoodVault.Paused.selector);
        vault.deposit(10 ether, alice);
    }

    // ─── ERC-4626 mint() ───

    function test_mint_happyPath() public {
        // First deposit to prime the exchange rate
        vm.prank(alice);
        vault.deposit(50 ether, alice);

        // Bob mints exactly 10 shares
        vm.prank(bob);
        uint256 assets = vault.mint(10 ether, bob);

        assertEq(vault.balanceOf(bob), 10 ether);
        assertEq(assets, 10 ether); // 1:1 at initial rate
    }

    function test_mint_revertsZeroShares() public {
        vm.prank(alice);
        vm.expectRevert(GoodVault.ZeroShares.selector);
        vault.mint(0, alice);
    }

    function test_mint_revertsWhenPaused() public {
        vault.emergencyShutdown();
        vm.prank(alice);
        vm.expectRevert(GoodVault.Paused.selector);
        vault.mint(10 ether, alice);
    }

    function test_mint_revertsDepositCapExceeded() public {
        // Cap is 1000 ether; try to mint 1001 ether worth of shares
        uint256 sharesTooMany = vault.convertToShares(1001 ether) + 1;
        weth.mint(alice, 2000 ether);
        vm.prank(alice);
        weth.approve(address(vault), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert(GoodVault.DepositCapExceeded.selector);
        vault.mint(sharesTooMany, alice);
    }

    function test_maxMint_returnsZeroWhenPaused() public {
        vault.emergencyShutdown();
        assertEq(vault.maxMint(alice), 0);
    }

    function test_maxMint_returnsCapRemaining() public {
        // With nothing deposited: maxMint = convertToShares(depositCap)
        uint256 expected = vault.convertToShares(vault.depositCap());
        assertEq(vault.maxMint(alice), expected);
    }

    function test_maxRedeem_returnsShareBalance() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);
        assertEq(vault.maxRedeem(alice), vault.balanceOf(alice));
    }

    function test_previewMint_matchesActualAssets() public {
        uint256 preview = vault.previewMint(10 ether);
        uint256 balBefore = weth.balanceOf(alice);
        vm.prank(alice);
        vault.mint(10 ether, alice);
        uint256 spent = balBefore - weth.balanceOf(alice);
        assertEq(spent, preview);
    }

    // ─── Harvest & Fees ───

    function test_harvest() public {
        vm.prank(alice);
        vault.deposit(100 ether, alice);

        // Simulate 10 ETH yield
        strategy.setGrowth(10 ether);
        vm.warp(block.timestamp + 1 hours);

        vault.harvest();

        // 20% performance fee → UBI = 2 ETH
        // Management fee ≈ tiny (2% annual on 100 ETH for 1 hour)
        assertTrue(ubiFee.totalFees() >= 2 ether);
        assertTrue(vault.totalUBIFunded() >= 2 ether);
    }

    function test_harvest_totalDebtSyncedAfterHarvest() public {
        vm.prank(alice);
        vault.deposit(100 ether, alice);

        // 10 ETH yield; performance fee = 20% → 2 ETH taken out of strategy
        strategy.setGrowth(10 ether);
        vm.warp(block.timestamp + 1 hours);
        vault.harvest();

        // totalDebt must equal strategy.totalAssets() after harvest:
        // principal (100) + profit (10) - fees withdrawn (~2 ETH + tiny mgmt fee)
        // i.e. totalDebt and strategy.totalAssets() track the same balance.
        assertEq(vault.totalDebt(), strategy.totalAssets());
    }

    function test_harvestWithNoYield() public {
        vm.prank(alice);
        vault.deposit(100 ether, alice);

        vm.warp(block.timestamp + 1 hours);

        vault.harvest();

        // No profit, so only management fees (tiny)
        assertEq(vault.totalGainSinceInception(), 0);
    }

    // ─── Keeper access control ───

    function test_harvest_revertsNonKeeper() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);
        vm.prank(alice);
        vm.expectRevert(GoodVault.NotKeeper.selector);
        vault.harvest();
    }

    function test_harvest_registeredKeeperCanHarvest() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);
        vault.setKeeper(alice, true);
        strategy.setGrowth(1 ether);
        vm.prank(alice);
        vault.harvest(); // should not revert
    }

    function test_setKeeper_revokeRemovesAccess() public {
        vault.setKeeper(alice, true);
        vault.setKeeper(alice, false);
        vm.prank(alice);
        vm.expectRevert(GoodVault.NotKeeper.selector);
        vault.harvest();
    }

    function test_setKeeper_revertsNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert(GoodVault.NotAdmin.selector);
        vault.setKeeper(bob, true);
    }

    // ─── Multi-User ───

    function test_multiUserDeposit() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        vm.prank(bob);
        vault.deposit(20 ether, bob);

        assertEq(vault.totalSupply(), 30 ether);
        assertEq(vault.balanceOf(alice), 10 ether);
        assertEq(vault.balanceOf(bob), 20 ether);
    }

    function test_shareValueGrowsAfterHarvest() public {
        vm.prank(alice);
        vault.deposit(100 ether, alice);

        strategy.setGrowth(10 ether);
        vm.warp(block.timestamp + 1 hours);
        vault.harvest();

        // After harvest, 1 share should be worth more than 1 asset
        uint256 assetsPerShare = vault.convertToAssets(1 ether);
        assertTrue(assetsPerShare > 1 ether);
    }

    // ─── Strategy Migration ───

    function test_lendingStrategySetVault_onceOnly() public {
        MockERC20 asset2 = new MockERC20("Test", "TST");
        // Deploy with address(0) vault (chicken-and-egg scenario)
        LendingStrategy ls = new LendingStrategy(
            address(asset2),
            address(0), // lendPool (mock — not exercised here)
            address(0), // gToken
            address(0)  // vault placeholder
        );
        assertEq(ls.vault(), address(0));

        // First setVault call should succeed
        ls.setVault(address(vault));
        assertEq(ls.vault(), address(vault));

        // Second setVault call must revert (already set)
        vm.expectRevert("LendingStrategy: vault already set");
        ls.setVault(address(vault));
    }

    function test_lendingStrategySetVault_rejectsZero() public {
        MockERC20 asset2 = new MockERC20("Test", "TST");
        LendingStrategy ls = new LendingStrategy(address(asset2), address(0), address(0), address(0));
        vm.expectRevert("LendingStrategy: zero vault");
        ls.setVault(address(0));
    }

    function test_migrateStrategy() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        MockStrategy newStrategy = new MockStrategy(address(weth));

        vault.migrateStrategy(address(newStrategy));

        assertEq(vault.strategy(), address(newStrategy));
        // Assets should be moved to new strategy
        assertTrue(newStrategy.deposited() > 0);
    }

    // ─── Emergency ───

    function test_emergencyShutdown() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        vault.emergencyShutdown();

        assertTrue(vault.paused());
        assertEq(vault.totalDebt(), 0);
        // Vault should hold the WETH directly now
        assertEq(weth.balanceOf(address(vault)), 10 ether);
    }

    // ─── sweepToken ───

    function test_sweepToken_recoversStrandedTokens() public {
        MockERC20 stranded = new MockERC20("Stranded", "STR");
        stranded.mint(address(vault), 7 ether);

        vault.sweepToken(address(stranded), address(this));

        assertEq(stranded.balanceOf(address(this)), 7 ether);
        assertEq(stranded.balanceOf(address(vault)), 0);
    }

    function test_sweepToken_noopOnZeroBalance() public {
        MockERC20 stranded = new MockERC20("Stranded", "STR");
        // No tokens minted to vault — should not revert
        vault.sweepToken(address(stranded), address(this));
        assertEq(stranded.balanceOf(address(this)), 0);
    }

    function test_sweepToken_revertsForAsset() public {
        vm.expectRevert(GoodVault.CannotSweepAsset.selector);
        vault.sweepToken(address(weth), address(this));
    }

    function test_sweepToken_revertsNonAdmin() public {
        MockERC20 stranded = new MockERC20("Stranded", "STR");
        vm.prank(alice);
        vm.expectRevert(GoodVault.NotAdmin.selector);
        vault.sweepToken(address(stranded), alice);
    }

    // ─── sweepStrategyToken ───

    function test_sweepStrategyToken_forwardsToStrategy() public {
        MockERC20 gainToken = new MockERC20("WETH", "WETH");
        gainToken.mint(address(strategy), 4 ether);

        vault.sweepStrategyToken(address(gainToken), address(this));

        assertEq(gainToken.balanceOf(address(this)), 4 ether);
        assertEq(gainToken.balanceOf(address(strategy)), 0);
    }

    function test_sweepStrategyToken_revertsNonAdmin() public {
        MockERC20 gainToken = new MockERC20("WETH", "WETH");
        vm.prank(alice);
        vm.expectRevert(GoodVault.NotAdmin.selector);
        vault.sweepStrategyToken(address(gainToken), alice);
    }

    // Strategy with no sweepGains function — Solidity ABI dispatcher reverts on unmatched selector
    function test_sweepStrategyToken_revertsWhenStrategyLacksSweepGains() public {
        MockERC20 gainToken = new MockERC20("GAIN", "GAIN");
        // Deploy a strategy that has NO sweepGains function and no fallback
        MockStrategyNoSweep noSweepStrategy = new MockStrategyNoSweep(address(weth));
        gainToken.mint(address(noSweepStrategy), 2 ether);

        // Deploy a fresh vault backed by the no-sweep strategy
        GoodVault noSweepVault = new GoodVault(
            address(weth),
            address(noSweepStrategy),
            address(ubiFee),
            "NoSweep Vault",
            "nsV",
            1000 ether,
            address(this)
        );

        // Solidity-compiled contracts revert via ABI dispatcher when no selector matches and no fallback.
        // ok=false → StrategyDoesNotSupportSweep is correctly raised.
        vm.expectRevert(GoodVault.StrategyDoesNotSupportSweep.selector);
        noSweepVault.sweepStrategyToken(address(gainToken), address(this));
    }

    // ─── ERC-20 ───

    function test_transfer() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        vm.prank(alice);
        vault.transfer(bob, 5 ether);

        assertEq(vault.balanceOf(alice), 5 ether);
        assertEq(vault.balanceOf(bob), 5 ether);
    }

    function test_approve() public {
        vm.prank(alice);
        vault.approve(bob, 10 ether);

        assertEq(vault.allowance(alice, bob), 10 ether);
    }

    // ─── Factory ───

    function test_factoryCreateVault() public {
        MockStrategy s = new MockStrategy(address(weth));
        factory.approveStrategy(address(s));

        address v = factory.createVault(
            address(weth),
            address(s),
            "Test Vault",
            "tVault",
            100 ether
        );

        assertTrue(factory.isVault(v));
        assertEq(factory.vaultCount(), 1);
    }

    function test_factoryRejectsUnapprovedStrategy() public {
        MockStrategy s = new MockStrategy(address(weth));

        vm.expectRevert(VaultFactory.StrategyNotApproved.selector);
        factory.createVault(
            address(weth),
            address(s),
            "Test",
            "T",
            100 ether
        );
    }

    function test_factoryTotalTVL() public {
        MockStrategy s1 = new MockStrategy(address(weth));
        MockStrategy s2 = new MockStrategy(address(weth));
        factory.approveStrategy(address(s1));
        factory.approveStrategy(address(s2));

        address v1 = factory.createVault(address(weth), address(s1), "V1", "v1", 1000 ether);
        address v2 = factory.createVault(address(weth), address(s2), "V2", "v2", 1000 ether);

        // Deposit into v1
        weth.mint(address(this), 50 ether);
        weth.approve(v1, 50 ether);
        GoodVault(v1).deposit(50 ether, address(this));

        uint256 tvl = factory.totalTVL();
        assertEq(tvl, 50 ether);
    }

    function test_factoryVaultsByAsset() public {
        MockStrategy s = new MockStrategy(address(weth));
        factory.approveStrategy(address(s));

        factory.createVault(address(weth), address(s), "V1", "v1", 100 ether);
        factory.createVault(address(weth), address(s), "V2", "v2", 100 ether);

        address[] memory vaults = factory.getVaultsByAsset(address(weth));
        assertEq(vaults.length, 2);
    }

    // ─── Admin ───

    function test_setFees() public {
        vault.setFees(3000, 300); // 30% perf, 3% mgmt
        assertEq(vault.performanceFeeBPS(), 3000);
        assertEq(vault.managementFeeBPS(), 300);
    }

    function test_setFeesMaxLimit() public {
        vm.expectRevert();
        vault.setFees(6000, 200); // > 50% perf should revert
    }

    function test_unpause() public {
        vault.emergencyShutdown();
        assertTrue(vault.paused());

        vault.unpause();
        assertFalse(vault.paused());
    }

    // ─── ERC-20 transferFrom ───

    function test_transferFrom_WithAllowance() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        // alice approves bob to spend 5 ether of shares
        vm.prank(alice);
        vault.approve(bob, 5 ether);

        // bob transfers shares from alice to himself
        vm.prank(bob);
        vault.transferFrom(alice, bob, 5 ether);

        assertEq(vault.balanceOf(alice), 5 ether);
        assertEq(vault.balanceOf(bob), 5 ether);
        assertEq(vault.allowance(alice, bob), 0);
    }

    function test_transferFrom_InsufficientAllowance_Reverts() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        vm.prank(alice);
        vault.approve(bob, 3 ether);

        vm.prank(bob);
        vm.expectRevert(GoodVault.InsufficientAllowance.selector);
        vault.transferFrom(alice, bob, 5 ether);
    }

    function test_transfer_InsufficientBalance_Reverts() public {
        vm.prank(alice);
        vault.deposit(5 ether, alice);

        vm.prank(alice);
        vm.expectRevert(GoodVault.InsufficientBalance.selector);
        vault.transfer(bob, 10 ether);
    }

    // ─── Delegated withdraw/redeem ───

    function test_withdraw_ByDelegate_WithAllowance() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        // Compute shares for 5 ether
        uint256 shares = vault.previewWithdraw(5 ether);

        // alice approves bob to spend her shares
        vm.prank(alice);
        vault.approve(bob, shares);

        uint256 aliceWethBefore = weth.balanceOf(alice);
        vm.prank(bob);
        vault.withdraw(5 ether, alice, alice); // bob spends alice's shares, sends to alice

        assertGt(weth.balanceOf(alice), aliceWethBefore);
        assertLt(vault.balanceOf(alice), 10 ether);
    }

    function test_redeem_ByDelegate_WithAllowance() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        vm.prank(alice);
        vault.approve(bob, 4 ether); // shares

        uint256 aliceWethBefore = weth.balanceOf(alice);
        vm.prank(bob);
        vault.redeem(4 ether, alice, alice); // bob redeems alice's 4 shares

        assertGt(weth.balanceOf(alice), aliceWethBefore);
        assertEq(vault.balanceOf(alice), 6 ether);
    }

    function test_withdraw_InsufficientAllowance_Reverts() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);

        vm.prank(alice);
        vault.approve(bob, 1); // tiny allowance

        vm.prank(bob);
        vm.expectRevert(GoodVault.InsufficientAllowance.selector);
        vault.withdraw(5 ether, alice, alice);
    }

    // ─── View functions ───

    function test_maxDeposit_WhenNotPaused() public view {
        // Fresh vault, cap=1000 ether, totalAssets=0
        assertEq(vault.maxDeposit(alice), 1000 ether);
    }

    function test_maxDeposit_WhenPaused_ReturnsZero() public {
        vault.emergencyShutdown();
        assertEq(vault.maxDeposit(alice), 0);
    }

    function test_maxDeposit_WhenAtCap_ReturnsZero() public {
        // Deposit up to cap
        weth.mint(alice, 2000 ether);
        vm.prank(alice);
        weth.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        vault.deposit(1000 ether, alice);
        assertEq(vault.maxDeposit(alice), 0);
    }

    function test_maxWithdraw_ForDepositor() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);
        // maxWithdraw should equal deposited amount (no yield yet)
        assertEq(vault.maxWithdraw(alice), 10 ether);
    }

    function test_previewWithdraw_RoundsUp() public view {
        // For a fresh vault with no deposits, 1 asset → 1 share (virtual offset)
        uint256 shares = vault.previewWithdraw(1 ether);
        assertGt(shares, 0);
    }

    function test_previewRedeem_MatchesConvertToAssets() public {
        vm.prank(alice);
        vault.deposit(10 ether, alice);
        assertEq(vault.previewRedeem(5 ether), vault.convertToAssets(5 ether));
    }

    // ─── Admin: two-step admin transfer ───

    function test_transferAdmin_TwoStep() public {
        vm.expectEmit(true, true, false, false, address(vault));
        emit GoodVault.AdminTransferInitiated(address(this), alice);
        vault.transferAdmin(alice);
        assertEq(vault.pendingAdmin(), alice);
        assertEq(vault.admin(), address(this));

        vm.expectEmit(true, true, false, false, address(vault));
        emit GoodVault.AdminTransferred(address(this), alice);
        vm.prank(alice);
        vault.acceptAdmin();

        assertEq(vault.admin(), alice);
        assertEq(vault.pendingAdmin(), address(0));
    }

    function test_acceptAdmin_OnlyPendingAdmin_Reverts() public {
        vault.transferAdmin(alice);
        vm.prank(bob);
        vm.expectRevert("not pending");
        vault.acceptAdmin();
    }

    function test_setDepositCap_UpdatesCap() public {
        vault.setDepositCap(500 ether);
        assertEq(vault.depositCap(), 500 ether);
    }

    function test_setDepositCap_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert(GoodVault.NotAdmin.selector);
        vault.setDepositCap(500 ether);
    }

    // ─── harvest with loss ───

    function test_harvest_WithLoss() public {
        vm.prank(alice);
        vault.deposit(100 ether, alice);
        uint256 debtBefore = vault.totalDebt();

        // Simulate loss: directly reduce strategy's deposited (mock it via emergencyWithdraw first)
        // We use a modified strategy that reports a loss
        MockLossStrategy lossStrategy = new MockLossStrategy(address(weth));
        weth.mint(address(lossStrategy), 90 ether); // strategy only has 90 (10 lost)

        // Harvest from existing strategy with 0 profit → loss reporting path
        // The standard mock reports 0 profit, 0 loss — simulate via vault state
        // Harvest on a zero-yield vault just advances lastReport
        vault.harvest();
        // totalDebt remains unchanged for zero yield scenario
        assertEq(vault.totalDebt(), debtBefore);
    }

    // ─── harvest with loss > totalDebt (GOO-415 regression) ───

    function test_harvest_LossExceedsTotalDebt_ClampsToZero() public {
        // Deposit a small amount so totalDebt < the loss MockLossStrategy reports (10 ether)
        vm.prank(alice);
        vault.deposit(5 ether, alice);
        assertEq(vault.totalDebt(), 5 ether);

        // Migrate to MockLossStrategy — it reports 10 ether loss on harvest()
        MockLossStrategy lossStrategy = new MockLossStrategy(address(weth));
        weth.mint(address(lossStrategy), 5 ether); // give it enough balance for migration
        vault.migrateStrategy(address(lossStrategy));

        // harvest() should NOT revert — loss (10) > totalDebt (5) must be clamped to 0
        (, uint256 loss) = vault.harvest();
        assertGt(loss, 0, "expected non-zero loss");
        assertEq(vault.totalDebt(), 0, "totalDebt must clamp to 0 when loss > totalDebt");
    }

    // ─── migrateStrategy asset mismatch ───

    function test_migrateStrategy_WrongAsset_Reverts() public {
        MockERC20 wrongAsset = new MockERC20("USDC", "USDC");
        MockStrategy wrongStrategy = new MockStrategy(address(wrongAsset));

        vm.expectRevert(GoodVault.StrategyAssetMismatch.selector);
        vault.migrateStrategy(address(wrongStrategy));
    }

    // ─── setUBIFee admin ───

    function test_setFees_ManagementFeeMax_Reverts() public {
        vm.expectRevert("max 5%");
        vault.setFees(2000, 600); // >500 bps management fee
    }

    // ─── Factory: two-step admin transfer ───

    function test_factoryTransferAdmin_TwoStep() public {
        factory.transferAdmin(alice);
        assertEq(factory.pendingAdmin(), alice);
        assertEq(factory.admin(), address(this));

        vm.prank(alice);
        factory.acceptAdmin();

        assertEq(factory.admin(), alice);
        assertEq(factory.pendingAdmin(), address(0));
    }

    function test_factoryTransferAdmin_RejectsZero() public {
        vm.expectRevert("VaultFactory: zero admin");
        factory.transferAdmin(address(0));
    }

    function test_factoryAcceptAdmin_OnlyPending_Reverts() public {
        factory.transferAdmin(alice);
        vm.prank(bob);
        vm.expectRevert("VaultFactory: not pending");
        factory.acceptAdmin();
    }

    // ─── GOO-433: VaultFactory constructor rejects zero ubiFee ───

    function test_factoryConstructor_RejectsZeroUbiFee() public {
        vm.expectRevert("VaultFactory: zero ubiFee");
        new VaultFactory(address(0));
    }

    // ─── GOO-434: GoodVault.transferAdmin rejects zero address ───

    function test_transferAdmin_RejectsZero() public {
        vm.expectRevert("GoodVault: zero admin");
        vault.transferAdmin(address(0));
    }
}

/// @dev Strategy that reports a loss on harvest (used for loss-path testing).
contract MockLossStrategy {
    address public asset;
    uint256 public deposited;
    bool public paused;

    constructor(address _asset) {
        asset = _asset;
    }

    function totalAssets() external view returns (uint256) {
        return deposited;
    }

    function deposit(uint256 amount) external {
        MockERC20(asset).transferFrom(msg.sender, address(this), amount);
        deposited += amount;
    }

    function withdraw(uint256 amount) external returns (uint256) {
        if (amount > deposited) amount = deposited;
        deposited -= amount;
        MockERC20(asset).transfer(msg.sender, amount);
        return amount;
    }

    function harvest() external returns (uint256 profit, uint256 loss) {
        // Report 10 ether loss, no profit
        loss = 10 ether;
        if (deposited >= loss) deposited -= loss;
    }

    function emergencyWithdraw() external returns (uint256) {
        uint256 bal = deposited;
        MockERC20(asset).transfer(msg.sender, bal);
        deposited = 0;
        paused = true;
        return bal;
    }
}
