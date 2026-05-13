// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/predict/OptimisticResolver.sol";
import "../../src/GoodDollarToken.sol";

// ============ Mock MarketFactory ============

contract MockMarketFactory {
    struct Resolution {
        uint256 marketId;
        bool yesWon;
        bool resolved;
    }

    mapping(uint256 => Resolution) public resolutions;

    function resolve(uint256 marketId, bool yesWon) external {
        resolutions[marketId] = Resolution(marketId, yesWon, true);
    }

    function isResolved(uint256 marketId) external view returns (bool) {
        return resolutions[marketId].resolved;
    }

    function outcome(uint256 marketId) external view returns (bool) {
        return resolutions[marketId].yesWon;
    }
}

// ============ Mock Fee Splitter ============

contract MockResolverFeeSplitter {
    GoodDollarToken public token;
    uint256 public totalReceived;

    constructor(address _token) {
        token = GoodDollarToken(_token);
    }

    function splitFee(uint256 totalFee, address) external returns (uint256, uint256, uint256) {
        token.transferFrom(msg.sender, address(this), totalFee);
        totalReceived += totalFee;
        return (totalFee / 3, totalFee / 3, totalFee / 3);
    }
}

contract OptimisticResolverTest is Test {
    GoodDollarToken public gd;
    MockMarketFactory public factory;
    MockResolverFeeSplitter public feeSplitter;
    OptimisticResolver public resolver;

    address public admin = address(0xAD);
    address public proposer = address(0xA1);
    address public disputer = address(0xB1);
    address public anyone = address(0xC1);

    uint256 constant SUPPLY = 100_000_000e18;
    uint256 constant BOND = 1000e18;

    function setUp() public {
        gd = new GoodDollarToken(admin, admin, SUPPLY);
        factory = new MockMarketFactory();
        feeSplitter = new MockResolverFeeSplitter(address(gd));

        resolver = new OptimisticResolver(
            address(gd),
            address(factory),
            address(feeSplitter),
            admin
        );

        // Fund proposer and disputer
        vm.startPrank(admin);
        gd.transfer(proposer, 50_000e18);
        gd.transfer(disputer, 50_000e18);
        vm.stopPrank();

        // Approve resolver
        vm.prank(proposer);
        gd.approve(address(resolver), type(uint256).max);
        vm.prank(disputer);
        gd.approve(address(resolver), type(uint256).max);
    }

    // ============ Deployment ============

    function test_deployment() public view {
        assertEq(resolver.admin(), admin);
        assertEq(resolver.bondAmount(), BOND);
        assertEq(resolver.disputeWindow(), 24 hours);
    }

    // ============ Happy Path: Propose → Finalize ============

    function test_proposeAndFinalize_noDispute() public {
        uint256 marketId = 42;

        // Request resolution (admin-only)
        vm.prank(admin);
        resolver.requestResolution(marketId);
        assertTrue(resolver.resolutionRequested(marketId));

        // Propose YES
        uint256 balBefore = gd.balanceOf(proposer);
        vm.prank(proposer);
        resolver.proposeResolution(marketId, true);

        // Bond taken
        assertEq(gd.balanceOf(proposer), balBefore - BOND);

        // Cannot finalize yet (dispute window open)
        vm.expectRevert();
        resolver.finalizeResolution(marketId);

        // Wait for dispute window
        vm.warp(block.timestamp + 24 hours + 1);

        // Anyone can finalize
        vm.prank(anyone);
        resolver.finalizeResolution(marketId);

        // Check resolved
        assertTrue(resolver.isFinalized(marketId));
        assertTrue(resolver.getFinalOutcome(marketId));

        // Bond returned
        assertEq(gd.balanceOf(proposer), balBefore);

        // MarketFactory called
        assertTrue(factory.isResolved(marketId));
        assertTrue(factory.outcome(marketId));
    }

    function test_proposeAndFinalize_noOutcome() public {
        uint256 marketId = 7;
        vm.prank(admin);
        resolver.requestResolution(marketId);

        // Propose NO
        vm.prank(proposer);
        resolver.proposeResolution(marketId, false);

        vm.warp(block.timestamp + 24 hours + 1);
        resolver.finalizeResolution(marketId);

        assertFalse(resolver.getFinalOutcome(marketId));
        assertFalse(factory.outcome(marketId));
    }

    // ============ Dispute Flow ============

    function test_disputeAndAdminResolve_proposerCorrect() public {
        uint256 marketId = 1;
        vm.prank(admin);
        resolver.requestResolution(marketId);

        // Propose YES
        vm.prank(proposer);
        resolver.proposeResolution(marketId, true);

        // Dispute
        uint256 disputerBal = gd.balanceOf(disputer);
        vm.prank(disputer);
        resolver.disputeResolution(marketId);
        assertEq(gd.balanceOf(disputer), disputerBal - BOND);

        // Admin resolves: YES was correct (proposer wins)
        uint256 proposerBal = gd.balanceOf(proposer);
        vm.prank(admin);
        resolver.adminResolveDispute(marketId, true);

        // Proposer gets bond back + half of loser's bond
        assertEq(gd.balanceOf(proposer), proposerBal + BOND + BOND / 2);

        // UBI got the other half
        assertEq(feeSplitter.totalReceived(), BOND / 2);

        assertTrue(factory.isResolved(marketId));
        assertTrue(factory.outcome(marketId));
    }

    function test_disputeAndAdminResolve_disputerCorrect() public {
        uint256 marketId = 2;
        vm.prank(admin);
        resolver.requestResolution(marketId);

        // Propose YES (incorrect)
        vm.prank(proposer);
        resolver.proposeResolution(marketId, true);

        // Dispute
        vm.prank(disputer);
        resolver.disputeResolution(marketId);

        // Admin resolves: NO was correct (disputer wins)
        uint256 disputerBal = gd.balanceOf(disputer);
        vm.prank(admin);
        resolver.adminResolveDispute(marketId, false);

        // Disputer gets bond back + half of proposer's bond
        assertEq(gd.balanceOf(disputer), disputerBal + BOND + BOND / 2);

        assertFalse(factory.outcome(marketId));
    }

    // ============ Edge Cases & Errors ============

    function test_revert_proposeWithoutRequest() public {
        vm.prank(proposer);
        vm.expectRevert(abi.encodeWithSelector(
            OptimisticResolver.NotResolutionRequested.selector, 99
        ));
        resolver.proposeResolution(99, true);
    }

    function test_revert_doubleProposeRevert() public {
        vm.prank(admin);
        resolver.requestResolution(1);
        vm.prank(proposer);
        resolver.proposeResolution(1, true);

        vm.prank(disputer);
        vm.expectRevert(abi.encodeWithSelector(
            OptimisticResolver.AlreadyProposed.selector, 1
        ));
        resolver.proposeResolution(1, false);
    }

    function test_revert_disputeOwnProposal() public {
        vm.prank(admin);
        resolver.requestResolution(1);
        vm.prank(proposer);
        resolver.proposeResolution(1, true);

        vm.prank(proposer);
        vm.expectRevert(OptimisticResolver.CannotDisputeOwnProposal.selector);
        resolver.disputeResolution(1);
    }

    function test_revert_disputeAfterWindow() public {
        vm.prank(admin);
        resolver.requestResolution(1);
        vm.prank(proposer);
        resolver.proposeResolution(1, true);

        vm.warp(block.timestamp + 24 hours + 1);

        vm.prank(disputer);
        vm.expectRevert(abi.encodeWithSelector(
            OptimisticResolver.DisputeWindowClosed.selector, 1
        ));
        resolver.disputeResolution(1);
    }

    function test_disputeTimeRemaining() public {
        vm.prank(admin);
        resolver.requestResolution(1);
        vm.prank(proposer);
        resolver.proposeResolution(1, true);

        assertEq(resolver.disputeTimeRemaining(1), 24 hours);

        vm.warp(block.timestamp + 12 hours);
        assertEq(resolver.disputeTimeRemaining(1), 12 hours);

        vm.warp(block.timestamp + 13 hours);
        assertEq(resolver.disputeTimeRemaining(1), 0);
    }

    // ============ Emergency Resolve ============

    function test_emergencyResolve() public {
        vm.prank(admin);
        resolver.requestResolution(1);
        vm.prank(proposer);
        resolver.proposeResolution(1, true);

        uint256 proposerBal = gd.balanceOf(proposer);

        // Admin emergency-resolves as NO, returning all bonds
        vm.prank(admin);
        resolver.emergencyResolve(1, false);

        // Proposer gets bond back
        assertEq(gd.balanceOf(proposer), proposerBal + BOND);
        assertTrue(resolver.isFinalized(1));
        assertFalse(resolver.getFinalOutcome(1));
    }

    function test_emergencyResolve_noProposal() public {
        vm.prank(admin);
        resolver.requestResolution(1);

        // Emergency resolve without any proposal
        vm.prank(admin);
        resolver.emergencyResolve(1, true);

        assertTrue(resolver.isFinalized(1));
        assertTrue(factory.outcome(1));
    }

    // ============ Config Updates ============

    function test_setBondAmount() public {
        vm.prank(admin);
        resolver.setBondAmount(5000e18);
        assertEq(resolver.bondAmount(), 5000e18);
    }

    function test_setDisputeWindow() public {
        vm.prank(admin);
        resolver.setDisputeWindow(48 hours);
        assertEq(resolver.disputeWindow(), 48 hours);
    }
}
