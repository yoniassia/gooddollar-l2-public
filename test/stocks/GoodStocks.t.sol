// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/stocks/PriceOracle.sol";
import "../../src/stocks/SyntheticAsset.sol";
import "../../src/stocks/SyntheticAssetFactory.sol";
import "../../src/stocks/CollateralVault.sol";
import "../../src/GoodDollarToken.sol";

// ============ Mock Chainlink Feed ============

contract MockChainlinkFeed {
    int256 public price;
    uint256 public updatedAt;
    uint8 public constant decimals = 8;

    constructor(int256 _price) {
        price = _price;
        updatedAt = block.timestamp;
    }

    function setPrice(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, price, block.timestamp, updatedAt, 1);
    }
}

// ============ Mock Fee Splitter ============

contract MockFeeSplitter {
    GoodDollarToken public immutable token;
    uint256 public totalReceived;

    constructor(address _token) {
        token = GoodDollarToken(_token);
    }

    function splitFee(uint256 totalFee, address) external returns (uint256, uint256, uint256) {
        if (totalFee > 0) {
            token.transferFrom(msg.sender, address(this), totalFee);
        }
        totalReceived += totalFee;
        return (totalFee / 3, totalFee / 6, totalFee / 2);
    }
}

// ============ Test Suite ============

contract GoodStocksTest is Test {
    PriceOracle public oracle;
    SyntheticAssetFactory public factory;
    CollateralVault public vault;
    GoodDollarToken public gd;
    MockFeeSplitter public feeSplitter;
    MockChainlinkFeed public aaplFeed;
    SyntheticAsset public sAAPL;

    address public admin = address(0xAD);
    address public alice = address(0xA1);
    address public bob = address(0xB0);

    // AAPL @ $175.00 with 8 decimal Chainlink = 17500000000
    int256 constant AAPL_PRICE = 17_500_000_000; // $175.00
    uint256 constant AAPL_PRICE_U = 17_500_000_000;

    uint256 constant INITIAL_SUPPLY = 10_000_000e18;

    function setUp() public {
        // Deploy G$
        gd = new GoodDollarToken(admin, admin, INITIAL_SUPPLY);

        // Deploy mock Chainlink feed: AAPL @ $175
        aaplFeed = new MockChainlinkFeed(AAPL_PRICE);

        // Deploy oracle
        oracle = new PriceOracle(admin);
        vm.prank(admin);
        oracle.registerFeed("AAPL", address(aaplFeed));

        // Deploy fee splitter mock
        feeSplitter = new MockFeeSplitter(address(gd));

        // Deploy vault
        vault = new CollateralVault(address(gd), address(oracle), address(feeSplitter), admin);

        // Deploy factory and list AAPL
        factory = new SyntheticAssetFactory(admin);
        vm.prank(admin);
        address sAAPLAddr = factory.listAsset("AAPL", "Apple Inc. Synthetic", address(vault));
        sAAPL = SyntheticAsset(sAAPLAddr);

        // Register asset in vault
        vm.prank(admin);
        vault.registerAsset("AAPL", sAAPLAddr);

        // Fund alice and bob
        vm.prank(admin);
        gd.transfer(alice, 1_000_000e18);
        vm.prank(admin);
        gd.transfer(bob, 1_000_000e18);

        // Approve vault
        vm.prank(alice);
        gd.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        gd.approve(address(vault), type(uint256).max);
    }

    // ============ PriceOracle Tests ============

    function test_oracle_getPrice() public view {
        uint256 price = oracle.getPrice("AAPL");
        assertEq(price, AAPL_PRICE_U);
    }

    function test_oracle_manualPriceOverride() public {
        vm.prank(admin);
        oracle.setManualPrice("AAPL", 18_000_000_000, true);
        assertEq(oracle.getPrice("AAPL"), 18_000_000_000);
    }

    function test_oracle_manualPriceDisable() public {
        vm.prank(admin);
        oracle.setManualPrice("AAPL", 18_000_000_000, true);
        vm.prank(admin);
        oracle.setManualPrice("AAPL", 0, false);
        assertEq(oracle.getPrice("AAPL"), AAPL_PRICE_U);
    }

    function test_oracle_stalePrice_reverts() public {
        // Warp to a future timestamp so subtraction doesn't underflow
        vm.warp(block.timestamp + 10 hours);
        // Set updatedAt to 9 hours ago (beyond 1h maxAge)
        aaplFeed.setUpdatedAt(block.timestamp - 9 hours);
        vm.expectRevert();
        oracle.getPrice("AAPL");
    }

    function test_oracle_feedNotFound_reverts() public {
        vm.expectRevert();
        oracle.getPrice("MSFT");
    }

    function test_oracle_negativePrice_reverts() public {
        aaplFeed.setPrice(-1);
        vm.expectRevert();
        oracle.getPrice("AAPL");
    }

    function test_oracle_removeFeed() public {
        vm.prank(admin);
        oracle.removeFeed("AAPL");
        assertFalse(oracle.hasFeed("AAPL"));
    }

    function test_oracle_onlyAdmin_registerFeed() public {
        vm.prank(alice);
        vm.expectRevert(PriceOracle.NotAdmin.selector);
        oracle.registerFeed("MSFT", address(aaplFeed));
    }

    // ============ SyntheticAsset Tests ============

    function test_syntheticAsset_onlyMinterCanMint() public {
        vm.prank(alice);
        vm.expectRevert(SyntheticAsset.NotMinter.selector);
        sAAPL.mint(alice, 1e18);
    }

    function test_syntheticAsset_onlyMinterCanBurn() public {
        // First mint some via vault path
        vm.prank(alice);
        vault.depositCollateral("AAPL", 100_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 1e18); // 1 share

        vm.prank(alice);
        vm.expectRevert(SyntheticAsset.NotMinter.selector);
        sAAPL.burn(alice, 1e18);
    }

    function test_syntheticAsset_transfer() public {
        // Mint via vault
        vm.prank(alice);
        vault.depositCollateral("AAPL", 100_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 1e18);

        vm.prank(alice);
        sAAPL.transfer(bob, 1e18);
        assertEq(sAAPL.balanceOf(bob), 1e18);
        assertEq(sAAPL.balanceOf(alice), 0);
    }

    // ============ SyntheticAssetFactory Tests ============

    function test_factory_listAsset() public {
        vm.prank(admin);
        address sMSFT = factory.listAsset("MSFT", "Microsoft Synthetic", address(vault));
        assertEq(factory.getAsset("MSFT"), sMSFT);
        assertEq(factory.listedCount(), 2); // AAPL + MSFT
    }

    /// @dev listAsset() must stay under 500 k gas (the default call gas limit
    ///      that triggered GOO-176).  The EIP-1167 clone approach keeps it
    ///      comfortably below that threshold.
    function test_factory_listAsset_gasUnder500k() public {
        vm.prank(admin);
        uint256 gasBefore = gasleft();
        factory.listAsset("TSLA", "Tesla Synthetic", address(vault));
        uint256 gasUsed = gasBefore - gasleft();
        assertLt(gasUsed, 500_000, "listAsset() exceeded 500k gas");
    }

    function test_factory_alreadyListed_reverts() public {
        vm.prank(admin);
        vm.expectRevert();
        factory.listAsset("AAPL", "Duplicate", address(vault));
    }

    function test_factory_delistAsset() public {
        vm.prank(admin);
        factory.delistAsset("AAPL");
        assertEq(factory.getAsset("AAPL"), address(0));
        assertEq(factory.listedCount(), 0);
    }

    function test_factory_onlyAdmin_list() public {
        vm.prank(alice);
        vm.expectRevert(SyntheticAssetFactory.NotAdmin.selector);
        factory.listAsset("TSLA", "Tesla Synthetic", address(vault));
    }

    // ============ CollateralVault: Deposit / Withdraw ============

    function test_vault_depositCollateral() public {
        uint256 aliceBefore = gd.balanceOf(alice);
        vm.prank(alice);
        vault.depositCollateral("AAPL", 50_000e18);

        assertEq(gd.balanceOf(alice), aliceBefore - 50_000e18);
        assertEq(gd.balanceOf(address(vault)), 50_000e18);
        assertEq(vault.collateral(alice, keccak256("AAPL")), 50_000e18);
    }

    function test_vault_depositCollateral_revertsZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.depositCollateral("AAPL", 0);
    }

    function test_vault_depositCollateral_revertsUnregistered() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.depositCollateral("TSLA", 1000e18);
    }

    function test_vault_withdrawCollateral_noDebt() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 50_000e18);

        uint256 aliceBefore = gd.balanceOf(alice);
        vm.prank(alice);
        vault.withdrawCollateral("AAPL", 50_000e18);

        assertEq(gd.balanceOf(alice), aliceBefore + 50_000e18);
        assertEq(vault.collateral(alice, keccak256("AAPL")), 0);
    }

    function test_vault_withdrawCollateral_tooMuch_reverts() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 50_000e18);

        vm.prank(alice);
        vm.expectRevert();
        vault.withdrawCollateral("AAPL", 50_001e18);
    }

    // ============ CollateralVault: Mint ============

    function test_vault_mint_basicFlow() public {
        // AAPL @ $175. 1 share = $175. 150% CR = $262.50 collateral.
        // 1 G$ ≈ $1. So need ~262.5 G$ plus 0.3% fee.
        // Fee = 0.3% of $175 = $0.525 = 0.525 G$
        // Total: ~263.025 G$

        vm.prank(alice);
        vault.depositCollateral("AAPL", 1_000e18); // $1000 of collateral

        uint256 sAAPLBefore = sAAPL.balanceOf(alice);

        vm.prank(alice);
        vault.mint("AAPL", 1e18); // 1 share @ $175

        assertEq(sAAPL.balanceOf(alice), sAAPLBefore + 1e18);
        assertEq(vault.debt(alice, keccak256("AAPL")), 1e18);
    }

    function test_vault_mint_insufficientCollateral_reverts() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 100e18); // Only $100 — not enough for 1 share @ 150%

        vm.prank(alice);
        vm.expectRevert();
        vault.mint("AAPL", 1e18); // Need ~263 G$
    }

    function test_vault_mint_zeroAmount_reverts() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 1000e18);

        vm.prank(alice);
        vm.expectRevert(CollateralVault.ZeroAmount.selector);
        vault.mint("AAPL", 0);
    }

    function test_vault_mint_feeRouted() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 1_000e18);

        uint256 splitterBefore = gd.balanceOf(address(feeSplitter));

        vm.prank(alice);
        vault.mint("AAPL", 1e18);

        // Fee = 0.3% of $175 = 0.525 G$ = 525000000000000000 wei
        assertGt(gd.balanceOf(address(feeSplitter)), splitterBefore);
    }

    function test_vault_collateralRatio_afterMint() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 10_000e18);

        vm.prank(alice);
        vault.mint("AAPL", 10e18); // 10 shares @ $175 = $1750 position

        uint256 ratio = vault.getCollateralRatio(alice, "AAPL");
        // 10_000 G$ / $1750 in G$ = ~571% — well above 150%
        assertGt(ratio, 15000); // > 150%
    }

    // ============ CollateralVault: Burn ============

    function test_vault_burn_returnsCollateral() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 2_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 2e18); // 2 shares

        uint256 aliceGBefore = gd.balanceOf(alice);
        uint256 sAAPLBefore = sAAPL.balanceOf(alice);

        vm.prank(alice);
        vault.burn("AAPL", 1e18); // burn 1 share

        // Should get back ~half the collateral, minus fee
        assertEq(sAAPL.balanceOf(alice), sAAPLBefore - 1e18);
        assertGt(gd.balanceOf(alice), aliceGBefore); // collateral returned
    }

    function test_vault_burn_full_clearPosition() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 2_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 2e18);

        vm.prank(alice);
        vault.burn("AAPL", 2e18); // burn all

        assertEq(vault.debt(alice, keccak256("AAPL")), 0);
    }

    function test_vault_burn_tooMuch_reverts() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 2_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 1e18);

        vm.prank(alice);
        vm.expectRevert();
        vault.burn("AAPL", 2e18); // more than debt
    }

    // ============ CollateralVault: Liquidation ============

    function test_vault_liquidate_undercollateralized() public {
        // Alice opens a position barely above 150% CR
        vm.prank(alice);
        vault.depositCollateral("AAPL", 350e18); // $350 for 1 share @ $175 = 200% CR
        vm.prank(alice);
        vault.mint("AAPL", 1e18); // 1 share

        // Price crashes: AAPL from $175 to $300 (CR drops below 120%)
        // Alice's collateral ≈ 349.475 G$ (after 0.525 G$ mint fee)
        // New CR = 349.475 / 300 ≈ 116.5% < 120% → liquidatable
        aaplFeed.setPrice(30_000_000_000); // $300

        // Bob acquires sAAPL to liquidate Alice
        vm.prank(bob);
        vault.depositCollateral("AAPL", 10_000e18);
        vm.prank(bob);
        vault.mint("AAPL", 1e18);

        uint256 bobGBefore = gd.balanceOf(bob);
        uint256 feeSplitterBefore = gd.balanceOf(address(feeSplitter));
        uint256 aliceCollateral = vault.collateral(alice, keccak256("AAPL"));

        vm.prank(bob);
        vault.liquidate(alice, "AAPL");

        // Bob burned 1 sAAPL worth $300. He should receive:
        //   debtValue = 300 G$  +  10% bonus = 30 G$  → 330 G$ total
        uint256 debtValueG = 300e18;
        uint256 expectedReward = debtValueG + (debtValueG * 1000) / 10000; // 330 G$
        assertGe(gd.balanceOf(bob), bobGBefore + expectedReward - 1e9);

        // Remaining collateral (aliceCollateral - 330) went to fee splitter
        uint256 expectedRemaining = aliceCollateral > expectedReward
            ? aliceCollateral - expectedReward
            : 0;
        assertGe(
            gd.balanceOf(address(feeSplitter)),
            feeSplitterBefore + expectedRemaining - 1e9
        );

        // Alice's position cleared
        assertEq(vault.debt(alice, keccak256("AAPL")), 0);
        assertEq(vault.collateral(alice, keccak256("AAPL")), 0);
    }

    function test_vault_liquidate_noDebt_reverts() public {
        // Alice deposits collateral but never mints — must not be liquidatable
        vm.prank(alice);
        vault.depositCollateral("AAPL", 100e18);

        vm.prank(bob);
        vm.expectRevert();
        vault.liquidate(alice, "AAPL");
    }

    function test_vault_liquidate_healthyPosition_reverts() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 1_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 1e18);

        // CR is ~571% — healthy
        vm.prank(bob);
        vm.expectRevert();
        vault.liquidate(alice, "AAPL");
    }

    // ============ Pause ============

    function test_vault_paused_blocksAll() public {
        vm.prank(admin);
        vault.setPaused(true);

        vm.prank(alice);
        vm.expectRevert(CollateralVault.Paused.selector);
        vault.depositCollateral("AAPL", 1000e18);
    }

    // ============ Getters ============

    function test_vault_getPosition() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 2_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 2e18);

        (uint256 userCollateral, uint256 userDebt, uint256 ratio) = vault.getPosition(alice, "AAPL");
        assertEq(userDebt, 2e18);
        assertGt(userCollateral, 0);
        assertGt(ratio, 15000);
    }

    function test_vault_getPosition_noDebt() public view {
        (, uint256 userDebt, uint256 ratio) = vault.getPosition(alice, "AAPL");
        assertEq(userDebt, 0);
        assertEq(ratio, type(uint256).max);
    }

    // ============ withdrawCollateral with debt ============

    function test_vault_withdrawCollateral_withDebt_belowMin_reverts() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 1_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 1e18); // 1 share @ $175, needs ~262 G$ at 150%

        // Try to withdraw almost everything — would leave ratio < 150%
        vm.prank(alice);
        vm.expectRevert();
        vault.withdrawCollateral("AAPL", 900e18);
    }

    function test_vault_withdrawCollateral_withDebt_above150_succeeds() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 10_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 1e18); // Need ~263 G$ at 150% CR

        // Withdraw 9000 G$ — still plenty of collateral for 1 share
        vm.prank(alice);
        vault.withdrawCollateral("AAPL", 9_000e18);

        // Should still be above 150% CR
        uint256 ratio = vault.getCollateralRatio(alice, "AAPL");
        assertGe(ratio, 15000);
    }

    // ============ GOO-177: depositAndMint + getMintRequirements ============

    /**
     * @dev depositAndMint combines deposit + mint so the full flow can be
     *      simulated as a single eth_call (fixing false InsufficientCollateral
     *      reverts that occurred when simulating the two calls separately).
     */
    function test_vault_depositAndMint_basicFlow() public {
        uint256 aliceGBefore = gd.balanceOf(alice);
        uint256 sAAPLBefore = sAAPL.balanceOf(alice);

        vm.prank(alice);
        vault.depositAndMint("AAPL", 1_000e18, 1e18); // deposit 1000, mint 1 share

        assertEq(sAAPL.balanceOf(alice), sAAPLBefore + 1e18);
        assertEq(vault.debt(alice, keccak256("AAPL")), 1e18);
        assertEq(vault.collateral(alice, keccak256("AAPL")), 1_000e18);
        // Alice paid 1000 G$ collateral + 0.525 G$ fee from wallet
        assertLt(gd.balanceOf(alice), aliceGBefore - 1_000e18);
    }

    function test_vault_depositAndMint_mintOnly_zeroCollateral() public {
        // Pre-deposit collateral separately, then use depositAndMint with zero collateral
        vm.prank(alice);
        vault.depositCollateral("AAPL", 1_000e18);

        vm.prank(alice);
        vault.depositAndMint("AAPL", 0, 1e18); // mint against existing collateral

        assertEq(sAAPL.balanceOf(alice), 1e18);
        assertEq(vault.debt(alice, keccak256("AAPL")), 1e18);
    }

    function test_vault_depositAndMint_insufficientCollateral_reverts() public {
        // 100 G$ is not enough for 1 share at $175 (needs ~262.5 G$ at 150% CR)
        vm.prank(alice);
        vm.expectRevert();
        vault.depositAndMint("AAPL", 100e18, 1e18);
    }

    function test_vault_depositAndMint_emitsCollateralDepositedAndMinted() public {
        bytes32 key = keccak256(abi.encodePacked("AAPL"));

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit CollateralVault.CollateralDeposited(alice, key, 1_000e18);
        vault.depositAndMint("AAPL", 1_000e18, 1e18);
    }

    // getMintRequirements view function: allows simulating deposit+mint as single eth_call

    function test_getMintRequirements_noExistingPosition() public view {
        // AAPL @ $175, 1 share
        (uint256 reqCol, uint256 fee, uint256 avail, bool canMint) =
            vault.getMintRequirements(alice, "AAPL", 1e18, 0);

        // requiredCollateral = 262.5 G$
        assertEq(reqCol, 262_500_000_000_000_000_000);
        // fee = 0.3% of 175 G$ = 0.525 G$
        assertEq(fee, 525_000_000_000_000_000);
        // alice has no collateral deposited
        assertEq(avail, 0);
        assertFalse(canMint);
    }

    function test_getMintRequirements_withAdditionalCollateral() public view {
        // Simulate depositing 1000 G$ before minting
        (uint256 reqCol,, uint256 avail, bool canMint) =
            vault.getMintRequirements(alice, "AAPL", 1e18, 1_000e18);

        // With 1000 G$ pending, alice should be able to mint
        assertEq(avail, 1_000e18);
        assertGe(avail, reqCol);
        assertTrue(canMint);
    }

    function test_getMintRequirements_withExistingCollateral() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 1_000e18);

        (uint256 reqCol,, uint256 avail, bool canMint) =
            vault.getMintRequirements(alice, "AAPL", 1e18, 0);

        assertGe(avail, reqCol);
        assertTrue(canMint);
    }

    function test_getMintRequirements_accountsForExistingDebt() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 1_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 3e18); // 3 shares @ $175 = $525 value, needs 787.5 G$

        // Alice has 1000 G$ deposited, 787.5 G$ committed to 3 shares
        // Available = 212.5 G$; need 262.5 G$ for 1 more share
        (uint256 reqCol,, uint256 avail, bool canMint) =
            vault.getMintRequirements(alice, "AAPL", 1e18, 0);

        assertLt(avail, reqCol);
        assertFalse(canMint);
    }

    function test_getMintRequirements_canMintWithPendingDeposit() public {
        vm.prank(alice);
        vault.depositCollateral("AAPL", 1_000e18);
        vm.prank(alice);
        vault.mint("AAPL", 3e18);
        // After 3 shares @ $175: alreadyUsed = 787.5 G$, available = 212.5 G$
        // 1 more share needs 262.5 G$ → need at least 50 G$ more

        // 30 G$ additional → available = 242.5 G$ < 262.5 G$ → still can't mint
        (, , , bool canMint30) = vault.getMintRequirements(alice, "AAPL", 1e18, 30e18);
        assertFalse(canMint30);

        // 100 G$ additional → available = 312.5 G$ >= 262.5 G$ → can mint
        (, , , bool canMint100) = vault.getMintRequirements(alice, "AAPL", 1e18, 100e18);
        assertTrue(canMint100);
    }
}
