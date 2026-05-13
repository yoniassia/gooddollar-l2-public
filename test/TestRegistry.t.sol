// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {Test} from "forge-std/Test.sol";
import {TestRegistry} from "../src/TestRegistry.sol";

contract TestRegistryTest is Test {
    TestRegistry public registry;

    address constant TESTER_A = address(0xA001);
    address constant TESTER_B = address(0xB001);
    address constant CONTRACT_X = address(0xC001);
    address constant CONTRACT_Y = address(0xD001);

    bytes4 constant SEL_FOO = bytes4(keccak256("foo(uint256)"));
    bytes4 constant SEL_BAR = bytes4(keccak256("bar()"));

    function setUp() public {
        registry = new TestRegistry();
    }

    // ── Basic logging ─────────────────────────────────────────────────────────

    function test_LogResult_StoresFieldsCorrectly() public {
        vm.prank(TESTER_A);
        vm.warp(1_000_000);

        uint256 id = registry.logResult(CONTRACT_X, SEL_FOO, true, 21_000, "all good");

        assertEq(id, 0);
        assertEq(registry.getResultCount(), 1);

        TestRegistry.TestResult memory r = registry.getResult(0);
        assertEq(r.tester,           TESTER_A);
        assertEq(r.contractTested,   CONTRACT_X);
        assertEq(r.functionSelector, SEL_FOO);
        assertTrue(r.success);
        assertEq(r.gasUsed,    21_000);
        assertEq(r.timestamp,  1_000_000);
        assertEq(r.note,       "all good");
    }

    function test_LogResult_EmitsEvent() public {
        vm.prank(TESTER_A);
        vm.warp(1_500_000);

        vm.expectEmit(true, true, true, true);
        emit TestRegistry.TestResultLogged(
            0, TESTER_A, CONTRACT_X, SEL_FOO, false, 50_000, 1_500_000, "reverted"
        );

        registry.logResult(CONTRACT_X, SEL_FOO, false, 50_000, "reverted");
    }

    function test_LogResult_ReturnsIncrementingIds() public {
        vm.startPrank(TESTER_A);
        uint256 id0 = registry.logResult(CONTRACT_X, SEL_FOO, true, 1, "");
        uint256 id1 = registry.logResult(CONTRACT_X, SEL_BAR, true, 2, "");
        uint256 id2 = registry.logResult(CONTRACT_Y, SEL_FOO, false, 3, "oops");
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.getResultCount(), 3);
    }

    function test_LogResult_MultipleTesters() public {
        vm.prank(TESTER_A);
        registry.logResult(CONTRACT_X, SEL_FOO, true, 10, "");

        vm.prank(TESTER_B);
        registry.logResult(CONTRACT_Y, SEL_BAR, false, 20, "failed");

        assertEq(registry.getResult(0).tester, TESTER_A);
        assertEq(registry.getResult(1).tester, TESTER_B);
    }

    // ── getResult ─────────────────────────────────────────────────────────────

    function test_GetResult_RevertsOutOfRange() public {
        vm.expectRevert("TestRegistry: out of range");
        registry.getResult(0);
    }

    // ── getResults pagination ────────────────────────────────────────────────

    function test_GetResults_FullRange() public {
        vm.startPrank(TESTER_A);
        for (uint256 i = 0; i < 5; i++) {
            registry.logResult(CONTRACT_X, SEL_FOO, true, i * 1000, "");
        }
        vm.stopPrank();

        TestRegistry.TestResult[] memory results = registry.getResults(0, 4);
        assertEq(results.length, 5);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(results[i].gasUsed, i * 1000);
        }
    }

    function test_GetResults_SubRange() public {
        vm.startPrank(TESTER_A);
        for (uint256 i = 0; i < 5; i++) {
            registry.logResult(CONTRACT_X, SEL_FOO, true, i * 100, "");
        }
        vm.stopPrank();

        TestRegistry.TestResult[] memory results = registry.getResults(1, 3);
        assertEq(results.length, 3);
        assertEq(results[0].gasUsed, 100);
        assertEq(results[1].gasUsed, 200);
        assertEq(results[2].gasUsed, 300);
    }

    function test_GetResults_ToCapsBeyondLength() public {
        vm.prank(TESTER_A);
        registry.logResult(CONTRACT_X, SEL_FOO, true, 1, "");

        // `to` = 999 but only 1 result exists — should return just that 1 result
        TestRegistry.TestResult[] memory results = registry.getResults(0, 999);
        assertEq(results.length, 1);
    }

    function test_GetResults_RevertsInvalidRange() public {
        vm.prank(TESTER_A);
        registry.logResult(CONTRACT_X, SEL_FOO, true, 1, "");

        vm.expectRevert("TestRegistry: invalid range");
        registry.getResults(3, 1);
    }

    function test_GetResults_RevertsFromOutOfRange() public {
        vm.prank(TESTER_A);
        registry.logResult(CONTRACT_X, SEL_FOO, true, 1, "");

        vm.expectRevert("TestRegistry: from out of range");
        registry.getResults(1, 5); // from=1 but length=1 (valid index 0 only)
    }

    // ── getResultsByTester ───────────────────────────────────────────────────

    function test_GetResultsByTester_FiltersCorrectly() public {
        vm.prank(TESTER_A);
        registry.logResult(CONTRACT_X, SEL_FOO, true, 10, "a1");

        vm.prank(TESTER_B);
        registry.logResult(CONTRACT_X, SEL_FOO, false, 20, "b1");

        vm.prank(TESTER_A);
        registry.logResult(CONTRACT_Y, SEL_BAR, true, 30, "a2");

        (TestRegistry.TestResult[] memory matches, uint256[] memory ids) =
            registry.getResultsByTester(TESTER_A);

        assertEq(matches.length, 2);
        assertEq(ids.length,     2);
        assertEq(ids[0], 0);
        assertEq(ids[1], 2);
        assertEq(matches[0].note, "a1");
        assertEq(matches[1].note, "a2");
    }

    function test_GetResultsByTester_ReturnsEmptyForUnknownTester() public {
        vm.prank(TESTER_A);
        registry.logResult(CONTRACT_X, SEL_FOO, true, 1, "");

        (TestRegistry.TestResult[] memory matches, uint256[] memory ids) =
            registry.getResultsByTester(TESTER_B);

        assertEq(matches.length, 0);
        assertEq(ids.length,     0);
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_LogResult_AnyInputs(
        address tester,
        address contractTested,
        bytes4  selector,
        bool    success,
        uint256 gasUsed,
        string calldata note
    ) public {
        vm.assume(tester != address(0));
        vm.prank(tester);

        uint256 id = registry.logResult(contractTested, selector, success, gasUsed, note);
        assertEq(id, 0);

        TestRegistry.TestResult memory r = registry.getResult(0);
        assertEq(r.tester,           tester);
        assertEq(r.contractTested,   contractTested);
        assertEq(r.functionSelector, selector);
        assertEq(r.success,          success);
        assertEq(r.gasUsed,          gasUsed);
        assertEq(r.note,             note);
    }
}
