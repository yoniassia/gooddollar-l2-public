// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/UBIRevenueTracker.sol";
import "../src/UBIFeeSplitter.sol";
import "../src/GoodDollarToken.sol";

contract UBIRevenueTrackerTest is Test {
    UBIRevenueTracker tracker;
    UBIFeeSplitter splitter;
    GoodDollarToken token;

    address admin    = makeAddr("admin");
    address oracle   = makeAddr("oracle");
    address treasury = makeAddr("treasury");
    address swapAddr = makeAddr("swap");
    address perpAddr = makeAddr("perps");

    function setUp() public {
        vm.startPrank(admin);
        token = new GoodDollarToken(admin, oracle, 0);
        splitter = new UBIFeeSplitter(address(token), treasury, admin);
        tracker = new UBIRevenueTracker(admin, address(splitter));
        vm.stopPrank();
    }

    // ============ Registration ============

    function test_RegisterProtocol() public {
        vm.prank(admin);
        uint256 id = tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        assertEq(id, 0);
        assertEq(tracker.protocolCount(), 1);

        UBIRevenueTracker.ProtocolStats memory p = tracker.getProtocol(0);
        assertEq(p.name, "GoodSwap");
        assertEq(p.category, "swap");
        assertEq(p.feeSource, swapAddr);
        assertTrue(p.active);
        assertEq(p.totalFees, 0);
    }

    function test_RegisterMultipleProtocols() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        tracker.registerProtocol("GoodPerps", "perps", perpAddr);
        vm.stopPrank();

        assertEq(tracker.protocolCount(), 2);
        assertEq(tracker.protocolBySource(perpAddr), 1);
    }

    function test_RegisterProtocol_OnlyAdmin() public {
        vm.prank(makeAddr("rando"));
        vm.expectRevert("Not admin");
        tracker.registerProtocol("Test", "test", makeAddr("test"));
    }

    // ============ Fee Reporting ============

    function test_ReportFees() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        tracker.reportFees(0, 1000e18, 333e18, 50);
        vm.stopPrank();

        UBIRevenueTracker.ProtocolStats memory p = tracker.getProtocol(0);
        assertEq(p.totalFees, 1000e18);
        assertEq(p.ubiContribution, 333e18);
        assertEq(p.txCount, 50);

        assertEq(tracker.totalFeesTracked(), 1000e18);
        assertEq(tracker.totalUBITracked(), 333e18);
        assertEq(tracker.totalTxTracked(), 50);
    }

    function test_ReportFees_Cumulative() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        tracker.reportFees(0, 500e18, 166e18, 10);
        tracker.reportFees(0, 500e18, 167e18, 10);
        vm.stopPrank();

        UBIRevenueTracker.ProtocolStats memory p = tracker.getProtocol(0);
        assertEq(p.totalFees, 1000e18);
        assertEq(p.ubiContribution, 333e18);
        assertEq(p.txCount, 20);
    }

    function test_ReportFees_InvalidProtocol() public {
        vm.prank(admin);
        vm.expectRevert("Invalid protocol");
        tracker.reportFees(99, 100e18, 33e18, 1);
    }

    function test_ReportFees_InactiveProtocol() public {
        vm.startPrank(admin);
        tracker.registerProtocol("Old", "old", makeAddr("old"));
        tracker.setProtocolActive(0, false);

        vm.expectRevert("Protocol inactive");
        tracker.reportFees(0, 100e18, 33e18, 1);
        vm.stopPrank();
    }

    function test_ReportFees_OnlyAdmin() public {
        vm.prank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);

        vm.prank(makeAddr("rando"));
        vm.expectRevert("Not admin");
        tracker.reportFees(0, 100e18, 33e18, 1);
    }

    // ============ Snapshots ============

    function test_TakeSnapshot() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        tracker.reportFees(0, 1000e18, 333e18, 50);
        tracker.takeSnapshot();
        vm.stopPrank();

        assertEq(tracker.snapshotCount(), 1);
        UBIRevenueTracker.Snapshot[] memory snaps = tracker.getSnapshots(10);
        assertEq(snaps.length, 1);
        assertEq(snaps[0].totalUBI, 333e18);
        assertEq(snaps[0].totalFees, 1000e18);
        assertEq(snaps[0].protocolCount, 1);
    }

    function test_MultipleSnapshots() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);

        tracker.reportFees(0, 500e18, 166e18, 10);
        tracker.takeSnapshot();

        tracker.reportFees(0, 500e18, 167e18, 10);
        tracker.takeSnapshot();
        vm.stopPrank();

        UBIRevenueTracker.Snapshot[] memory snaps = tracker.getSnapshots(10);
        assertEq(snaps.length, 2);
        assertEq(snaps[0].totalUBI, 166e18);
        assertEq(snaps[1].totalUBI, 333e18);
    }

    function test_GetSnapshots_LimitedCount() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        for (uint256 i = 0; i < 5; i++) {
            tracker.reportFees(0, 100e18, 33e18, 1);
            tracker.takeSnapshot();
        }
        vm.stopPrank();

        // Request only 2 most recent
        UBIRevenueTracker.Snapshot[] memory snaps = tracker.getSnapshots(2);
        assertEq(snaps.length, 2);
        // Last snapshot should have cumulative 500 fees
        assertEq(snaps[1].totalFees, 500e18);
    }

    // ============ Dashboard Data ============

    function test_GetDashboardData() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        tracker.registerProtocol("GoodPerps", "perps", perpAddr);
        tracker.reportFees(0, 600e18, 200e18, 30);
        tracker.reportFees(1, 400e18, 133e18, 20);
        tracker.takeSnapshot();
        vm.stopPrank();

        (
            uint256 totalFees,
            uint256 totalUBI,
            uint256 totalTx,
            uint256 pCount,
            uint256 activeP,
            ,, // splitter values (0 since no real fees through splitter)
            uint256 snapCount
        ) = tracker.getDashboardData();

        assertEq(totalFees, 1000e18);
        assertEq(totalUBI, 333e18);
        assertEq(totalTx, 50);
        assertEq(pCount, 2);
        assertEq(activeP, 2);
        assertEq(snapCount, 1);
    }

    // ============ Get All Protocols ============

    function test_GetAllProtocols() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        tracker.registerProtocol("GoodPerps", "perps", perpAddr);
        tracker.reportFees(0, 600e18, 200e18, 30);
        vm.stopPrank();

        UBIRevenueTracker.ProtocolStats[] memory all = tracker.getAllProtocols();
        assertEq(all.length, 2);
        assertEq(all[0].name, "GoodSwap");
        assertEq(all[0].totalFees, 600e18);
        assertEq(all[1].name, "GoodPerps");
        assertEq(all[1].totalFees, 0);
    }

    // ============ Admin ============

    function test_SetProtocolActive() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        tracker.setProtocolActive(0, false);
        vm.stopPrank();

        UBIRevenueTracker.ProtocolStats memory p = tracker.getProtocol(0);
        assertFalse(p.active);
    }

    function test_TransferAdmin() public {
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        tracker.transferAdmin(newAdmin);
        assertEq(tracker.admin(), newAdmin);
    }

    function test_TransferAdmin_ZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("zero address");
        tracker.transferAdmin(address(0));
    }

    function test_TransferAdmin_OnlyAdmin() public {
        vm.prank(makeAddr("rando"));
        vm.expectRevert("Not admin");
        tracker.transferAdmin(makeAddr("new"));
    }

    // ============ Events ============

    function test_EmitsProtocolRegistered() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit UBIRevenueTracker.ProtocolRegistered(0, "GoodSwap", "swap", swapAddr);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
    }

    function test_EmitsStatsUpdated() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);

        vm.expectEmit(true, false, false, true);
        emit UBIRevenueTracker.StatsUpdated(0, 100e18, 33e18, 5);
        tracker.reportFees(0, 100e18, 33e18, 5);
        vm.stopPrank();
    }

    function test_EmitsDailySnapshot() public {
        vm.startPrank(admin);
        tracker.registerProtocol("GoodSwap", "swap", swapAddr);
        tracker.reportFees(0, 100e18, 33e18, 5);

        vm.expectEmit(true, false, false, true);
        emit UBIRevenueTracker.DailySnapshot(0, 33e18, 100e18);
        tracker.takeSnapshot();
        vm.stopPrank();
    }

    // ============ Fuzz ============

    function testFuzz_ReportFees(uint128 fees, uint128 ubi, uint32 txs) public {
        vm.assume(fees > 0);
        vm.assume(ubi <= fees);

        vm.startPrank(admin);
        tracker.registerProtocol("Fuzz", "fuzz", makeAddr("fuzz"));
        tracker.reportFees(0, uint256(fees), uint256(ubi), uint256(txs));
        vm.stopPrank();

        UBIRevenueTracker.ProtocolStats memory p = tracker.getProtocol(0);
        assertEq(p.totalFees, uint256(fees));
        assertEq(p.ubiContribution, uint256(ubi));
    }
}
