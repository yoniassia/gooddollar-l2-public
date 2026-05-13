// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/perps/MarginVault.sol";
import "../../src/perps/FundingRate.sol";
import "../../src/perps/PerpEngine.sol";
import "../../src/GoodDollarToken.sol";
import "../../src/stocks/PriceOracle.sol";

// ============ Mock Chainlink Feed for Perps ============

contract MockPerpFeed {
    int256 public price;

    constructor(int256 _price) {
        price = _price;
    }

    function setPrice(int256 _price) external {
        price = _price;
    }

    function decimals() external pure returns (uint8) { return 8; }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
}

// ============ Mock Fee Splitter for Perps ============

contract MockPerpFeeSplitter {
    GoodDollarToken public immutable token;
    uint256 public totalReceived;

    constructor(address _token) {
        token = GoodDollarToken(_token);
    }

    function splitFee(uint256 totalFee, address) external returns (uint256, uint256, uint256) {
        token.transferFrom(msg.sender, address(this), totalFee);
        totalReceived += totalFee;
        return (totalFee / 3, totalFee / 6, totalFee / 2);
    }
}

contract GoodPerpsTest is Test {
    GoodDollarToken public gd;
    PriceOracle public oracle;
    MarginVault public vault;
    FundingRate public fundingRate;
    PerpEngine public engine;
    MockPerpFeed public btcFeed;
    MockPerpFeed public btcIndexFeed;
    MockPerpFeeSplitter public feeSplitter;

    address public admin = address(0xAD);
    address public alice = address(0xA1);
    address public bob = address(0xB0);

    uint256 constant INITIAL_SUPPLY = 100_000_000e18;
    // BTC @ $50,000 with 8 decimal Chainlink = 5_000_000_000_000
    int256 constant BTC_PRICE = 5_000_000_000_000; // $50,000
    uint256 constant BTC_PRICE_U = 5_000_000_000_000;

    bytes32 public btcKey;
    bytes32 public btcIndexKey;
    uint256 public btcMarketId;

    function setUp() public {
        // Deploy G$
        gd = new GoodDollarToken(admin, admin, INITIAL_SUPPLY);

        // Deploy oracle with BTC mark and index feeds
        oracle = new PriceOracle(admin);
        btcFeed = new MockPerpFeed(BTC_PRICE);
        btcIndexFeed = new MockPerpFeed(BTC_PRICE); // starts at same price; diverged in specific tests
        vm.prank(admin);
        oracle.registerFeed("BTC", address(btcFeed));
        vm.prank(admin);
        oracle.registerFeed("BTC_INDEX", address(btcIndexFeed));
        btcKey = keccak256(abi.encodePacked("BTC"));
        btcIndexKey = keccak256(abi.encodePacked("BTC_INDEX"));

        // Deploy fee splitter mock
        feeSplitter = new MockPerpFeeSplitter(address(gd));

        // Deploy vault, funding, engine
        vault = new MarginVault(address(gd), admin);
        fundingRate = new FundingRate(admin);
        engine = new PerpEngine(
            address(vault),
            address(fundingRate),
            address(oracle),
            address(feeSplitter),
            admin
        );

        // Wire up
        vm.prank(admin);
        vault.setPerpEngine(address(engine));
        vm.prank(admin);
        fundingRate.setPerpEngine(address(engine));

        // Create BTC-PERP market (50x max leverage); mark=btcKey, index=btcIndexKey
        vm.prank(admin);
        btcMarketId = engine.createMarket(btcKey, btcIndexKey, 50);

        // Fund alice and bob
        vm.prank(admin);
        gd.transfer(alice, 10_000_000e18);
        vm.prank(admin);
        gd.transfer(bob, 10_000_000e18);

        // Approve vault
        vm.prank(alice);
        gd.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        gd.approve(address(vault), type(uint256).max);
    }

    // ============ MarginVault Tests ============

    function test_vault_deposit() public {
        vm.prank(alice);
        vault.deposit(100_000e18);
        assertEq(vault.balances(alice), 100_000e18);
        assertEq(vault.totalDeposited(), 100_000e18);
    }

    function test_vault_withdraw() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        uint256 aliceBefore = gd.balanceOf(alice);
        vm.prank(alice);
        vault.withdraw(50_000e18);

        assertEq(gd.balanceOf(alice), aliceBefore + 50_000e18);
        assertEq(vault.balances(alice), 50_000e18);
    }

    function test_vault_withdraw_tooMuch_reverts() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(100_001e18);
    }

    function test_vault_debit_onlyEngine() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice); // not the engine
        vm.expectRevert(MarginVault.NotEngine.selector);
        vault.debit(alice, 1000e18);
    }

    function test_vault_credit_onlyEngine() public {
        vm.prank(alice);
        vm.expectRevert(MarginVault.NotEngine.selector);
        vault.credit(alice, 1000e18);
    }

    function test_vault_zeroDeposit_reverts() public {
        vm.prank(alice);
        vm.expectRevert(MarginVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    // ============ FundingRate Tests ============

    function test_fundingRate_noFundingBeforeInterval() public {
        vm.prank(address(engine));
        int256 rate = fundingRate.applyFunding(btcMarketId, BTC_PRICE_U, BTC_PRICE_U);
        assertEq(rate, 0); // No interval has passed yet (just initialized)
    }

    function test_fundingRate_appliesAfterInterval() public {
        // Warp past 8 hours
        vm.warp(block.timestamp + 8 hours + 1);

        // Mark above index = longs pay shorts
        uint256 markPrice = BTC_PRICE_U + (BTC_PRICE_U / 100); // 1% premium
        vm.prank(address(engine));
        int256 rate = fundingRate.applyFunding(btcMarketId, markPrice, BTC_PRICE_U);
        assertGt(rate, 0); // Positive = longs pay
    }

    function test_fundingRate_clampedToMaxRate() public {
        vm.warp(block.timestamp + 8 hours + 1);

        // 10% premium — should be clamped
        uint256 markPrice = BTC_PRICE_U + (BTC_PRICE_U / 10);
        vm.prank(address(engine));
        int256 rate = fundingRate.applyFunding(btcMarketId, markPrice, BTC_PRICE_U);
        assertEq(rate, fundingRate.MAX_FUNDING_RATE());
    }

    function test_fundingRate_negativePremium() public {
        vm.warp(block.timestamp + 8 hours + 1);

        // Mark below index = shorts pay longs
        uint256 markPrice = BTC_PRICE_U - (BTC_PRICE_U / 100);
        vm.prank(address(engine));
        int256 rate = fundingRate.applyFunding(btcMarketId, markPrice, BTC_PRICE_U);
        assertLt(rate, 0);
    }

    function test_accruedFunding_longPaysDuringPremium() public {
        int256 entryIndex = fundingRate.cumulativeFundingIndex(btcMarketId);

        // Apply positive funding
        vm.warp(block.timestamp + 8 hours + 1);
        uint256 markPrice = BTC_PRICE_U + (BTC_PRICE_U / 1000); // 0.1% premium
        vm.prank(address(engine));
        fundingRate.applyFunding(btcMarketId, markPrice, BTC_PRICE_U);

        // Long position: should pay (positive accrued funding)
        int256 longFunding = fundingRate.accruedFunding(
            int256(100_000e18), // long 100k
            entryIndex,
            btcMarketId
        );
        assertGt(longFunding, 0); // Long pays

        // Short position: should receive (negative accrued funding)
        int256 shortFunding = fundingRate.accruedFunding(
            -int256(100_000e18), // short 100k
            entryIndex,
            btcMarketId
        );
        assertLt(shortFunding, 0); // Short receives
    }

    // GOO-470: lastFundingTime must advance by FUNDING_INTERVAL (not to block.timestamp)
    // so that N skipped intervals are each settled on successive applyFunding calls.
    function test_fundingRate_multipleSkippedIntervals_settleInSuccessiveCalls() public {
        uint256 interval = fundingRate.FUNDING_INTERVAL();
        uint256 markPrice = BTC_PRICE_U + (BTC_PRICE_U / 1000); // 0.1% premium

        // Warp 3 full intervals forward
        vm.warp(block.timestamp + 3 * interval + 1);

        // Call 1: settles interval 1, lastFundingTime advances by one interval
        vm.prank(address(engine));
        int256 rate1 = fundingRate.applyFunding(btcMarketId, markPrice, BTC_PRICE_U);
        assertGt(rate1, 0);

        // Call 2 immediately after: still eligible (2 more intervals remain)
        vm.prank(address(engine));
        int256 rate2 = fundingRate.applyFunding(btcMarketId, markPrice, BTC_PRICE_U);
        assertGt(rate2, 0);

        // Call 3: still eligible (1 more interval remains)
        vm.prank(address(engine));
        int256 rate3 = fundingRate.applyFunding(btcMarketId, markPrice, BTC_PRICE_U);
        assertGt(rate3, 0);

        // All 3 intervals settled — cumulative index is 3× the single-interval rate
        int256 cumulative = fundingRate.cumulativeFundingIndex(btcMarketId);
        assertEq(cumulative, rate1 + rate2 + rate3);

        // Call 4: no more intervals elapsed, must return 0
        vm.prank(address(engine));
        int256 rate4 = fundingRate.applyFunding(btcMarketId, markPrice, BTC_PRICE_U);
        assertEq(rate4, 0);
    }

    // ============ PerpEngine Tests ============

    function test_engine_openLongPosition() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        // Open 10x long: $100k notional with $10k margin
        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        (bool isOpen, bool isLong, uint256 size, uint256 entryPrice,,, uint256 mId) =
            _getPosition(alice, btcMarketId);

        assertTrue(isOpen);
        assertTrue(isLong);
        assertEq(size, 100_000e18);
        assertEq(entryPrice, BTC_PRICE_U);
        assertEq(mId, btcMarketId);
    }

    function test_engine_openShortPosition() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 50_000e18, false, 5_000e18);

        (, bool isLong,,,,,) = _getPosition(alice, btcMarketId);
        assertFalse(isLong);
    }

    function test_engine_openPosition_insufficientMargin_reverts() public {
        vm.prank(alice);
        vault.deposit(1_000e18); // only $1k

        // Try to open $100k with $10k margin — don't have enough deposited
        vm.prank(alice);
        vm.expectRevert();
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);
    }

    function test_engine_openPosition_leverageTooHigh_reverts() public {
        vm.prank(alice);
        vault.deposit(1_000_000e18);

        // 60x leverage on a 50x max market
        vm.prank(alice);
        vm.expectRevert();
        engine.openPosition(btcMarketId, 60_000e18, true, 1_000e18); // 60x > 50x
    }

    // GOO-468: size/margin integer division truncates down, allowing real leverage > maxLeverage.
    // Regression: size = maxLeverage * margin + (margin - 1) gives lev = maxLeverage under old check.
    // New check (size > margin * maxLeverage) must catch this.
    function test_engine_openPosition_truncationBypass_reverts() public {
        vm.prank(alice);
        vault.deposit(1_000_000e18);

        // maxLeverage = 50, margin = 1000e18
        // size = 50 * 1000e18 + 999e18 = 50_999e18
        // old check: 50_999e18 / 1000e18 = 50 (truncates) — old code would PASS (bug)
        // new check: 50_999e18 > 50 * 1000e18 = 50_000e18 — correctly REVERTS
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PerpEngine.LeverageTooHigh.selector, uint256(50), uint256(50)));
        engine.openPosition(btcMarketId, 50_999e18, true, 1_000e18);
    }

    // Boundary: exactly maxLeverage must be allowed.
    function test_engine_openPosition_exactMaxLeverage_succeeds() public {
        vm.prank(alice);
        vault.deposit(1_000_000e18);

        // size = 50 * 1000e18 = exactly 50x — should succeed
        vm.prank(alice);
        engine.openPosition(btcMarketId, 50_000e18, true, 1_000e18);
        (bool isOpen,,,,,, ) = _getPosition(alice, btcMarketId);
        assertTrue(isOpen);
    }

    function test_engine_cannotOpenTwoPositions_sameMarket() public {
        vm.prank(alice);
        vault.deposit(1_000_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        vm.prank(alice);
        vm.expectRevert(PerpEngine.PositionAlreadyOpen.selector);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);
    }

    function test_engine_closeLong_withProfit() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        // BTC goes from $50k to $55k (+10%)
        btcFeed.setPrice(int256(BTC_PRICE_U + BTC_PRICE_U / 10));

        uint256 balBefore = vault.balances(alice);
        vm.prank(alice);
        engine.closePosition(btcMarketId);

        // PnL = 100k * 10% = 10k profit
        // Margin returned = 10k, fee = 100, so net = 10k - fee + 10k profit ≈ ~20k
        assertGt(vault.balances(alice), balBefore + 9_000e18);
    }

    function test_engine_closeLong_withLoss() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        // Capture balance before open so we can compare after full close cycle
        uint256 balBeforeOpen = vault.balances(alice);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        // BTC drops from $50k to $45k (-10%)
        btcFeed.setPrice(int256(BTC_PRICE_U - BTC_PRICE_U / 10));

        vm.prank(alice);
        engine.closePosition(btcMarketId);

        // PnL = -10k loss = full margin wipe. Net vault balance < pre-open balance.
        assertLt(vault.balances(alice), balBeforeOpen);
    }

    function test_engine_closeShort_withProfit() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, false, 10_000e18); // short

        // BTC drops from $50k to $45k (-10%)
        btcFeed.setPrice(int256(BTC_PRICE_U - BTC_PRICE_U / 10));

        uint256 balBefore = vault.balances(alice);
        vm.prank(alice);
        engine.closePosition(btcMarketId);

        assertGt(vault.balances(alice), balBefore + 9_000e18);
    }

    function test_engine_unrealizedPnL_long() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        // Price up 5%
        btcFeed.setPrice(int256(BTC_PRICE_U + BTC_PRICE_U / 20));

        int256 pnl = engine.unrealizedPnL(alice, btcMarketId);
        // 100k * 5% = 5k profit
        assertGt(pnl, 4_900e18);
        assertLt(pnl, 5_100e18);
    }

    function test_engine_marginRatio_decreasesOnLoss() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18); // 10x

        // Price drops 8% → margin ratio ≈ 2%
        btcFeed.setPrice(int256(BTC_PRICE_U - (BTC_PRICE_U * 8 / 100)));

        uint256 ratio = engine.marginRatio(alice, btcMarketId);
        // Remaining margin ≈ 10k - 8k = 2k; ratio = 2k/100k = 2%
        assertLe(ratio, 300); // should be around 200 BPS
    }

    function test_engine_liquidate_underwater() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18); // 10x

        // Price drops 9% → margin ratio ~1% < 2% maintenance
        btcFeed.setPrice(int256(BTC_PRICE_U - (BTC_PRICE_U * 9 / 100)));

        uint256 bobBefore = vault.balances(bob);

        vm.prank(bob);
        engine.liquidate(alice, btcMarketId);

        // Bob should have received liquidation bonus
        assertGt(vault.balances(bob), bobBefore);

        // Alice position should be closed
        (bool isOpen,,,,,,) = _getPosition(alice, btcMarketId);
        assertFalse(isOpen);
    }

    function test_engine_liquidate_bonusNotDoubleDeducted() public {
        // Regression test: bonus must come from returned margin, not double-deducted.
        // Fix: _closePosition first (credits remaining margin), then vault.transfer(bonus).
        vm.prank(alice);
        vault.deposit(100_000e18);

        uint256 aliceVaultBefore = vault.balances(alice);
        uint256 bobVaultBefore = vault.balances(bob);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18); // 10x long

        // fee = 100_000e18 * 10 / 10000 = 100e18
        uint256 fee = 100e18;

        // Price drops 9% => pnl ~= -9000e18, remainingMargin ~= 1000e18
        // bonus = 1000e18 * 500 / 10000 = 50e18
        btcFeed.setPrice(int256(BTC_PRICE_U - (BTC_PRICE_U * 9 / 100)));

        uint256 aliceAfterFee = aliceVaultBefore - fee;

        vm.prank(bob);
        engine.liquidate(alice, btcMarketId);

        uint256 aliceVaultAfter = vault.balances(alice);
        uint256 bobGained = vault.balances(bob) - bobVaultBefore;

        // Alice should have lost: fee + |pnl| + bonus (no double-counting)
        // Expected: aliceAfterFee - 9000e18 - 50e18 = 90_850e18
        uint256 expectedAlice = aliceAfterFee - 9_000e18 - 50e18;
        assertEq(aliceVaultAfter, expectedAlice, "alice lost more than fee+pnl+bonus");

        // Bob should have received exactly the bonus
        assertEq(bobGained, 50e18, "bob did not receive correct bonus");
    }

    function test_engine_liquidate_healthyPosition_reverts() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        // No price change — position is healthy at 10% CR
        vm.prank(bob);
        vm.expectRevert();
        engine.liquidate(alice, btcMarketId);
    }

    function test_engine_closePosition_noPosition_reverts() public {
        vm.prank(alice);
        vm.expectRevert(PerpEngine.NoOpenPosition.selector);
        engine.closePosition(btcMarketId);
    }

    function test_engine_paused_blocksTrading() public {
        vm.prank(admin);
        engine.setPaused(true);

        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        vm.expectRevert(PerpEngine.Paused.selector);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);
    }

    function test_engine_openInterestTracked() public {
        vm.prank(alice);
        vault.deposit(1_000_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 200_000e18, true, 20_000e18);

        (,,, bool active, uint256 oi_long, uint256 oi_short) = _getMarket(btcMarketId);
        assertEq(oi_long, 200_000e18);
        assertEq(oi_short, 0);

        vm.prank(alice);
        engine.closePosition(btcMarketId);

        (,,, , uint256 oi_long2,) = _getMarket(btcMarketId);
        assertEq(oi_long2, 0);
    }

    // GOO-459: margin must be locked (debited) at openPosition so users cannot
    // withdraw their collateral while holding an open position.
    function test_engine_marginLockedAtOpen() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        // Vault balance should have decreased by at least the margin
        assertLt(vault.balances(alice), 100_000e18 - 10_000e18 + 1);

        // Cannot withdraw the full original deposit — margin is locked
        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(100_000e18);
    }

    // GOO-461: position state must be written before any external interaction to
    // prevent reentrancy through the fee splitter leaving pos.isOpen = false during callback.
    function test_engine_posStateWrittenBeforeExternalCall() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        // Position should be open immediately — no reentrancy window for PositionAlreadyOpen bypass
        (bool isOpen,,,,,,) = _getPosition(alice, btcMarketId);
        assertTrue(isOpen, "position must be open after openPosition returns");

        // Re-opening on the same market must revert even if called in same block
        vm.prank(alice);
        vm.expectRevert(PerpEngine.PositionAlreadyOpen.selector);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);
    }

    // GOO-462: funding must be applied at closePosition so traders cannot evade funding
    // payments by closing when no new opens have triggered applyFunding.
    // GOO-465: assert cumulativeFundingIndex actually changes when mark != index.
    function test_engine_fundingAppliedAtClose() public {
        vm.prank(alice);
        vault.deposit(1_000_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        int256 indexBefore = fundingRate.cumulativeFundingIndex(btcMarketId);

        // Set mark > index: 1% premium — longs will pay funding at close
        // btcFeed (mark) stays at BTC_PRICE; btcIndexFeed (index) is set 1% lower
        btcIndexFeed.setPrice(int256(BTC_PRICE_U - BTC_PRICE_U / 100));

        // Warp past one funding interval
        vm.warp(block.timestamp + 25 hours);

        // Close without any intermediate opens — GOO-462 fix ensures applyFunding runs
        vm.prank(alice);
        engine.closePosition(btcMarketId);

        // cumulativeFundingIndex must have increased (mark > index → positive rate)
        assertGt(
            fundingRate.cumulativeFundingIndex(btcMarketId),
            indexBefore,
            "cumulativeFundingIndex must increase when mark > index"
        );
    }

    // GOO-467: marginRatio() and unrealizedPnL() must include accrued funding.
    function test_engine_marginRatio_includesFunding() public {
        vm.prank(alice);
        vault.deposit(1_000_000e18);

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18); // 10x long

        // Record ratio at entry — no funding accrued yet
        uint256 ratioAtOpen = engine.marginRatio(alice, btcMarketId);

        // Set mark > index: 1% premium → longs accrue positive funding debt
        btcIndexFeed.setPrice(int256(BTC_PRICE_U - BTC_PRICE_U / 100));

        // Warp past one funding interval
        vm.warp(block.timestamp + 9 hours);
        // Trigger the index update (applyFunding is permissioned to engine/admin)
        vm.prank(admin);
        fundingRate.applyFunding(btcMarketId, BTC_PRICE_U, BTC_PRICE_U - BTC_PRICE_U / 100);

        // marginRatio() must now be lower (funding debt reduces effective margin)
        uint256 ratioAfterFunding = engine.marginRatio(alice, btcMarketId);
        assertLt(ratioAfterFunding, ratioAtOpen, "marginRatio must decrease when funding accrues against position");

        // unrealizedPnL() must be lower than price-only PnL (funding reduces net profit)
        int256 netPnL = engine.unrealizedPnL(alice, btcMarketId);
        // Price unchanged so raw PnL = 0; funding payment reduces net PnL below zero
        assertLt(netPnL, 0, "unrealizedPnL must be negative when funding payment exceeds price gain");
    }

    // ============ GOO-471: two-step admin transfer ============

    function test_engine_transferAdmin_twoStep() public {
        address newAdmin = address(0xBEEF);
        vm.prank(admin);
        engine.transferAdmin(newAdmin);
        // Admin unchanged until acceptAdmin
        assertEq(engine.admin(), admin);
        assertEq(engine.pendingAdmin(), newAdmin);
        vm.prank(newAdmin);
        engine.acceptAdmin();
        assertEq(engine.admin(), newAdmin);
        assertEq(engine.pendingAdmin(), address(0));
    }

    function test_engine_transferAdmin_onlyAdmin_reverts() public {
        vm.prank(alice);
        vm.expectRevert(PerpEngine.NotAdmin.selector);
        engine.transferAdmin(address(0xBEEF));
    }

    function test_engine_acceptAdmin_onlyPending_reverts() public {
        address newAdmin = address(0xBEEF);
        vm.prank(admin);
        engine.transferAdmin(newAdmin);
        vm.prank(alice);
        vm.expectRevert(PerpEngine.NotPendingAdmin.selector);
        engine.acceptAdmin();
    }

    function test_funding_transferAdmin_twoStep() public {
        address newAdmin = address(0xCAFE);
        vm.prank(admin);
        fundingRate.transferAdmin(newAdmin);
        assertEq(fundingRate.admin(), admin);
        assertEq(fundingRate.pendingAdmin(), newAdmin);
        vm.prank(newAdmin);
        fundingRate.acceptAdmin();
        assertEq(fundingRate.admin(), newAdmin);
        assertEq(fundingRate.pendingAdmin(), address(0));
    }

    function test_vault_transferAdmin_twoStep() public {
        address newAdmin = address(0xDEAD);
        vm.prank(admin);
        vault.transferAdmin(newAdmin);
        assertEq(vault.admin(), admin);
        assertEq(vault.pendingAdmin(), newAdmin);
        vm.prank(newAdmin);
        vault.acceptAdmin();
        assertEq(vault.admin(), newAdmin);
        assertEq(vault.pendingAdmin(), address(0));
    }

    // GOO-450: openPosition must approve feeSplitter before calling splitFee(),
    // otherwise GDT.transferFrom reverts with "Insufficient allowance".
    // Fix: PerpEngine calls GDT.approve(feeSplitter, fee) after vault.flushFee().
    function test_engine_openPosition_feeRoutedToSplitter() public {
        vm.prank(alice);
        vault.deposit(100_000e18);

        uint256 splitterBefore = feeSplitter.totalReceived();

        vm.prank(alice);
        engine.openPosition(btcMarketId, 100_000e18, true, 10_000e18);

        // fee = 100_000e18 * 10 / 10000 = 100e18
        uint256 expectedFee = 100e18;
        assertEq(
            feeSplitter.totalReceived() - splitterBefore,
            expectedFee,
            "GOO-450: fee must reach feeSplitter (approve was missing)"
        );
    }

    // ============ Helpers ============

    function _getPosition(address trader, uint256 marketId)
        internal
        view
        returns (bool isOpen, bool isLong, uint256 size, uint256 entryPrice, uint256 margin, int256 entryFunding, uint256 mId)
    {
        (isOpen, isLong, size, entryPrice, margin, entryFunding, mId) = engine.positions(trader, marketId);
    }

    function _getMarket(uint256 marketId)
        internal
        view
        returns (bytes32 oracleKey, bytes32 indexOracleKey, uint256 maxLev, bool active, uint256 oiLong, uint256 oiShort)
    {
        (oracleKey, indexOracleKey, maxLev, active, oiLong, oiShort) = engine.markets(marketId);
    }
}
