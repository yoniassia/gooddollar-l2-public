// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/governance/VoteEscrowedGD.sol";
import "../../src/GoodDollarToken.sol";

contract VoteEscrowedGDTest is Test {
    VoteEscrowedGD veGD;
    GoodDollarToken gd;

    address admin = address(0xAD);
    address treasury = address(0xBEEF);
    address identity = address(0x1D);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant SUPPLY = 10_000_000e18;
    uint256 constant LOCK_AMT = 100_000e18;

    function setUp() public {
        vm.startPrank(admin);
        gd = new GoodDollarToken(admin, identity, SUPPLY);
        veGD = new VoteEscrowedGD(address(gd), treasury, admin);
        gd.transfer(alice, 1_000_000e18);
        gd.transfer(bob, 1_000_000e18);
        vm.stopPrank();
    }

    function test_Lock_Basic() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 365 days);
        vm.stopPrank();

        assertEq(veGD.totalLocked(), LOCK_AMT);
        (uint128 amt, uint128 end) = veGD.locks(alice);
        assertEq(amt, LOCK_AMT);
        assertEq(end, block.timestamp + 365 days);

        // Voting power = amount * timeRemaining / MAX_LOCK
        // 100k * 365d / (4*365d) = 25k
        uint256 expectedPower = (LOCK_AMT * 365 days) / veGD.MAX_LOCK();
        assertEq(veGD.votingPowerOf(alice), expectedPower);
    }

    function test_Lock_MaxDuration() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 4 * 365 days);
        vm.stopPrank();

        // Max lock = full voting power
        assertEq(veGD.votingPowerOf(alice), LOCK_AMT);
    }

    function test_Lock_RevertsTooShort() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        vm.expectRevert(VoteEscrowedGD.LockTooShort.selector);
        veGD.lock(LOCK_AMT, 1 days);
        vm.stopPrank();
    }

    function test_Lock_RevertsTooLong() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        vm.expectRevert(VoteEscrowedGD.LockTooLong.selector);
        veGD.lock(LOCK_AMT, 5 * 365 days);
        vm.stopPrank();
    }

    function test_Lock_RevertsZeroAmount() public {
        vm.startPrank(alice);
        vm.expectRevert(VoteEscrowedGD.ZeroAmount.selector);
        veGD.lock(0, 365 days);
        vm.stopPrank();
    }

    function test_VotingPower_DecaysOverTime() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 4 * 365 days);
        vm.stopPrank();

        uint256 powerAtStart = veGD.votingPowerOf(alice);
        assertEq(powerAtStart, LOCK_AMT);

        // After 2 years, half the power
        vm.warp(block.timestamp + 2 * 365 days);
        uint256 powerMid = veGD.votingPowerOf(alice);
        assertApproxEqAbs(powerMid, LOCK_AMT / 2, 1e18);

        // After 4 years total, zero
        vm.warp(block.timestamp + 2 * 365 days + 1);
        assertEq(veGD.votingPowerOf(alice), 0);
    }

    function test_IncreaseLock() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT * 2);
        veGD.lock(LOCK_AMT, 365 days);

        uint256 powerBefore = veGD.votingPowerOf(alice);
        veGD.increaseLock(LOCK_AMT);
        uint256 powerAfter = veGD.votingPowerOf(alice);
        vm.stopPrank();

        assertApproxEqAbs(powerAfter, powerBefore * 2, 1e15);
        assertEq(veGD.totalLocked(), LOCK_AMT * 2);
    }

    function test_ExtendLock() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 365 days);

        uint256 powerBefore = veGD.votingPowerOf(alice);
        veGD.extendLock(uint256(block.timestamp + 2 * 365 days));
        uint256 powerAfter = veGD.votingPowerOf(alice);
        vm.stopPrank();

        assertGt(powerAfter, powerBefore);
    }

    function test_Withdraw_AfterExpiry() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 7 days);
        vm.stopPrank();

        vm.warp(block.timestamp + 8 days);

        uint256 balBefore = gd.balanceOf(alice);
        vm.prank(alice);
        veGD.withdraw();
        assertEq(gd.balanceOf(alice), balBefore + LOCK_AMT);
        assertEq(veGD.totalLocked(), 0);
    }

    function test_Withdraw_RevertsBeforeExpiry() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 365 days);
        vm.expectRevert(VoteEscrowedGD.LockNotExpired.selector);
        veGD.withdraw();
        vm.stopPrank();
    }

    function test_EarlyUnlock_PenaltyToUBI() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 365 days);
        vm.stopPrank();

        uint256 aliceBefore = gd.balanceOf(alice);
        uint256 treasuryBefore = gd.balanceOf(treasury);

        vm.prank(alice);
        veGD.earlyUnlock();

        uint256 penalty = (LOCK_AMT * 3000) / 10000; // 30%
        uint256 toUBI = (penalty * 3333) / 10000;     // ~33% of penalty
        uint256 received = LOCK_AMT - penalty;

        assertEq(gd.balanceOf(alice), aliceBefore + received);
        assertEq(gd.balanceOf(treasury), treasuryBefore + toUBI);
        assertEq(veGD.totalLocked(), 0);
        assertEq(veGD.votingPowerOf(alice), 0);
    }

    function test_Delegation() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 4 * 365 days);
        vm.stopPrank();

        // Alice self-delegates by default
        uint256 aliceVotes = veGD.getVotes(alice);
        assertEq(aliceVotes, LOCK_AMT);

        // Delegate to bob
        vm.prank(alice);
        veGD.delegate(bob);

        assertEq(veGD.getVotes(bob), LOCK_AMT);
        assertEq(veGD.getVotes(alice), 0);
    }

    function test_GetPastVotes() public {
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 4 * 365 days);
        vm.stopPrank();

        uint256 lockTime = block.timestamp;
        vm.warp(block.timestamp + 30 days);

        // Past votes at lock time should reflect full power
        uint256 pastVotes = veGD.getPastVotes(alice, lockTime);
        assertEq(pastVotes, LOCK_AMT); // at lock time, max power was checkpointed
    }

    function test_SetUbiTreasury_OnlyAdmin() public {
        address newTreasury = address(0xDEAD);
        vm.prank(admin);
        veGD.setUbiTreasury(newTreasury);
        assertEq(veGD.ubiTreasury(), newTreasury);

        vm.prank(alice);
        vm.expectRevert(VoteEscrowedGD.NotAdmin.selector);
        veGD.setUbiTreasury(address(0x1));
    }
}
