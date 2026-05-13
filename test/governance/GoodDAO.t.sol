// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/governance/GoodDAO.sol";
import "../../src/governance/VoteEscrowedGD.sol";
import "../../src/GoodDollarToken.sol";

/// @notice Simple counter for governance execution tests
contract GovernanceTarget {
    uint256 public value;
    function setValue(uint256 _value) external { value = _value; }
}

contract GoodDAOTest is Test {
    GoodDAO dao;
    VoteEscrowedGD veGD;
    GoodDollarToken gd;
    GovernanceTarget target;

    address admin = address(0xAD);
    address guardian = address(0x6A7D);
    address identity = address(0x1D);
    address treasury = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA701);

    uint256 constant SUPPLY = 10_000_000e18;
    uint256 constant LOCK_AMT = 500_000e18;

    function setUp() public {
        vm.startPrank(admin);
        gd = new GoodDollarToken(admin, identity, SUPPLY);
        veGD = new VoteEscrowedGD(address(gd), treasury, admin);
        dao = new GoodDAO(address(veGD), guardian);
        target = new GovernanceTarget();

        gd.transfer(alice, 2_000_000e18);
        gd.transfer(bob, 2_000_000e18);
        gd.transfer(carol, 1_000_000e18);
        vm.stopPrank();

        // Lock tokens for voting power
        vm.startPrank(alice);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 4 * 365 days); // max lock = max power
        vm.stopPrank();

        vm.startPrank(bob);
        gd.approve(address(veGD), LOCK_AMT);
        veGD.lock(LOCK_AMT, 4 * 365 days);
        vm.stopPrank();

        vm.startPrank(carol);
        gd.approve(address(veGD), 200_000e18);
        veGD.lock(200_000e18, 4 * 365 days);
        vm.stopPrank();
    }

    // --- Helper ---
    function _propose() internal returns (uint256) {
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        targets[0] = address(target);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature("setValue(uint256)", 42);

        vm.prank(alice);
        return dao.propose(targets, values, calldatas, "Set value to 42");
    }

    function test_Propose() public {
        uint256 id = _propose();
        assertEq(id, 1);
        assertEq(dao.proposalCount(), 1);
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Pending));
    }

    function test_Propose_RevertsBelowThreshold() public {
        // Carol has 200k locked while total is 1.2M — that's ~16%, which is above 1%
        // We need someone with less than 1% of total
        address dust = address(0xD057);
        vm.prank(admin);
        gd.transfer(dust, 1_000e18);

        vm.startPrank(dust);
        gd.approve(address(veGD), 1_000e18);
        veGD.lock(1_000e18, 4 * 365 days);
        vm.stopPrank();

        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        targets[0] = address(target);
        calldatas[0] = abi.encodeWithSignature("setValue(uint256)", 1);

        vm.prank(dust);
        vm.expectRevert(GoodDAO.BelowThreshold.selector);
        dao.propose(targets, values, calldatas, "Should fail");
    }

    function test_FullLifecycle_ProposeVoteQueueExecute() public {
        uint256 id = _propose();

        // Advance past voting delay
        vm.warp(block.timestamp + dao.VOTING_DELAY() + 1);
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Active));

        // Alice and Bob vote For
        vm.prank(alice);
        dao.castVote(id, GoodDAO.VoteType.For);
        vm.prank(bob);
        dao.castVote(id, GoodDAO.VoteType.For);

        // Carol votes Against
        vm.prank(carol);
        dao.castVote(id, GoodDAO.VoteType.Against);

        // Advance past voting period
        vm.warp(block.timestamp + dao.VOTING_PERIOD() + 1);
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Succeeded));

        // Queue
        dao.queue(id);
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Queued));

        // Advance past timelock
        vm.warp(block.timestamp + dao.TIMELOCK_DELAY() + 1);

        // Execute
        dao.execute(id);
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Executed));
        assertEq(target.value(), 42);
    }

    function test_Vote_RevertsIfNotActive() public {
        uint256 id = _propose();
        // Still pending
        vm.prank(alice);
        vm.expectRevert(GoodDAO.ProposalNotActive.selector);
        dao.castVote(id, GoodDAO.VoteType.For);
    }

    function test_Vote_RevertsDoubleVote() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + dao.VOTING_DELAY() + 1);

        vm.startPrank(alice);
        dao.castVote(id, GoodDAO.VoteType.For);
        vm.expectRevert(GoodDAO.AlreadyVoted.selector);
        dao.castVote(id, GoodDAO.VoteType.Against);
        vm.stopPrank();
    }

    function test_Defeated_InsufficientQuorum() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + dao.VOTING_DELAY() + 1);

        // Only carol votes (200k out of 1.2M total — ~16%, but need for+abstain >= 10%)
        // Actually 200k/1.2M = 16.6% which exceeds quorum
        // We need just carol against to defeat it
        vm.prank(carol);
        dao.castVote(id, GoodDAO.VoteType.Against);

        vm.warp(block.timestamp + dao.VOTING_PERIOD() + 1);
        // forVotes (0) + abstain (0) < quorum → defeated
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Defeated));
    }

    function test_Defeated_MoreAgainstThanFor() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + dao.VOTING_DELAY() + 1);

        vm.prank(alice);
        dao.castVote(id, GoodDAO.VoteType.For);
        vm.prank(bob);
        dao.castVote(id, GoodDAO.VoteType.Against);
        vm.prank(carol);
        dao.castVote(id, GoodDAO.VoteType.Against);

        vm.warp(block.timestamp + dao.VOTING_PERIOD() + 1);
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Defeated));
    }

    function test_Cancel_ByProposer() public {
        uint256 id = _propose();
        vm.prank(alice);
        dao.cancel(id);
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Canceled));
    }

    function test_Cancel_ByGuardian() public {
        uint256 id = _propose();
        vm.prank(guardian);
        dao.cancel(id);
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Canceled));
    }

    function test_Cancel_RevertsUnauthorized() public {
        uint256 id = _propose();
        vm.prank(bob);
        vm.expectRevert(GoodDAO.NotProposer.selector);
        dao.cancel(id);
    }

    function test_Execute_RevertsBeforeTimelock() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + dao.VOTING_DELAY() + 1);
        vm.prank(alice);
        dao.castVote(id, GoodDAO.VoteType.For);
        vm.prank(bob);
        dao.castVote(id, GoodDAO.VoteType.For);
        vm.warp(block.timestamp + dao.VOTING_PERIOD() + 1);
        dao.queue(id);

        // Try execute immediately
        vm.expectRevert(GoodDAO.TimelockNotReady.selector);
        dao.execute(id);
    }

    function test_Execute_RevertsAfterExpiry() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + dao.VOTING_DELAY() + 1);
        vm.prank(alice);
        dao.castVote(id, GoodDAO.VoteType.For);
        vm.prank(bob);
        dao.castVote(id, GoodDAO.VoteType.For);
        vm.warp(block.timestamp + dao.VOTING_PERIOD() + 1);
        dao.queue(id);

        // Warp past execution window
        vm.warp(block.timestamp + dao.TIMELOCK_DELAY() + dao.EXECUTION_WINDOW() + 1);
        vm.expectRevert(GoodDAO.ProposalNotQueued.selector); // state becomes Expired
        dao.execute(id);
    }

    function test_TransferGuardian() public {
        vm.prank(guardian);
        dao.transferGuardian(alice);
        assertEq(dao.guardian(), alice);
    }

    function test_TransferGuardian_RevertsNonGuardian() public {
        vm.prank(alice);
        vm.expectRevert(GoodDAO.NotGuardian.selector);
        dao.transferGuardian(alice);
    }

    function test_AbstainVotes_CountTowardsQuorum() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + dao.VOTING_DELAY() + 1);

        // Alice abstains, Bob votes for
        vm.prank(alice);
        dao.castVote(id, GoodDAO.VoteType.Abstain);
        vm.prank(bob);
        dao.castVote(id, GoodDAO.VoteType.For);

        vm.warp(block.timestamp + dao.VOTING_PERIOD() + 1);
        // for + abstain = 1M >= quorum (120k). for (500k) > against (0)
        assertEq(uint256(dao.state(id)), uint256(GoodDAO.ProposalState.Succeeded));
    }
}
