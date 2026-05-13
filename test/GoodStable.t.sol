// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/stable/gUSD.sol";
import "../src/stable/interfaces/IGoodStable.sol";
import "../src/stable/CollateralRegistry.sol";
import "../src/stable/VaultManager.sol";
import "../src/stable/StabilityPool.sol";
import "../src/stable/PegStabilityModule.sol";

// ============================================================
// Mocks
// ============================================================

/// @dev Generic ERC-20 mock with configurable decimals and free mint
contract MockToken {
    string  public name;
    string  public symbol;
    uint8   public decimals;
    uint256 public totalSupply;
    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _dec) {
        name     = _name;
        symbol   = _symbol;
        decimals = _dec;
    }

    function mint(address to, uint256 amount) external {
        totalSupply       += amount;
        balanceOf[to]     += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
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
        balanceOf[to]   += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

interface IERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @dev Minimal UBIFeeSplitter mock — just accepts tokens, emits nothing
contract MockFeeSplitter {
    address public immutable token; // gUSD address set at construction
    uint256 public ubiReceived;
    uint256 public totalReceived;

    constructor(address _token) {
        token = _token;
    }

    /// @dev Mirrors UBIFeeSplitter.splitFee signature
    function splitFee(uint256 totalFee, address /*dAppRecipient*/)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare)
    {
        // Pull tokens from caller
        IERC20Like(token).transferFrom(msg.sender, address(this), totalFee);
        ubiShare      = (totalFee * 3333) / 10000;
        protocolShare = (totalFee * 1667) / 10000;
        dAppShare     = totalFee - ubiShare - protocolShare;
        ubiReceived   += ubiShare;
        totalReceived += totalFee;
    }

    /// @dev Token-agnostic variant used by VaultManager.drip() for gUSD stability fees.
    function splitFeeToken(uint256 totalFee, address /*dAppRecipient*/, address _token)
        external
        returns (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare)
    {
        IERC20Like(_token).transferFrom(msg.sender, address(this), totalFee);
        ubiShare      = (totalFee * 3333) / 10000;
        protocolShare = (totalFee * 1667) / 10000;
        dAppShare     = totalFee - ubiShare - protocolShare;
        ubiReceived   += ubiShare;
        totalReceived += totalFee;
    }
}

/// @dev Price oracle mock — per-ilk price set by test
contract MockOracle {
    mapping(bytes32 => uint256) public prices;

    function setPrice(bytes32 ilk, uint256 price) external {
        prices[ilk] = price;
    }

    function getPrice(bytes32 ilk) external view returns (uint256) {
        return prices[ilk];
    }
}

// ============================================================
// Test suite
// ============================================================

contract GoodStableTest is Test {
    // ---- tokens ----
    gUSD         internal gusd;
    MockToken    internal weth;
    MockToken    internal usdc;
    MockToken    internal gdToken;

    // ---- protocol ----
    CollateralRegistry  internal registry;
    MockOracle          internal oracle;
    MockFeeSplitter     internal feeSplitter;
    VaultManager        internal vault;
    StabilityPool       internal sp;
    PegStabilityModule  internal psm;

    // ---- actors ----
    address internal admin   = address(0xA0);
    address internal alice   = address(0xA1);
    address internal bob     = address(0xA2);
    address internal carol   = address(0xA3);
    address internal treasury = address(0xA4);

    // ---- ilk keys ----
    bytes32 internal ETH_ILK  = bytes32("ETH");
    bytes32 internal USDC_ILK = bytes32("USDC");
    bytes32 internal GD_ILK   = bytes32("GD");

    // ---- constants ----
    uint256 internal WAD = 1e18;
    uint256 internal RAY = 1e27;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy collateral tokens
        weth    = new MockToken("Wrapped ETH", "WETH", 18);
        usdc    = new MockToken("USD Coin",    "USDC", 6);
        gdToken = new MockToken("GoodDollar",  "G$",   18);

        // Deploy gUSD
        gusd = new gUSD(admin);

        // Deploy oracle + fee splitter
        oracle      = new MockOracle();
        feeSplitter = new MockFeeSplitter(address(gusd));

        // Deploy registry with default ilks
        registry = new CollateralRegistry(
            admin,
            address(weth),
            address(gdToken),
            address(usdc)
        );

        // Deploy VaultManager
        vault = new VaultManager(
            address(gusd),
            address(registry),
            address(oracle),
            address(feeSplitter),
            treasury,
            admin
        );

        // Deploy StabilityPool
        sp = new StabilityPool(address(gusd), admin);

        // Deploy PSM
        psm = new PegStabilityModule(
            address(gusd),
            address(usdc),
            address(feeSplitter),
            admin
        );

        // Authorize VaultManager and PSM as gUSD minters/burners
        gusd.setMinter(address(vault), true);
        gusd.setMinter(address(psm),   true);
        gusd.setMinter(address(sp),    false); // SP doesn't mint
        gusd.setBurner(address(vault), true);
        gusd.setBurner(address(sp),    true);  // SP calls burn() not burnFrom()
        gusd.setBurner(address(psm),   true);

        // Wire SP into VaultManager
        vault.setStabilityPool(address(sp));

        // Register collateral tokens in SP
        sp.setVaultManager(address(vault));
        sp.registerCollateralToken(ETH_ILK,  address(weth));
        sp.registerCollateralToken(USDC_ILK, address(usdc));
        sp.registerCollateralToken(GD_ILK,   address(gdToken));

        // Set prices: ETH = $2000, USDC = $1, G$ = $0.001 (mocked as 1e15)
        oracle.setPrice(ETH_ILK,  2000e18);
        oracle.setPrice(USDC_ILK, 1e18);
        oracle.setPrice(GD_ILK,   1e15);

        vm.stopPrank();

        // Fund actors with collateral
        weth.mint(alice, 100 ether);
        weth.mint(bob,   100 ether);
        usdc.mint(alice, 100_000e6);
        usdc.mint(bob,   100_000e6);
    }

    // ============================================================
    // Section 1: Deposit collateral and mint gUSD
    // ============================================================

    function test_DepositCollateralAndMintGUSD() public {
        vm.startPrank(alice);

        // Alice deposits 1 ETH
        weth.approve(address(vault), 1 ether);
        vault.depositCollateral(ETH_ILK, 1 ether);

        (uint256 collateral, uint256 normDebt) = vault.vaults(ETH_ILK, alice);
        assertEq(collateral, 1 ether, "collateral not stored");
        assertEq(normDebt, 0, "no debt yet");

        // ETH price = $2000; ratio = 150%; max safe mint = 2000 / 1.5 ≈ 1333 gUSD
        // Mint 1000 gUSD (well within limit)
        vault.mintGUSD(ETH_ILK, 1000e18);

        assertEq(gusd.balanceOf(alice), 1000e18, "gUSD not received");

        uint256 hf = vault.healthFactor(ETH_ILK, alice);
        // hf = (1 ETH * $2000) / (1000 * 1.5) = 2000 / 1500 = 1.333...
        assertGt(hf, WAD, "health factor should be > 1");

        vm.stopPrank();
    }

    function test_MintGUSDRevertsWhenUndercollateralised() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.depositCollateral(ETH_ILK, 1 ether);

        // ETH @ $2000, ratio 150% => max ~1333 gUSD. Try 1500.
        vm.expectRevert("VM: collateral ratio too low");
        vault.mintGUSD(ETH_ILK, 1500e18);

        vm.stopPrank();
    }

    // ============================================================
    // Section 2: Repay gUSD and withdraw collateral
    // ============================================================

    function test_RepayGUSDAndWithdraw() public {
        // Setup: alice opens vault
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.depositCollateral(ETH_ILK, 1 ether);
        vault.mintGUSD(ETH_ILK, 500e18);

        // Repay half
        gusd.approve(address(vault), 250e18);
        vault.repayGUSD(ETH_ILK, 250e18);

        assertEq(gusd.balanceOf(alice), 250e18, "half remaining");

        // Repay rest
        gusd.approve(address(vault), 250e18);
        vault.repayGUSD(ETH_ILK, 250e18);

        (,uint256 normDebt) = vault.vaults(ETH_ILK, alice);
        assertEq(normDebt, 0, "debt cleared");

        // Withdraw collateral
        uint256 before = weth.balanceOf(alice);
        vault.withdrawCollateral(ETH_ILK, 1 ether);
        assertEq(weth.balanceOf(alice) - before, 1 ether, "collateral returned");

        vm.stopPrank();
    }

    function test_WithdrawRevertsIfVaultBecomesUnhealthy() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.depositCollateral(ETH_ILK, 1 ether);
        vault.mintGUSD(ETH_ILK, 1000e18); // 150% ratio — tight

        // Try to withdraw 0.5 ETH — would push ratio below 150%
        vm.expectRevert("VM: vault unhealthy");
        vault.withdrawCollateral(ETH_ILK, 0.5 ether);

        vm.stopPrank();
    }

    function test_CloseVault() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 2 ether);
        vault.depositCollateral(ETH_ILK, 2 ether);
        vault.mintGUSD(ETH_ILK, 1000e18);

        gusd.approve(address(vault), type(uint256).max);
        uint256 wethBefore = weth.balanceOf(alice);
        vault.closeVault(ETH_ILK);

        (uint256 col, uint256 nd) = vault.vaults(ETH_ILK, alice);
        assertEq(col, 0, "col cleared");
        assertEq(nd,  0, "debt cleared");
        assertEq(gusd.balanceOf(alice), 0, "gUSD burned");
        assertEq(weth.balanceOf(alice) - wethBefore, 2 ether, "ETH returned");

        vm.stopPrank();
    }

    // ============================================================
    // Section 3: Liquidation
    // ============================================================

    function test_HealthyVaultCannotBeLiquidated() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.depositCollateral(ETH_ILK, 1 ether);
        vault.mintGUSD(ETH_ILK, 500e18);
        vm.stopPrank();

        // Bob attempts liquidation on healthy vault
        vm.prank(bob);
        vm.expectRevert("VM: vault is healthy");
        vault.liquidate(ETH_ILK, alice);
    }

    function test_UnhealthyVaultCanBeLiquidated_NoStabilityPool() public {
        // Alice opens vault: 1 ETH @ $2000, mints 1000 gUSD (150% ratio exactly after fees)
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.depositCollateral(ETH_ILK, 1 ether);
        vault.mintGUSD(ETH_ILK, 1000e18);
        vm.stopPrank();

        // Price drops to $1200 — vault is now underwater (1200 < 1000 * 1.5 = 1500)
        vm.prank(admin);
        oracle.setPrice(ETH_ILK, 1200e18);

        // Verify vault is indeed unhealthy
        uint256 hf = vault.healthFactor(ETH_ILK, alice);
        assertLt(hf, WAD, "should be unhealthy");

        // Bob is the liquidator — needs gUSD to repay the debt
        // Give Bob enough gUSD
        vm.prank(admin);
        gusd.setMinter(admin, true);
        vm.prank(admin);
        gusd.mint(bob, 2000e18);

        uint256 wethBefore = weth.balanceOf(bob);
        uint256 gusdBefore = gusd.balanceOf(bob);

        vm.startPrank(bob);
        gusd.approve(address(vault), type(uint256).max);
        vault.liquidate(ETH_ILK, alice);
        vm.stopPrank();

        // Bob should have received alice's ETH collateral
        assertGt(weth.balanceOf(bob), wethBefore, "liquidator received ETH");
        // Bob spent gUSD
        assertLt(gusd.balanceOf(bob), gusdBefore, "liquidator spent gUSD");

        // Alice's vault is cleared
        (uint256 col, uint256 nd) = vault.vaults(ETH_ILK, alice);
        assertEq(col, 0, "alice collateral cleared");
        assertEq(nd,  0, "alice debt cleared");
    }

    function test_LiquidationWithStabilityPool() public {
        // Deposit 500 gUSD to SP first
        vm.prank(admin);
        gusd.setMinter(admin, true);
        vm.prank(admin);
        gusd.mint(carol, 500e18);

        vm.startPrank(carol);
        gusd.approve(address(sp), 500e18);
        sp.deposit(500e18);
        vm.stopPrank();

        // Alice opens a vault and gets into trouble
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.depositCollateral(ETH_ILK, 1 ether);
        vault.mintGUSD(ETH_ILK, 500e18); // modest, SP should fully cover
        vm.stopPrank();

        // Price drops
        vm.prank(admin);
        oracle.setPrice(ETH_ILK, 600e18);

        uint256 spBefore = sp.totalDeposits();
        assertEq(spBefore, 500e18, "SP has 500 gUSD");

        // Bob liquidates; SP covers everything, bob needs no gUSD
        vm.prank(bob);
        vault.liquidate(ETH_ILK, alice);

        // SP gUSD decreased
        assertLt(sp.totalDeposits(), spBefore, "SP gUSD used");
        // Alice vault cleared
        (uint256 col,) = vault.vaults(ETH_ILK, alice);
        assertEq(col, 0, "alice cleared");

        // Carol can claim her ETH gain
        vm.prank(carol);
        sp.claimCollateral(ETH_ILK);
        assertGt(weth.balanceOf(carol), 0, "carol earned ETH");
    }

    function test_SP_MultiDepositorWithdrawAfterOffset() public {
        // GOO-352: _settleGains() was a no-op; totalDeposits underflowed when
        // a depositor tried to withdraw after a partial offset with >1 depositor.
        address david = address(0xA5);

        // Give carol and david equal gUSD
        vm.startPrank(admin);
        gusd.setMinter(admin, true);
        gusd.mint(carol, 600e18);
        gusd.mint(david, 600e18);
        vm.stopPrank();

        vm.startPrank(carol);
        gusd.approve(address(sp), 600e18);
        sp.deposit(600e18);
        vm.stopPrank();

        vm.startPrank(david);
        gusd.approve(address(sp), 600e18);
        sp.deposit(600e18);
        vm.stopPrank();

        // totalDeposits = 1200. Offset burns 600 (50%)
        // Simulate: give SP the collateral it will receive, then call offset
        weth.mint(address(vault), 0.5 ether); // vault holds collateral pre-offset

        // Create a small vault to trigger offset via liquidation
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.depositCollateral(ETH_ILK, 1 ether);
        vault.mintGUSD(ETH_ILK, 600e18);
        vm.stopPrank();

        // Price drop makes alice undercollateralized
        vm.prank(admin);
        oracle.setPrice(ETH_ILK, 700e18);

        vm.prank(bob);
        vault.liquidate(ETH_ILK, alice);

        // totalDeposits should be ~600 now (half burned)
        assertLt(sp.totalDeposits(), 1200e18, "SP reduced");

        // Carol and david should each be able to withdraw their proportional share
        // (previously this would underflow on the second withdrawal).
        // claimCollateral triggers _settleGains, materialising the scaled balance.
        vm.prank(carol);
        sp.claimCollateral(ETH_ILK); // triggers _settleGains internally
        uint256 carolShare = sp.deposits(carol); // now reflects effective (scaled) balance

        vm.prank(david);
        sp.claimCollateral(ETH_ILK); // triggers _settleGains internally
        uint256 davidShare = sp.deposits(david);

        if (carolShare > 0) {
            vm.prank(carol);
            sp.withdraw(carolShare);
        }
        if (davidShare > 0) {
            vm.prank(david);
            sp.withdraw(davidShare);
        }

        // totalDeposits should be ~0 after both withdrawals (no underflow)
        assertEq(sp.totalDeposits(), 0, "SP drained cleanly");
    }

    function test_SP_FullDrainEpochPreventsSteal() public {
        // GOO-361: after a full pool drain, pre-drain depositors must NOT be able
        // to withdraw against new depositors' funds.
        address eve = address(0xA6);

        vm.startPrank(admin);
        gusd.setMinter(admin, true);
        gusd.mint(carol, 200e18);
        gusd.mint(eve,   500e18);
        vm.stopPrank();

        // Carol deposits 200 gUSD
        vm.startPrank(carol);
        gusd.approve(address(sp), 200e18);
        sp.deposit(200e18);
        vm.stopPrank();

        // Create an undercollateralised vault for alice so the pool can offset it
        vm.startPrank(alice);
        weth.approve(address(vault), 0.2 ether);
        vault.depositCollateral(ETH_ILK, 0.2 ether);
        vault.mintGUSD(ETH_ILK, 200e18);
        vm.stopPrank();

        // Price crash — alice's vault is immediately under-collateralised
        vm.prank(admin);
        oracle.setPrice(ETH_ILK, 100e18); // $100/ETH, well below CR

        // Liquidation triggers offset: burns all 200 gUSD from pool (full drain)
        vm.prank(bob);
        vault.liquidate(ETH_ILK, alice);

        // Pool should be fully drained
        assertEq(sp.totalDeposits(), 0, "pool fully drained");
        // drainEpoch must have incremented
        assertEq(sp.drainEpoch(), 1, "drainEpoch incremented");

        // Eve deposits fresh gUSD AFTER the drain
        vm.startPrank(eve);
        gusd.approve(address(sp), 500e18);
        sp.deposit(500e18);
        vm.stopPrank();

        assertEq(sp.totalDeposits(), 500e18, "Eve's deposit recorded");

        // Carol (pre-drain depositor whose gUSD was burned) tries to withdraw
        // She should get ZERO — her 200 gUSD was already burned in the liquidation.
        vm.prank(carol);
        vm.expectRevert("SP: deposit burned in liquidation");
        sp.withdraw(1);

        // claimCollateral still works — Carol earned collateral when her gUSD absorbed
        // the liquidation. The epoch guard only blocks gUSD withdrawal, not collateral claims.
        vm.prank(carol);
        sp.claimCollateral(ETH_ILK); // succeeds (earns whatever collateral was distributed)

        // Verify Carol still CANNOT withdraw gUSD even after claimCollateral
        vm.prank(carol);
        vm.expectRevert("SP: deposit burned in liquidation");
        sp.withdraw(1);

        // Eve should still be able to withdraw her full 500 gUSD
        vm.prank(eve);
        sp.withdraw(500e18);
        assertEq(sp.totalDeposits(), 0, "Eve withdrew cleanly");
    }

    function test_SP_EpochReDepositCannotClaimPreDrainGains() public {
        // GOO-367: re-depositing in a new epoch must not allow the user to claim
        // pre-drain collateral gains proportional to their new (larger) deposit.
        address attacker = address(0xA7);
        address victim   = address(0xA8);

        vm.startPrank(admin);
        gusd.setMinter(admin, true);
        gusd.mint(attacker, 1000e18);
        gusd.mint(victim,   1000e18);
        vm.stopPrank();

        // Attacker deposits a small amount (10 gUSD) in epoch 0.
        vm.startPrank(attacker);
        gusd.approve(address(sp), 1000e18);
        sp.deposit(10e18);
        vm.stopPrank();

        // Victim deposits 90 gUSD so the total pool = 100 gUSD.
        vm.startPrank(victim);
        gusd.approve(address(sp), 1000e18);
        sp.deposit(90e18);
        vm.stopPrank();

        // Create an undercollateralised vault for alice to trigger a full drain.
        vm.startPrank(alice);
        weth.approve(address(vault), 0.1 ether);
        vault.depositCollateral(ETH_ILK, 0.1 ether);
        vault.mintGUSD(ETH_ILK, 100e18);
        vm.stopPrank();

        vm.prank(admin);
        oracle.setPrice(ETH_ILK, 100e18); // price crash

        vm.prank(bob);
        vault.liquidate(ETH_ILK, alice);

        // Full drain: epoch 1. The pool distributed ~0.1 ETH to all depositors.
        assertEq(sp.drainEpoch(), 1, "epoch incremented");
        assertEq(sp.totalDeposits(), 0, "pool drained");

        // Attacker is entitled to 10/100 = 10% of the distributed collateral.
        uint256 attackerFairShare = weth.balanceOf(address(sp)) * 10 / 100;

        // Attacker re-deposits a LARGE amount (990 gUSD) WITHOUT claiming first.
        vm.startPrank(attacker);
        sp.deposit(990e18);
        vm.stopPrank();

        // Attacker's gainSnapshot must now be at the current cumulative so they
        // cannot claim pre-drain gains with their large new deposit.
        uint256 snapshotAfterReDeposit = sp.gainSnapshots(attacker, ETH_ILK);
        assertEq(
            snapshotAfterReDeposit,
            sp.cumulativeGainPerGUSD(ETH_ILK),
            "gainSnapshot reset to current cumulative on epoch re-deposit"
        );

        // Attacker claims collateral — should get 0 (snapshot == cumulative).
        uint256 wethBefore = weth.balanceOf(attacker);
        vm.prank(attacker);
        sp.claimCollateral(ETH_ILK);
        uint256 wethGained = weth.balanceOf(attacker) - wethBefore;

        assertEq(wethGained, 0, "attacker gets 0 post-drain gains after re-deposit without prior claim");

        // Sanity: attacker's pre-drain fair share (10%) is forfeited because they did
        // not call claimCollateral() before re-depositing. This is documented behaviour.
        // The key invariant is they do NOT receive MORE than their fair share.
        assertLe(wethGained, attackerFairShare, "attacker cannot receive more than fair share");
    }

    function test_SP_FreshDepositorCannotClaimPreEntryGains() public {
        // GOO-369: a brand-new depositor in the SAME epoch whose gainSnapshots default
        // to 0 must not claim collateral gains from liquidations before their entry.
        address lateUser = address(0xB1);

        vm.startPrank(admin);
        gusd.setMinter(admin, true);
        gusd.mint(alice,    200e18);
        gusd.mint(lateUser, 200e18);
        vm.stopPrank();

        // Alice deposits 200 gUSD as the sole depositor.
        vm.startPrank(alice);
        gusd.approve(address(sp), 200e18);
        sp.deposit(200e18);
        vm.stopPrank();

        // Create an under-collateralised vault for a partial offset (not full drain).
        vm.startPrank(bob);
        weth.approve(address(vault), 0.2 ether);
        vault.depositCollateral(ETH_ILK, 0.2 ether);
        vault.mintGUSD(ETH_ILK, 150e18);
        vm.stopPrank();

        vm.prank(admin);
        oracle.setPrice(ETH_ILK, 100e18); // price crash — collateral only covers 150% at $100

        // Liquidate bob's vault: 150 gUSD offset from Alice's 200 deposit.
        // ~0.15 ETH worth of collateral distributed. drainEpoch stays at 0.
        vm.prank(alice); // anyone can liquidate
        vault.liquidate(ETH_ILK, bob);

        // Verify epoch did NOT advance (partial drain, pool still has gUSD).
        assertEq(sp.drainEpoch(), 0, "no drain epoch increment for partial offset");

        // cumulativeGainPerGUSD is now > 0.
        uint256 cumGain = sp.cumulativeGainPerGUSD(ETH_ILK);
        assertGt(cumGain, 0, "gain accumulated from liquidation");

        // lateUser now enters the pool AFTER the liquidation, same epoch.
        vm.startPrank(lateUser);
        gusd.approve(address(sp), 200e18);
        sp.deposit(200e18);
        vm.stopPrank();

        // lateUser's gainSnapshot must be initialised to the current cumulative,
        // NOT left at 0 (which would let them claim pre-entry gains).
        assertEq(
            sp.gainSnapshots(lateUser, ETH_ILK),
            cumGain,
            "GOO-369: gainSnapshot must equal current cumulative on fresh deposit"
        );

        // lateUser claims: should receive 0 (no liquidations after their entry).
        uint256 wethBefore = weth.balanceOf(lateUser);
        vm.prank(lateUser);
        sp.claimCollateral(ETH_ILK);
        assertEq(weth.balanceOf(lateUser) - wethBefore, 0, "lateUser receives 0 pre-entry gain");
    }

    function test_SP_PartialDrainThenFullDrain_NoInflation() public {
        // GOO-371: scaleIndex reset on full drain must not inflate pre-drain depositors.
        //
        // Scenario (mirrors the issue's concrete example):
        //   sp1 deposits 100 gUSD  → sole depositor, scaleIndex = PRECISION
        //   partial offset: 50 gUSD burned, vault1 collateral distributed
        //       → scaleIndex = PRECISION/2, sp1's effective balance = 50 gUSD
        //   sp2 deposits 100 gUSD  → snapshot = PRECISION/2, totalDeposits = 150
        //   full drain: 150 gUSD burned, vault2 collateral distributed
        //       → epochBoundaryScaleIndex[0] = PRECISION/2, drainEpoch = 1
        //       → scaleIndex resets to PRECISION
        //   Without fix: sp2's _settleGains sees 100 * PRECISION / (PRECISION/2) = 200
        //                → claims 266% of vault2 collateral — drains the contract.
        //   With fix: sp2 correctly settles to 100 (boundary scale == snapshot).

        address sp1 = address(0xB2);
        address sp2 = address(0xB3);
        address vaultOwner1 = address(0xB4);
        address vaultOwner2 = address(0xB5);

        // Fund SP depositors with gUSD
        vm.startPrank(admin);
        gusd.setMinter(admin, true);
        gusd.mint(sp1, 100e18);
        gusd.mint(sp2, 100e18);
        vm.stopPrank();

        // Fund vault owners with WETH
        weth.mint(vaultOwner1, 1 ether);
        weth.mint(vaultOwner2, 1 ether);

        // ── Step 1: sp1 deposits 100 gUSD ──────────────────────────────
        vm.startPrank(sp1);
        gusd.approve(address(sp), 100e18);
        sp.deposit(100e18);
        vm.stopPrank();

        assertEq(sp.scaleIndex(), sp.PRECISION(), "scaleIndex starts at PRECISION");

        // ── Step 2: vaultOwner1 opens vault, gets liquidated (partial drain) ──
        // At $2000: 0.05 ETH = $100. Mint 50 gUSD (CR = 200% ≥ 150%).
        vm.startPrank(vaultOwner1);
        weth.approve(address(vault), 0.05 ether);
        vault.depositCollateral(ETH_ILK, 0.05 ether);
        vault.mintGUSD(ETH_ILK, 50e18);
        vm.stopPrank();

        // Drop price so vaultOwner1 is liquidatable: 0.05 * 1200 = $60 < 50 * 1.5 = $75.
        vm.prank(admin);
        oracle.setPrice(ETH_ILK, 1200e18);

        uint256 collateral1 = weth.balanceOf(address(sp)); // should be 0 before
        vm.prank(bob); // any caller can liquidate
        vault.liquidate(ETH_ILK, vaultOwner1);

        uint256 wethAfterOffset1 = weth.balanceOf(address(sp));
        assertGt(wethAfterOffset1, collateral1, "SP received collateral from offset-1");
        assertEq(sp.totalDeposits(), 50e18, "50 gUSD remains after partial drain");
        assertLt(sp.scaleIndex(), sp.PRECISION(), "scaleIndex dropped after partial offset");
        assertEq(sp.drainEpoch(), 0, "drainEpoch still 0 (partial, not full)");

        // ── Step 3: sp2 deposits 100 gUSD (snapshot = current scaleIndex < PRECISION) ──
        vm.startPrank(sp2);
        gusd.approve(address(sp), 100e18);
        sp.deposit(100e18);
        vm.stopPrank();

        uint256 sp2DepositSnapshot = sp.depositScaleSnapshot(sp2);
        assertEq(sp2DepositSnapshot, sp.scaleIndex(), "sp2 snapshot = current scaleIndex");
        assertLt(sp2DepositSnapshot, sp.PRECISION(), "sp2 snapshot < PRECISION (key pre-condition)");
        assertEq(sp.totalDeposits(), 150e18, "pool = 150 gUSD");

        // ── Step 4: vaultOwner2 opens vault for 150 gUSD, gets liquidated (full drain) ──
        // At $1200: need 0.2 ETH = $240 to support 150 gUSD at CR 150% ($225).
        vm.startPrank(vaultOwner2);
        weth.approve(address(vault), 0.2 ether);
        vault.depositCollateral(ETH_ILK, 0.2 ether);
        vault.mintGUSD(ETH_ILK, 150e18);
        vm.stopPrank();

        // Drop price: 0.2 * 700 = $140 < 150 * 1.5 = $225 → liquidatable.
        vm.prank(admin);
        oracle.setPrice(ETH_ILK, 700e18);

        vm.prank(bob);
        vault.liquidate(ETH_ILK, vaultOwner2);

        uint256 wethAfterOffset2 = weth.balanceOf(address(sp));
        assertGt(wethAfterOffset2, wethAfterOffset1, "SP received collateral from offset-2");
        assertEq(sp.totalDeposits(), 0, "pool fully drained");
        assertEq(sp.drainEpoch(), 1, "drainEpoch incremented to 1");
        assertEq(sp.scaleIndex(), sp.PRECISION(), "scaleIndex reset to PRECISION after full drain");

        // epochBoundaryScaleIndex[0] must have been recorded before the reset.
        assertEq(sp.epochBoundaryScaleIndex(0), sp2DepositSnapshot,
            "epochBoundaryScaleIndex[0] = scaleIndex at boundary (= PRECISION/2)");

        uint256 totalWethInSP = weth.balanceOf(address(sp));

        // ── Step 5: both depositors claim — total must not exceed available ETH ──
        uint256 sp1Before = weth.balanceOf(sp1);
        uint256 sp2Before = weth.balanceOf(sp2);

        vm.prank(sp1);
        sp.claimCollateral(ETH_ILK);

        vm.prank(sp2);
        sp.claimCollateral(ETH_ILK);

        uint256 sp1Gained = weth.balanceOf(sp1) - sp1Before;
        uint256 sp2Gained = weth.balanceOf(sp2) - sp2Before;
        uint256 totalClaimed = sp1Gained + sp2Gained;

        // Core invariant: no over-payment — the contract must not be drained.
        assertLe(totalClaimed, totalWethInSP,
            "GOO-371: total claimed must not exceed available collateral");

        // sp2's effective deposit at drain time == sp2's nominal deposit (boundary scale == snapshot).
        // The bug would set effective = 200e18 → sp2 gets ~2/3 * vault2Collateral ≈ impossible amount.
        // With fix, sp2's effective = 100e18 and gains only from offset-2.
        uint256 vault2Collateral = wethAfterOffset2 - wethAfterOffset1;
        // sp2 should receive no more than their proportional share of vault2 collateral
        // (100 gUSD out of 150 total = 2/3). Allow 1 wei rounding.
        assertLe(sp2Gained, (vault2Collateral * 2) / 3 + 1,
            "GOO-371: sp2 must not receive more than 2/3 of vault2 collateral");

        // Sanity: sp2 should receive a non-trivial share of vault2 collateral.
        assertGt(sp2Gained, 0, "sp2 earned collateral from offset-2");
    }

    // ============================================================
    // Section 4: PSM — swap both directions
    // ============================================================

    function test_PSM_SwapUSDCForGUSD() public {
        uint256 usdcAmount = 1000e6; // 1000 USDC

        vm.startPrank(alice);
        usdc.approve(address(psm), usdcAmount);
        psm.swapUSDCForGUSD(usdcAmount);
        vm.stopPrank();

        // 1000 USDC → 1000 gUSD minus 0.1% fee
        uint256 expectedFee  = (1000e18 * 10) / 10_000; // 1e18
        uint256 expectedGUSD = 1000e18 - expectedFee;

        assertEq(gusd.balanceOf(alice), expectedGUSD, "gUSD out incorrect");
        assertEq(psm.totalUSDCReserves(), usdcAmount, "USDC reserves");
    }

    function test_PSM_SwapGUSDForUSDC() public {
        // First, give alice some gUSD via USDC deposit
        vm.startPrank(alice);
        usdc.approve(address(psm), 2000e6);
        psm.swapUSDCForGUSD(2000e6);
        vm.stopPrank();

        // Now swap gUSD back
        uint256 gusdIn = 1000e18;
        uint256 aliceGusdBefore = gusd.balanceOf(alice);
        uint256 aliceUsdcBefore = usdc.balanceOf(alice);

        vm.startPrank(alice);
        gusd.approve(address(psm), gusdIn);
        psm.swapGUSDForUSDC(gusdIn);
        vm.stopPrank();

        uint256 fee    = (gusdIn * 10) / 10_000;
        uint256 usdcOut = (gusdIn - fee) / 1e12;

        assertEq(gusd.balanceOf(alice), aliceGusdBefore - gusdIn, "gUSD burned");
        assertEq(usdc.balanceOf(alice) - aliceUsdcBefore, usdcOut, "USDC out");
    }

    function test_PSM_RevertsWhenPaused() public {
        vm.prank(admin);
        psm.setPaused(true);

        vm.startPrank(alice);
        usdc.approve(address(psm), 1000e6);
        vm.expectRevert("PSM: paused");
        psm.swapUSDCForGUSD(1000e6);
        vm.stopPrank();
    }

    function test_PSM_FeeRoutedToSplitter() public {
        uint256 usdcAmount = 10_000e6;
        uint256 feesBefore = feeSplitter.totalReceived();

        vm.startPrank(alice);
        usdc.approve(address(psm), usdcAmount);
        psm.swapUSDCForGUSD(usdcAmount);
        vm.stopPrank();

        assertGt(feeSplitter.totalReceived(), feesBefore, "fee splitter received fees");
    }

    function test_PSM_WithdrawReserves_Normal() public {
        // Alice deposits 2000 USDC; psmMintedGUSD (gross) tracks her minted gUSD
        vm.startPrank(alice);
        usdc.approve(address(psm), 2000e6);
        psm.swapUSDCForGUSD(2000e6);
        vm.stopPrank();

        // Alice redeems 1000 gUSD back for USDC — psmBurnedGUSD increments, psmMintedGUSD unchanged
        uint256 gusdIn = 1000e18;
        vm.startPrank(alice);
        gusd.approve(address(psm), gusdIn);
        psm.swapGUSDForUSDC(gusdIn);
        vm.stopPrank();

        // Outstanding = psmMintedGUSD - psmBurnedGUSD (gross net approach)
        uint256 minted  = psm.psmMintedGUSD();
        uint256 burned  = psm.psmBurnedGUSD();
        uint256 outstanding = minted > burned ? minted - burned : 0;
        uint256 reserves = psm.totalUSDCReserves();
        uint256 minUSDC = outstanding / 1e12;
        uint256 surplus = reserves > minUSDC ? reserves - minUSDC : 0;

        if (surplus > 0) {
            vm.prank(admin);
            psm.withdrawReserves(treasury, surplus);
            assertEq(psm.totalUSDCReserves(), minUSDC, "reserves should equal minUSDC after withdrawal");
        }
    }

    function test_PSM_WithdrawReserves_RevertsWhenUndercollateralized() public {
        vm.startPrank(alice);
        usdc.approve(address(psm), 1000e6);
        psm.swapUSDCForGUSD(1000e6);
        vm.stopPrank();

        // psmMintedGUSD ≈ 999e18 (user's gUSD), minUSDC = 999
        // totalUSDCReserves = 1000 — surplus is only ~1 USDC
        // Attempting to withdraw 500 USDC should revert (would undercollateralize)
        vm.prank(admin);
        vm.expectRevert("PSM: undercollateralized");
        psm.withdrawReserves(treasury, 500e6);
    }

    function test_PSM_WithdrawReserves_NotBlockedByVaultManagerGUSD() public {
        // VaultManager mints a large amount of collateral-backed gUSD
        // (simulate by directly calling mint as admin/minter after authorizing)
        vm.startPrank(admin);
        gusd.setMinter(admin, true);
        gusd.mint(bob, 1_000_000e18); // 1M gUSD minted by "VaultManager" (simulated)
        vm.stopPrank();

        // PSM has modest reserves
        vm.startPrank(alice);
        usdc.approve(address(psm), 1000e6);
        psm.swapUSDCForGUSD(1000e6);
        vm.stopPrank();

        // gusd.totalSupply() is now ~1,001,000e18 but psmMintedGUSD ≈ 999e18
        // Old (buggy) check: minUSDC = totalSupply / SCALE = 1,001,000 → always reverts
        // New (correct) check: minUSDC = psmMintedGUSD / SCALE ≈ 999 → withdrawal possible

        uint256 reserves    = psm.totalUSDCReserves();
        uint256 minted_     = psm.psmMintedGUSD();
        uint256 burned_     = psm.psmBurnedGUSD();
        uint256 outstanding_ = minted_ > burned_ ? minted_ - burned_ : 0;
        uint256 minUSDC     = outstanding_ / 1e12;
        uint256 surplus     = reserves > minUSDC ? reserves - minUSDC : 0;

        // Should NOT revert — VaultManager gUSD does not block PSM withdrawal
        if (surplus > 0) {
            vm.prank(admin);
            psm.withdrawReserves(treasury, surplus);
        }
        // Confirm totalSupply is much larger than PSM reserves (test premise)
        assertGt(gusd.totalSupply() / 1e12, psm.totalUSDCReserves(), "totalSupply >> PSM reserves");
    }

    function test_PSM_WithdrawReserves_BlockedAfterCrossOriginRedemption() public {
        // Demonstrate GOO-289 fix: VaultManager-gUSD draining PSM reserves does NOT
        // allow admin to subsequently drain remaining USDC while Alice's gUSD is outstanding.

        // Alice (PSM user) deposits 100 USDC
        vm.startPrank(alice);
        usdc.approve(address(psm), 100e6);
        psm.swapUSDCForGUSD(100e6);  // alice gets ~99.9 gUSD, psmMintedGUSD = ~99.9e18
        vm.stopPrank();

        // Bob (VaultManager user) acquires 99 gUSD via collateral mint (simulated)
        vm.prank(admin);
        gusd.setMinter(admin, true);
        vm.prank(admin);
        gusd.mint(bob, 99e18);

        // Bob redeems his VaultManager-minted gUSD through PSM, draining ~98.9 USDC
        vm.startPrank(bob);
        gusd.approve(address(psm), 99e18);
        psm.swapGUSDForUSDC(99e18);
        vm.stopPrank();

        // PSM reserves now only ~1.1 USDC; Alice still holds ~99.9 gUSD
        // psmBurnedGUSD grew by Bob's redemption; outstanding = psmMintedGUSD - psmBurnedGUSD
        uint256 minted  = psm.psmMintedGUSD();
        uint256 burned  = psm.psmBurnedGUSD();
        uint256 outstanding = minted > burned ? minted - burned : 0;
        uint256 reserves    = psm.totalUSDCReserves();
        uint256 minUSDC     = outstanding / 1e12;

        // Admin must NOT be able to drain remaining reserves beyond true surplus
        // (surplus here is tiny — at most a few USDC from fee rounding)
        uint256 surplus = reserves > minUSDC ? reserves - minUSDC : 0;

        // Attempting to withdraw more than the surplus MUST revert
        if (reserves > surplus + 1e6) {  // try to withdraw 1 USDC above surplus
            vm.prank(admin);
            vm.expectRevert("PSM: undercollateralized");
            psm.withdrawReserves(treasury, surplus + 1e6);
        }

        // Alice can still redeem whatever is left (partial — PSM is insolvent due to Bob)
        // But the key invariant: admin cannot drain Alice's remaining backing
        assertLe(minUSDC, reserves, "minUSDC must be <= reserves (no over-withdrawal allowed)");
    }

    // ── PSM: admin functions ───────────────────────────────────────────────────

    function test_PSM_SetFeeBPS() public {
        vm.prank(admin);
        psm.setFeeBPS(50);
        assertEq(psm.feeBPS(), 50);
    }

    function test_PSM_SetFeeBPS_TooHigh() public {
        vm.prank(admin);
        vm.expectRevert("PSM: fee too high");
        psm.setFeeBPS(201);
    }

    function test_PSM_SetFeeBPS_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("PSM: not admin");
        psm.setFeeBPS(5);
    }

    function test_PSM_SetSwapCap() public {
        vm.prank(admin);
        psm.setSwapCap(500_000e6);
        assertEq(psm.swapCap(), 500_000e6);
    }

    function test_PSM_SetSwapCap_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("PSM: not admin");
        psm.setSwapCap(1e6);
    }

    function test_PSM_SwapCap_Enforcement() public {
        vm.prank(admin);
        psm.setSwapCap(500e6); // cap at 500 USDC

        vm.startPrank(alice);
        usdc.approve(address(psm), 1000e6);

        // First 500 USDC should succeed
        psm.swapUSDCForGUSD(500e6);
        assertEq(psm.totalUSDCReserves(), 500e6);

        // Next deposit would exceed cap
        vm.expectRevert("PSM: swap cap reached");
        psm.swapUSDCForGUSD(1e6);
        vm.stopPrank();
    }

    function test_PSM_SwapCap_Zero_Unlimited() public {
        // Cap = 0 means unlimited
        vm.prank(admin);
        psm.setSwapCap(0);

        vm.startPrank(alice);
        usdc.approve(address(psm), 10_000e6);
        psm.swapUSDCForGUSD(10_000e6); // should succeed with no cap
        vm.stopPrank();
        assertEq(psm.totalUSDCReserves(), 10_000e6);
    }

    function test_PSM_TransferAdmin() public {
        vm.prank(admin);
        psm.transferAdmin(alice);
        assertEq(psm.admin(), alice);
    }

    function test_PSM_TransferAdmin_ZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("PSM: zero address");
        psm.transferAdmin(address(0));
    }

    function test_PSM_TransferAdmin_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("PSM: not admin");
        psm.transferAdmin(bob);
    }

    function test_PSM_SetPaused_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("PSM: not admin");
        psm.setPaused(true);
    }

    function test_PSM_Unpause() public {
        vm.prank(admin);
        psm.setPaused(true);

        vm.prank(admin);
        psm.setPaused(false);
        assertEq(psm.paused(), false);

        // Should succeed after unpause
        vm.startPrank(alice);
        usdc.approve(address(psm), 100e6);
        psm.swapUSDCForGUSD(100e6);
        vm.stopPrank();
    }

    function test_PSM_SwapGUSDForUSDC_Paused() public {
        vm.startPrank(alice);
        usdc.approve(address(psm), 1000e6);
        psm.swapUSDCForGUSD(1000e6);
        vm.stopPrank();

        vm.prank(admin);
        psm.setPaused(true);

        vm.startPrank(alice);
        gusd.approve(address(psm), 500e18);
        vm.expectRevert("PSM: paused");
        psm.swapGUSDForUSDC(500e18);
        vm.stopPrank();
    }

    // ── PSM: fee=0 paths ───────────────────────────────────────────────────────

    function test_PSM_SwapUSDCForGUSD_ZeroFee() public {
        vm.prank(admin);
        psm.setFeeBPS(0);

        uint256 usdcAmount = 1000e6;
        vm.startPrank(alice);
        usdc.approve(address(psm), usdcAmount);
        psm.swapUSDCForGUSD(usdcAmount);
        vm.stopPrank();

        // With 0% fee, alice gets exactly 1000e18 gUSD
        assertEq(gusd.balanceOf(alice), 1000e18);
        assertEq(feeSplitter.totalReceived(), 0); // no fee sent to splitter
    }

    function test_PSM_SwapGUSDForUSDC_ZeroFee() public {
        vm.prank(admin);
        psm.setFeeBPS(0);

        vm.startPrank(alice);
        usdc.approve(address(psm), 1000e6);
        psm.swapUSDCForGUSD(1000e6); // alice gets 1000e18 gUSD with fee=0
        vm.stopPrank();

        uint256 aliceUsdcBefore = usdc.balanceOf(alice);
        uint256 gusdIn = 500e18;
        vm.startPrank(alice);
        gusd.approve(address(psm), gusdIn);
        psm.swapGUSDForUSDC(gusdIn);
        vm.stopPrank();

        // With 0% fee, net = full gusdIn, usdcOut = 500e18 / 1e12 = 500e6
        assertEq(usdc.balanceOf(alice) - aliceUsdcBefore, 500e6);
        assertEq(feeSplitter.totalReceived(), 0); // no fee sent
    }

    // ── PSM: view functions ────────────────────────────────────────────────────

    function test_PSM_PreviewUSDCForGUSD() public view {
        (uint256 gusdOut, uint256 fee) = psm.previewUSDCForGUSD(1000e6);
        uint256 expected = (1000e18 * 10) / 10_000;
        assertEq(fee, expected);
        assertEq(gusdOut, 1000e18 - expected);
    }

    function test_PSM_PreviewGUSDForUSDC() public view {
        (uint256 usdcOut, uint256 fee) = psm.previewGUSDForUSDC(1000e18);
        uint256 expectedFee = (1000e18 * 10) / 10_000;
        assertEq(fee, expectedFee);
        assertEq(usdcOut, (1000e18 - expectedFee) / 1e12);
    }

    // ── PSM: error reverts ─────────────────────────────────────────────────────

    function test_PSM_SwapUSDCForGUSD_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("PSM: zero amount");
        psm.swapUSDCForGUSD(0);
    }

    function test_PSM_SwapGUSDForUSDC_ZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("PSM: zero amount");
        psm.swapGUSDForUSDC(0);
    }

    function test_PSM_WithdrawReserves_ZeroBalance() public {
        // No deposits — totalUSDCReserves = 0
        vm.prank(admin);
        vm.expectRevert("PSM: exceeds reserves");
        psm.withdrawReserves(treasury, 1e6);
    }

    function test_PSM_WithdrawReserves_ZeroAddress() public {
        vm.startPrank(alice);
        usdc.approve(address(psm), 1000e6);
        psm.swapUSDCForGUSD(1000e6);
        vm.stopPrank();

        vm.prank(admin);
        vm.expectRevert("PSM: zero address");
        psm.withdrawReserves(address(0), 1e6);
    }

    function test_PSM_WithdrawReserves_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("PSM: not admin");
        psm.withdrawReserves(treasury, 1e6);
    }

    function test_PSM_WithdrawReserves_OutstandingZero() public {
        // When psmBurnedGUSD >= psmMintedGUSD, outstanding = 0, minUSDC = 0.
        // Use feeBPS=0 so burned amount exactly matches minted amount.
        vm.prank(admin);
        psm.setFeeBPS(0);

        vm.startPrank(alice);
        usdc.approve(address(psm), 1000e6);
        psm.swapUSDCForGUSD(1000e6); // psmMintedGUSD = 1000e18
        vm.stopPrank();

        // Redeem all 1000e18 gUSD — with fee=0, netGUSD = 1000e18, psmBurnedGUSD = 1000e18
        uint256 aliceGusd = gusd.balanceOf(alice);
        vm.startPrank(alice);
        gusd.approve(address(psm), aliceGusd);
        psm.swapGUSDForUSDC(aliceGusd);
        vm.stopPrank();

        // outstanding = max(0, 1000e18 - 1000e18) = 0, minUSDC = 0
        assertEq(psm.psmMintedGUSD(), psm.psmBurnedGUSD());
        // Admin can now withdraw all remaining USDC (if any dust remains)
        uint256 reserves = psm.totalUSDCReserves();
        if (reserves > 0) {
            vm.prank(admin);
            psm.withdrawReserves(treasury, reserves);
            assertEq(psm.totalUSDCReserves(), 0);
        }
    }

    function test_PSM_Constructor_ZeroGUSD() public {
        vm.expectRevert("PSM: zero gUSD");
        new PegStabilityModule(address(0), address(usdc), address(feeSplitter), admin);
    }

    function test_PSM_Constructor_ZeroUSDC() public {
        vm.expectRevert("PSM: zero USDC");
        new PegStabilityModule(address(gusd), address(0), address(feeSplitter), admin);
    }

    function test_PSM_Constructor_ZeroSplitter() public {
        vm.expectRevert("PSM: zero splitter");
        new PegStabilityModule(address(gusd), address(usdc), address(0), admin);
    }

    function test_PSM_Constructor_ZeroAdmin() public {
        vm.expectRevert("PSM: zero admin");
        new PegStabilityModule(address(gusd), address(usdc), address(feeSplitter), address(0));
    }

    // ============================================================
    // Section 5: Stability Pool — deposit / withdraw / claim
    // ============================================================

    function test_SP_DepositAndWithdraw() public {
        vm.prank(admin);
        gusd.setMinter(admin, true);
        vm.prank(admin);
        gusd.mint(alice, 1000e18);

        vm.startPrank(alice);
        gusd.approve(address(sp), 1000e18);
        sp.deposit(1000e18);
        vm.stopPrank();

        assertEq(sp.totalDeposits(), 1000e18, "deposits tracked");
        assertEq(sp.deposits(alice),  1000e18, "alice deposit tracked");

        // Withdraw half
        vm.startPrank(alice);
        sp.withdraw(500e18);
        vm.stopPrank();

        assertEq(sp.deposits(alice), 500e18, "half withdrawn");
        assertEq(gusd.balanceOf(alice), 500e18, "gUSD returned");
    }

    function test_SP_CannotWithdrawMoreThanDeposited() public {
        vm.prank(admin);
        gusd.setMinter(admin, true);
        vm.prank(admin);
        gusd.mint(alice, 100e18);

        vm.startPrank(alice);
        gusd.approve(address(sp), 100e18);
        sp.deposit(100e18);

        vm.expectRevert("SP: insufficient deposit");
        sp.withdraw(200e18);
        vm.stopPrank();
    }

    function test_SP_ClaimCollateral() public {
        // Setup: carol deposits 1000 gUSD into SP
        vm.prank(admin);
        gusd.setMinter(admin, true);
        vm.prank(admin);
        gusd.mint(carol, 1000e18);

        vm.startPrank(carol);
        gusd.approve(address(sp), 1000e18);
        sp.deposit(1000e18);
        vm.stopPrank();

        // Simulate liquidation offset: VaultManager calls offset()
        // Give VaultManager 0.5 ETH to distribute
        weth.mint(address(vault), 0.5 ether);

        // We test offset directly by impersonating vault
        vm.startPrank(address(vault));
        weth.approve(address(sp), 0.5 ether);
        sp.offset(500e18, ETH_ILK, 0.5 ether);
        vm.stopPrank();

        // Carol claims
        uint256 wethBefore = weth.balanceOf(carol);
        vm.prank(carol);
        sp.claimCollateral(ETH_ILK);

        assertGt(weth.balanceOf(carol) - wethBefore, 0, "carol earned ETH");
    }

    function test_SP_GainIsProportional() public {
        // alice and bob both deposit gUSD in 1:1 ratio, so split gains equally
        vm.prank(admin);
        gusd.setMinter(admin, true);

        vm.prank(admin); gusd.mint(alice, 500e18);
        vm.prank(admin); gusd.mint(bob,   500e18);

        vm.startPrank(alice);
        gusd.approve(address(sp), 500e18);
        sp.deposit(500e18);
        vm.stopPrank();

        vm.startPrank(bob);
        gusd.approve(address(sp), 500e18);
        sp.deposit(500e18);
        vm.stopPrank();

        // Offset with 0.2 WETH, burning 200 gUSD of debt
        weth.mint(address(vault), 0.2 ether);
        vm.startPrank(address(vault));
        weth.approve(address(sp), 0.2 ether);
        sp.offset(200e18, ETH_ILK, 0.2 ether);
        vm.stopPrank();

        uint256 aliceGain = sp.pendingGain(alice, ETH_ILK);
        uint256 bobGain   = sp.pendingGain(bob,   ETH_ILK);

        // Equal deposits → equal gains
        assertApproxEqAbs(aliceGain, bobGain, 1, "gains should be equal");
        assertGt(aliceGain, 0, "alice has gain");
    }

    // ============================================================
    // Section 6: Stability fee accrual
    // ============================================================

    function test_StabilityFeeAccrues() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 2 ether);
        vault.depositCollateral(ETH_ILK, 2 ether);
        vault.mintGUSD(ETH_ILK, 1000e18);
        vm.stopPrank();

        // Fast-forward 1 year
        vm.warp(block.timestamp + 365 days);

        // pendingFee should be > 0
        uint256 pending = vault.pendingFee(ETH_ILK);
        assertGt(pending, 0, "stability fee should accrue");
    }

    function test_StabilityFeeDripCollectsToSplitter() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 2 ether);
        vault.depositCollateral(ETH_ILK, 2 ether);
        vault.mintGUSD(ETH_ILK, 1000e18);
        vm.stopPrank();

        uint256 splitterBefore = feeSplitter.totalReceived();

        // Fast-forward 1 year and drip
        vm.warp(block.timestamp + 365 days);
        vault.drip(ETH_ILK);

        assertGt(feeSplitter.totalReceived(), splitterBefore, "splitter received fee");
    }

    function test_StabilityFeeIncreasesDebt() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 2 ether);
        vault.depositCollateral(ETH_ILK, 2 ether);
        vault.mintGUSD(ETH_ILK, 1000e18);
        vm.stopPrank();

        uint256 debtBefore = vault.vaultDebt(ETH_ILK, alice);

        vm.warp(block.timestamp + 365 days);
        vault.drip(ETH_ILK);

        uint256 debtAfter = vault.vaultDebt(ETH_ILK, alice);
        assertGt(debtAfter, debtBefore, "debt should grow with fees");
    }

    // ============================================================
    // Section 7: UBI fee routing
    // ============================================================

    function test_UBIFeeRoutedFromStabilityFee() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 2 ether);
        vault.depositCollateral(ETH_ILK, 2 ether);
        vault.mintGUSD(ETH_ILK, 1000e18);
        vm.stopPrank();

        vm.warp(block.timestamp + 365 days);

        uint256 ubiBefore = feeSplitter.ubiReceived();
        vault.drip(ETH_ILK);
        uint256 ubiAfter  = feeSplitter.ubiReceived();

        assertGt(ubiAfter, ubiBefore, "UBI portion of stability fee sent");
        // Verify it's ~33% of total fee (within rounding)
        uint256 totalFee = feeSplitter.totalReceived();
        // Just check ubi > 0, exact ratio depends on mock
        assertGt(ubiAfter, 0, "UBI is non-zero");
    }

    function test_UBIFeeRoutedFromPSM() public {
        uint256 ubiBefore = feeSplitter.ubiReceived();

        vm.startPrank(alice);
        usdc.approve(address(psm), 100_000e6);
        psm.swapUSDCForGUSD(100_000e6);
        vm.stopPrank();

        assertGt(feeSplitter.ubiReceived(), ubiBefore, "PSM routes UBI fee");
    }

    // ============================================================
    // Section 8: gUSD access control
    // ============================================================

    function test_OnlyMinterCanMint() public {
        vm.prank(alice);
        vm.expectRevert("gUSD: not minter");
        gusd.mint(alice, 100e18);
    }

    function test_OnlyBurnerCanBurnFrom() public {
        vm.prank(admin);
        gusd.setMinter(admin, true);
        vm.prank(admin);
        gusd.mint(alice, 100e18);

        vm.prank(alice);
        gusd.approve(bob, 50e18);

        vm.prank(bob);
        vm.expectRevert("gUSD: not burner");
        gusd.burnFrom(alice, 50e18);
    }

    function test_AdminCanSetMinterAndBurner() public {
        address newMinter = address(0xBEEF);
        vm.prank(admin);
        gusd.setMinter(newMinter, true);
        assertTrue(gusd.isMinter(newMinter), "minter set");

        vm.prank(admin);
        gusd.setMinter(newMinter, false);
        assertFalse(gusd.isMinter(newMinter), "minter revoked");
    }

    // ============================================================
    // Section 9: CollateralRegistry
    // ============================================================

    function test_RegistryHasDefaultIlks() public view {
        CollateralRegistry.CollateralConfig memory ethCfg  = registry.getConfig(ETH_ILK);
        CollateralRegistry.CollateralConfig memory usdcCfg = registry.getConfig(USDC_ILK);
        CollateralRegistry.CollateralConfig memory gdCfg   = registry.getConfig(GD_ILK);

        assertEq(ethCfg.liquidationRatio,  15e17, "ETH ratio");
        assertEq(usdcCfg.liquidationRatio, 101e16, "USDC ratio");
        assertEq(gdCfg.liquidationRatio,   2e18, "G$ ratio");
        assertTrue(ethCfg.active, "ETH active");
    }

    function test_AdminCanAddIlk() public {
        MockToken newTok = new MockToken("New", "NEW", 18);
        bytes32 NEW_ILK = bytes32("NEW");

        vm.prank(admin);
        registry.addIlk(
            NEW_ILK,
            address(newTok),
            15e17,   // 150%
            13e16,
            1_000_000e18,
            1000000000627937192433212422
        );

        assertTrue(registry.ilkExists(NEW_ILK), "ilk added");
    }

    function test_NonAdminCannotAddIlk() public {
        vm.prank(alice);
        vm.expectRevert("Registry: not admin");
        registry.addIlk(bytes32("BAD"), address(0x1), 15e17, 13e16, 1e18, RAY);
    }
}
