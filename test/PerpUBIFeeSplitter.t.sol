// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/perps/PerpUBIFeeSplitter.sol";
import "../src/GoodDollarToken.sol";

/// @title PerpUBIFeeSplitter Test Suite
/// @notice Comprehensive test coverage for perpetual futures UBI fee routing,
///         analytics, gas overhead validation, and integration points.
contract PerpUBIFeeSplitterTest is Test {
    GoodDollarToken goodDollar;
    PerpUBIFeeSplitter splitter;

    address admin = makeAddr("admin");
    address oracle = makeAddr("oracle");
    address treasury = makeAddr("treasury");
    address perpEngine = makeAddr("perpEngine");
    address trader1 = makeAddr("trader1");
    address trader2 = makeAddr("trader2");
    address liquidator1 = makeAddr("liquidator1");
    address liquidator2 = makeAddr("liquidator2");

    // Test constants
    uint256 constant TRADE_FEE = 10 ether; // 10 G$
    uint256 constant LIQUIDATION_BONUS = 50 ether; // 50 G$
    uint256 constant FUNDING_FEE = 5 ether; // 5 G$

    // Expected fee splits (33.33% UBI, 16.67% protocol, 50% dApp)
    uint256 constant EXPECTED_UBI_BPS = 3333;
    uint256 constant EXPECTED_PROTOCOL_BPS = 1667;

    function setUp() public {
        vm.startPrank(admin);
        goodDollar = new GoodDollarToken(admin, oracle, 0);
        splitter = new PerpUBIFeeSplitter(address(goodDollar), treasury, admin);

        // Set up minting permissions for tests
        goodDollar.setMinter(address(this), true);
        goodDollar.setMinter(address(splitter), true);

        vm.stopPrank();

        // Mint tokens to test addresses
        goodDollar.mint(perpEngine, 1000 ether);
        goodDollar.mint(trader1, 1000 ether);
        goodDollar.mint(trader2, 1000 ether);
    }

    // ─── Core Fee Splitting Tests ────────────────────────────────────────────

    function test_splitFee_BasicFunctionality() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), TRADE_FEE);

        uint256 initialUBIBalance = goodDollar.ubiPool();
        uint256 initialTreasuryBalance = goodDollar.balanceOf(treasury);
        uint256 initialDAppBalance = goodDollar.balanceOf(perpEngine);

        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitFee(TRADE_FEE, perpEngine);

        vm.stopPrank();

        // Verify correct fee distribution (33.33% / 16.67% / 50%)
        uint256 expectedUBI = (TRADE_FEE * EXPECTED_UBI_BPS) / 10000;
        uint256 expectedProtocol = (TRADE_FEE * EXPECTED_PROTOCOL_BPS) / 10000;
        uint256 expectedDApp = TRADE_FEE - expectedUBI - expectedProtocol;

        assertEq(ubiShare, expectedUBI, "Incorrect UBI share");
        assertEq(protocolShare, expectedProtocol, "Incorrect protocol share");
        assertEq(dAppShare, expectedDApp, "Incorrect dApp share");

        // Verify actual balances updated correctly
        assertEq(goodDollar.ubiPool(), initialUBIBalance + ubiShare, "UBI pool not updated");
        assertEq(goodDollar.balanceOf(treasury), initialTreasuryBalance + protocolShare, "Treasury not updated");
    }

    function test_splitFee_RequiresGoodDollarInterface() public {
        // Test that goodDollar() method works correctly
        assertEq(splitter.goodDollar(), address(goodDollar), "goodDollar() returns wrong address");
    }

    function test_splitFee_RejectsZeroFee() public {
        vm.startPrank(perpEngine);
        vm.expectRevert("Zero fee");
        splitter.splitFee(0, perpEngine);
        vm.stopPrank();
    }

    // ─── Trading Fee Tracking Tests ───────────────────────────────────────────

    function test_splitTradingFee_EnhancedTracking() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), TRADE_FEE);

        (uint256 ubiShare,,) = splitter.splitTradingFee(
            TRADE_FEE,
            perpEngine,
            trader1,
            0, // marketId
            100 ether // positionSize
        );

        vm.stopPrank();

        // Verify tracking stats updated
        (uint256 tradingFees,,,uint256 ubiFromTrading,,,) = splitter.getPerpsUBIStats();
        assertEq(tradingFees, TRADE_FEE, "Trading fees not tracked");
        assertEq(ubiFromTrading, ubiShare, "UBI from trading not tracked");
    }

    function test_splitTradingFee_MultipleCallsAccumulate() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), TRADE_FEE * 3);

        // First trade
        splitter.splitTradingFee(TRADE_FEE, perpEngine, trader1, 0, 100 ether);
        // Second trade
        splitter.splitTradingFee(TRADE_FEE, perpEngine, trader2, 1, 200 ether);
        // Third trade
        splitter.splitTradingFee(TRADE_FEE, perpEngine, trader1, 0, 150 ether);

        vm.stopPrank();

        (uint256 tradingFees,,,uint256 ubiFromTrading,,,) = splitter.getPerpsUBIStats();
        assertEq(tradingFees, TRADE_FEE * 3, "Multiple trading fees not accumulated");

        uint256 expectedTotalUBI = (TRADE_FEE * 3 * EXPECTED_UBI_BPS) / 10000;
        assertEq(ubiFromTrading, expectedTotalUBI, "Multiple UBI shares not accumulated");
    }

    // ─── Liquidation Fee Tracking Tests ───────────────────────────────────────

    function test_splitLiquidationFee_EnhancedTracking() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), LIQUIDATION_BONUS);

        (uint256 ubiShare,,) = splitter.splitLiquidationFee(
            LIQUIDATION_BONUS,
            perpEngine,
            liquidator1,
            trader1
        );

        vm.stopPrank();

        // Verify liquidation tracking
        (,, uint256 liquidationFees,,,uint256 ubiFromLiquidations,) = splitter.getPerpsUBIStats();
        assertEq(liquidationFees, LIQUIDATION_BONUS, "Liquidation fees not tracked");
        assertEq(ubiFromLiquidations, ubiShare, "UBI from liquidations not tracked");

        // Verify liquidator contribution tracking
        assertEq(splitter.liquidatorContributions(liquidator1), ubiShare, "Liquidator contribution not tracked");
        assertEq(splitter.getActiveLiquidatorsCount(), 1, "Active liquidator count incorrect");
    }

    function test_splitLiquidationFee_MultipleLiquidators() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), LIQUIDATION_BONUS * 3);

        // Liquidator1 liquidates twice
        splitter.splitLiquidationFee(LIQUIDATION_BONUS, perpEngine, liquidator1, trader1);
        splitter.splitLiquidationFee(LIQUIDATION_BONUS, perpEngine, liquidator1, trader2);
        // Liquidator2 liquidates once
        splitter.splitLiquidationFee(LIQUIDATION_BONUS, perpEngine, liquidator2, trader1);

        vm.stopPrank();

        uint256 expectedUBIPerLiquidation = (LIQUIDATION_BONUS * EXPECTED_UBI_BPS) / 10000;

        // Check individual liquidator contributions
        assertEq(splitter.liquidatorContributions(liquidator1), expectedUBIPerLiquidation * 2, "Liquidator1 total incorrect");
        assertEq(splitter.liquidatorContributions(liquidator2), expectedUBIPerLiquidation, "Liquidator2 total incorrect");
        assertEq(splitter.getActiveLiquidatorsCount(), 2, "Active liquidator count incorrect");
    }

    // ─── Funding Fee Tracking Tests ───────────────────────────────────────────

    function test_splitFundingFee_EnhancedTracking() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), FUNDING_FEE);

        (uint256 ubiShare,,) = splitter.splitFundingFee(
            FUNDING_FEE,
            perpEngine,
            0 // marketId
        );

        vm.stopPrank();

        // Verify funding tracking
        (, uint256 fundingFees,, , uint256 ubiFromFunding,,) = splitter.getPerpsUBIStats();
        assertEq(fundingFees, FUNDING_FEE, "Funding fees not tracked");
        assertEq(ubiFromFunding, ubiShare, "UBI from funding not tracked");
    }

    // ─── Analytics and Impact Measurement Tests ──────────────────────────────

    function test_getPerpsUBIStats_ComprehensiveTracking() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), 1000 ether);

        // Generate mixed activity
        splitter.splitTradingFee(TRADE_FEE, perpEngine, trader1, 0, 100 ether);
        splitter.splitLiquidationFee(LIQUIDATION_BONUS, perpEngine, liquidator1, trader1);
        splitter.splitFundingFee(FUNDING_FEE, perpEngine, 0);

        vm.stopPrank();

        (
            uint256 tradingFees,
            uint256 fundingFees,
            uint256 liquidationFees,
            uint256 ubiFromTrading,
            uint256 ubiFromFunding,
            uint256 ubiFromLiquidations,
            uint256 totalUBI
        ) = splitter.getPerpsUBIStats();

        assertEq(tradingFees, TRADE_FEE, "Trading fees incorrect");
        assertEq(fundingFees, FUNDING_FEE, "Funding fees incorrect");
        assertEq(liquidationFees, LIQUIDATION_BONUS, "Liquidation fees incorrect");

        uint256 expectedTotalUBI = ubiFromTrading + ubiFromFunding + ubiFromLiquidations;
        assertEq(totalUBI, expectedTotalUBI, "Total UBI calculation incorrect");

        // Each should be 33.33% of respective fees
        assertEq(ubiFromTrading, (TRADE_FEE * EXPECTED_UBI_BPS) / 10000, "Trading UBI incorrect");
        assertEq(ubiFromFunding, (FUNDING_FEE * EXPECTED_UBI_BPS) / 10000, "Funding UBI incorrect");
        assertEq(ubiFromLiquidations, (LIQUIDATION_BONUS * EXPECTED_UBI_BPS) / 10000, "Liquidation UBI incorrect");
    }

    function test_getMonthlyUBIEstimate_ReachesTarget() public {
        // Setup activity to reach monthly target
        uint256 dailyUBINeeded = splitter.monthlyTargetUBI() / 30; // $10K target / 30 days

        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), type(uint256).max);

        // Simulate one day of activity
        uint256 feesNeededPerDay = (dailyUBINeeded * 10000) / EXPECTED_UBI_BPS; // Reverse calculate
        splitter.splitTradingFee(feesNeededPerDay, perpEngine, trader1, 0, 100 ether);

        vm.stopPrank();

        // Fast-forward to next day and check estimate
        vm.warp(block.timestamp + 1 days);

        (uint256 estimated, uint256 target, uint256 progress) = splitter.getMonthlyUBIEstimate();

        assertEq(target, splitter.monthlyTargetUBI(), "Target mismatch");
        assertApproxEqAbs(estimated, target, 1 ether, "Estimate should be close to target");
        assertApproxEqAbs(progress, 10000, 100, "Progress should be close to 100% (10000 BPS)");
    }

    function test_getTopLiquidators_Ranking() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), LIQUIDATION_BONUS * 5);

        // Generate liquidation activity with different amounts
        splitter.splitLiquidationFee(LIQUIDATION_BONUS, perpEngine, liquidator1, trader1);
        splitter.splitLiquidationFee(LIQUIDATION_BONUS * 2, perpEngine, liquidator2, trader1);
        splitter.splitLiquidationFee(LIQUIDATION_BONUS, perpEngine, liquidator1, trader2);

        vm.stopPrank();

        (address[] memory liquidators, uint256[] memory contributions) = splitter.getTopLiquidators(10);

        assertEq(liquidators.length, 2, "Should have 2 liquidators");

        // Check that contributions are tracked correctly
        uint256 expectedLiq1 = (LIQUIDATION_BONUS * 2 * EXPECTED_UBI_BPS) / 10000; // 2 liquidations
        uint256 expectedLiq2 = (LIQUIDATION_BONUS * 2 * EXPECTED_UBI_BPS) / 10000; // 1 larger liquidation

        bool liq1Found = false;
        bool liq2Found = false;

        for (uint256 i = 0; i < liquidators.length; i++) {
            if (liquidators[i] == liquidator1) {
                assertEq(contributions[i], expectedLiq1, "Liquidator1 contribution incorrect");
                liq1Found = true;
            } else if (liquidators[i] == liquidator2) {
                assertEq(contributions[i], expectedLiq2, "Liquidator2 contribution incorrect");
                liq2Found = true;
            }
        }

        assertTrue(liq1Found, "Liquidator1 not in results");
        assertTrue(liq2Found, "Liquidator2 not in results");
    }

    // ─── Gas Overhead Validation Tests ────────────────────────────────────────

    function test_gasOverhead_WithinTarget() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), TRADE_FEE);

        // Baseline: direct transfer (no UBI routing)
        uint256 gasStart = gasleft();
        goodDollar.transfer(treasury, TRADE_FEE / 2);
        uint256 baselineGas = gasStart - gasleft();

        // Test: UBI fee splitting
        gasStart = gasleft();
        splitter.splitFee(TRADE_FEE, perpEngine);
        uint256 splitterGas = gasStart - gasleft();

        vm.stopPrank();

        // Calculate overhead percentage
        uint256 overhead = ((splitterGas - baselineGas) * 10000) / baselineGas;

        // Should be less than 2% (200 BPS) overhead as per requirements
        assertLt(overhead, 200, "Gas overhead exceeds 2% target");

        emit log_named_uint("Baseline gas", baselineGas);
        emit log_named_uint("Splitter gas", splitterGas);
        emit log_named_uint("Overhead BPS", overhead);
    }

    function test_gasOverhead_EnhancedTrackingMinimal() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), TRADE_FEE * 2);

        // Basic split
        uint256 gasStart = gasleft();
        splitter.splitFee(TRADE_FEE, perpEngine);
        uint256 basicGas = gasStart - gasleft();

        // Enhanced tracking split
        gasStart = gasleft();
        splitter.splitTradingFee(TRADE_FEE, perpEngine, trader1, 0, 100 ether);
        uint256 enhancedGas = gasStart - gasleft();

        vm.stopPrank();

        // Enhanced tracking should add minimal overhead
        uint256 trackingOverhead = ((enhancedGas - basicGas) * 10000) / basicGas;
        assertLt(trackingOverhead, 50, "Enhanced tracking adds too much overhead"); // < 0.5%

        emit log_named_uint("Basic split gas", basicGas);
        emit log_named_uint("Enhanced split gas", enhancedGas);
        emit log_named_uint("Tracking overhead BPS", trackingOverhead);
    }

    // ─── Governance and Admin Tests ───────────────────────────────────────────

    function test_setMonthlyTarget_UpdatesCorrectly() public {
        uint256 newTarget = 20_000 ether; // $20K monthly target

        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit PerpUBIFeeSplitter.MonthlyTargetUpdated(splitter.monthlyTargetUBI(), newTarget);
        splitter.setMonthlyTarget(newTarget);

        assertEq(splitter.monthlyTargetUBI(), newTarget, "Monthly target not updated");
    }

    function test_setFeeSplit_UpdatesCorrectly() public {
        uint256 newUBI = 4000; // 40%
        uint256 newProtocol = 1000; // 10%
        // Remaining 50% goes to dApp

        vm.prank(admin);
        splitter.setFeeSplit(newUBI, newProtocol);

        assertEq(splitter.ubiBPS(), newUBI, "UBI BPS not updated");
        assertEq(splitter.protocolBPS(), newProtocol, "Protocol BPS not updated");
    }

    function test_setFeeSplit_RejectsInvalidSplit() public {
        vm.prank(admin);
        vm.expectRevert("Exceeds 100%");
        splitter.setFeeSplit(7000, 4000); // 70% + 40% = 110% > 100%
    }

    function test_onlyAdmin_RestrictsAccess() public {
        vm.expectRevert("Not admin");
        vm.prank(trader1);
        splitter.setMonthlyTarget(20_000 ether);
    }

    // ─── Social Impact Measurement Tests ──────────────────────────────────────

    function test_getDerivativesSocialImpactRate_CalculatesCorrectly() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), 100 ether);

        // Generate activity: 100 G$ in fees should produce 33.33 G$ UBI
        splitter.splitTradingFee(100 ether, perpEngine, trader1, 0, 1000 ether);

        vm.stopPrank();

        uint256 impactRate = splitter.getDerivativesSocialImpactRate();

        // Should be 3333 (33.33 UBI per 100 volume = 3333 per 10000 units)
        assertEq(impactRate, EXPECTED_UBI_BPS, "Impact rate calculation incorrect");
    }

    function test_dailyTracking_ResetsCorrectly() public {
        vm.startPrank(perpEngine);
        goodDollar.approve(address(splitter), TRADE_FEE * 2);

        // Day 1 activity
        splitter.splitTradingFee(TRADE_FEE, perpEngine, trader1, 0, 100 ether);

        (uint256 day1, uint256 amount1) = splitter.getTodayDerivativesImpact();
        uint256 expectedDay1UBI = (TRADE_FEE * EXPECTED_UBI_BPS) / 10000;
        assertEq(amount1, expectedDay1UBI, "Day 1 UBI tracking incorrect");

        // Move to next day
        vm.warp(block.timestamp + 1 days);

        // Day 2 activity
        splitter.splitTradingFee(TRADE_FEE, perpEngine, trader2, 1, 200 ether);

        (uint256 day2, uint256 amount2) = splitter.getTodayDerivativesImpact();

        vm.stopPrank();

        assertGt(day2, day1, "Day should have incremented");
        assertEq(amount2, expectedDay1UBI, "Day 2 should reset to single trade amount");
    }
}